import { Op, UniqueConstraintError } from 'sequelize';
import database from '../config/database.js';
import { StockCategory, StockItem, StockMovement } from '../models/stock.model.js';
import {
    MAX_STOCK_QUANTITY,
    validateStockItemInput,
    validateStockMovementInput,
} from '../validators/stockValidator.js';
import { calculateWeightedAverageCost } from '../utils/stockCost.js';

export class StockError extends Error {
    constructor(statusCode, message, code = 'STOCK_ERROR') {
        super(message);
        this.name = 'StockError';
        this.statusCode = statusCode;
        this.code = code;
    }
}

const throwValidationError = (result) => {
    if (result.error) throw new StockError(400, result.error, 'VALIDATION_ERROR');
    return result.value;
};

const parsePagination = (query) => {
    const page = query.page === undefined ? 1 : Number(query.page);
    const limit = query.limit === undefined ? 20 : Number(query.limit);
    if (!Number.isInteger(page) || page < 1 ||
        !Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new StockError(400, 'Page must be positive and limit must be from 1 to 100.', 'VALIDATION_ERROR');
    }
    return { page, limit, offset: (page - 1) * limit };
};

const isNotFound = () => new StockError(404, 'Stock item not found.', 'NOT_FOUND');
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validateItemId = (id) => {
    if (typeof id !== 'string' || !UUID_PATTERN.test(id)) {
        throw new StockError(400, 'A valid stock item ID is required.', 'VALIDATION_ERROR');
    }
};
const uniqueStockItemError = (error) => {
    if (error instanceof UniqueConstraintError) {
        const fields = Array.isArray(error.fields) ? error.fields : Object.keys(error.fields || {});
        const constraint = error.original?.constraint || error.parent?.constraint || '';
        if (fields.includes('sku') || constraint.includes('sku')) {
            throw new StockError(409, 'A stock item with this SKU already exists.', 'CONFLICT');
        }
        if (fields.some((field) => ['itemCode', 'item_code'].includes(field)) || constraint.includes('item_code')) {
            throw new StockError(409, 'A stock item with this item code already exists.', 'CONFLICT');
        }
        throw new StockError(409, 'A stock item with a duplicate SKU or item code already exists.', 'CONFLICT');
    }
    throw error;
};

const resolveCategory = async (value, transaction) => {
    let category;
    if (value.categoryId) {
        category = await StockCategory.findByPk(value.categoryId, { transaction });
    } else if (value.category) {
        category = await StockCategory.findOne({
            where: database.sequelize.where(
                database.sequelize.fn('lower', database.sequelize.col('name')),
                value.category.toLowerCase(),
            ),
            transaction,
        });
    }
    if (!category) throw new StockError(400, 'Select an existing stock category.', 'VALIDATION_ERROR');
    return { categoryId: category.id, category: category.name };
};

const itemWhere = (query) => {
    const where = {};
    if (query.status === 'inactive') {
        where.isActive = false;
    } else if (query.status !== 'all') {
        where.isActive = true;
    }
    if (typeof query.category === 'string' && query.category.trim()) {
        where.category = query.category.trim();
    }
    if (typeof query.categoryId === 'string' && query.categoryId.trim()) {
        if (!UUID_PATTERN.test(query.categoryId)) {
            throw new StockError(400, 'A valid stock category ID is required.', 'VALIDATION_ERROR');
        }
        where.categoryId = query.categoryId;
    }
    if (typeof query.q === 'string' && query.q.trim()) {
        const pattern = `%${query.q.trim().slice(0, 100)}%`;
        where[Op.or] = [
            { name: { [Op.iLike]: pattern } },
            { itemCode: { [Op.iLike]: pattern } },
            { sku: { [Op.iLike]: pattern } },
            { category: { [Op.iLike]: pattern } },
        ];
    }
    if (query.status === 'low') {
        where.isActive = true;
        where.quantity = { [Op.gt]: 0, [Op.lte]: database.sequelize.col('reorderLevel') };
    } else if (query.status === 'out') {
        where.isActive = true;
        where.quantity = { [Op.lte]: 0 };
    }
    return where;
};

export const listStockItems = async (query) => {
    if (query.status !== undefined && !['active', 'all', 'inactive', 'low', 'out'].includes(query.status)) {
        throw new StockError(400, 'Status must be active, inactive, low, out, or all.', 'VALIDATION_ERROR');
    }
    const { page, limit, offset } = parsePagination(query);
    const { count, rows } = await StockItem.findAndCountAll({
        where: itemWhere(query),
        limit,
        offset,
        order: [['displayOrder', 'ASC'], ['name', 'ASC']],
    });
    return {
        items: rows,
        pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
    };
};

export const getStockSummary = async () => {
    const now = new Date();
    const dateParts = new Intl.DateTimeFormat('en-US', {
        timeZone: process.env.STOCK_TIME_ZONE || 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(now);
    const getPart = (type) => Number(dateParts.find((part) => part.type === type)?.value);
    const midnightUtc = Date.UTC(getPart('year'), getPart('month') - 1, getPart('day'));
    const atMidnightGuess = new Intl.DateTimeFormat('en-US', {
        timeZone: process.env.STOCK_TIME_ZONE || 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(new Date(midnightUtc));
    const localAtGuess = Date.UTC(
        Number(atMidnightGuess.find((part) => part.type === 'year')?.value),
        Number(atMidnightGuess.find((part) => part.type === 'month')?.value) - 1,
        Number(atMidnightGuess.find((part) => part.type === 'day')?.value),
        Number(atMidnightGuess.find((part) => part.type === 'hour')?.value),
        Number(atMidnightGuess.find((part) => part.type === 'minute')?.value),
        Number(atMidnightGuess.find((part) => part.type === 'second')?.value),
    );
    const todayStart = new Date(midnightUtc - (localAtGuess - midnightUtc));
    const items = await StockItem.findAll({
        attributes: ['quantity', 'reorderLevel', 'unitCost', 'isActive'],
    });
    const summary = items.reduce((total, item) => {
        total.totalItems += 1;
        if (!item.isActive) return total;
        const quantity = Number(item.quantity);
        const reorderLevel = Number(item.reorderLevel);
        if (quantity <= 0) total.outOfStock += 1;
        else if (reorderLevel > 0 && quantity <= reorderLevel) total.lowStock += 1;
        total.stockValue += quantity * Number(item.unitCost);
        return total;
    }, { totalItems: 0, lowStock: 0, outOfStock: 0, stockValue: 0 });
    const [recentMovements, todayIssues] = await Promise.all([
        StockMovement.findAll({
            limit: 6,
            order: [['createdAt', 'DESC']],
            include: [{ model: StockItem, as: 'item', attributes: ['id', 'name', 'unit'] }],
        }),
        StockMovement.findAll({
            where: { type: 'out', createdAt: { [Op.gte]: todayStart } },
            attributes: ['stockItemId', 'quantity'],
            include: [{ model: StockItem, as: 'item', attributes: ['id', 'name', 'unit'] }],
        }),
    ]);
    const usageByItem = new Map();
    for (const movement of todayIssues) {
        const current = usageByItem.get(movement.stockItemId) || {
            itemId: movement.stockItemId,
            name: movement.item.name,
            unit: movement.item.unit,
            quantity: 0,
        };
        current.quantity += Number(movement.quantity);
        usageByItem.set(movement.stockItemId, current);
    }
    const dailyUsage = [...usageByItem.values()]
        .map((usage) => ({ ...usage, quantity: Math.round(usage.quantity * 1000) / 1000 }))
        .sort((left, right) => left.name.localeCompare(right.name));
    return {
        ...summary,
        stockValue: Math.round(summary.stockValue * 100) / 100,
        dailyUsedItems: dailyUsage.length,
        dailyUsage,
        recentMovements,
    };
};

export const getStockItem = async (id) => {
    validateItemId(id);
    const item = await StockItem.findByPk(id);
    if (!item) throw isNotFound();
    return item;
};

export const createStockItem = async (body) => {
    const value = throwValidationError(validateStockItemInput(body));
    try {
        const category = await resolveCategory(value);
        return await StockItem.create({ ...value, ...category });
    } catch (error) {
        uniqueStockItemError(error);
    }
};

export const updateStockItem = async (id, body) => {
    validateItemId(id);
    const value = throwValidationError(validateStockItemInput(body, true));
    const item = await StockItem.findByPk(id);
    if (!item) throw isNotFound();
    try {
        const category = value.categoryId || value.category
            ? await resolveCategory(value)
            : {};
        await item.update({ ...value, ...category });
        return item;
    } catch (error) {
        uniqueStockItemError(error);
    }
};

export const archiveStockItem = async (id) => {
    validateItemId(id);
    const item = await StockItem.findByPk(id);
    if (!item) throw isNotFound();
    await item.update({ isActive: false });
    return item;
};

export const restoreStockItem = async (id) => {
    validateItemId(id);
    const item = await StockItem.findByPk(id);
    if (!item) throw isNotFound();
    await item.update({ isActive: true });
    return item;
};

export const createStockMovement = async ({ itemId, body, actorUserId }) => {
    validateItemId(itemId);
    const value = throwValidationError(validateStockMovementInput(body));
    return database.sequelize.transaction(async (transaction) => {
        const item = await StockItem.findByPk(itemId, {
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        if (!item || !item.isActive) throw isNotFound();

        const beforeUnits = Math.round(Number(item.quantity) * 1000);
        const inputUnits = Math.round(value.quantity * 1000);
        const afterUnits = value.type === 'in'
            ? beforeUnits + inputUnits
            : value.type === 'out'
                ? beforeUnits - inputUnits
                : inputUnits;
        if (afterUnits < 0) {
            throw new StockError(400, 'The requested stock issue exceeds the available quantity.', 'INSUFFICIENT_STOCK');
        }
        if (afterUnits > Math.round(MAX_STOCK_QUANTITY * 1000)) {
            throw new StockError(400, 'The resulting stock quantity is too large.', 'VALIDATION_ERROR');
        }

        const beforeQuantity = beforeUnits / 1000;
        const afterQuantity = afterUnits / 1000;
        const changes = { quantity: afterQuantity };
        if (value.type === 'in') {
            changes.unitCost = calculateWeightedAverageCost(
                beforeQuantity,
                Number(item.unitCost),
                value.quantity,
                value.unitCost,
            );
        }
        await item.update(changes, { transaction });
        const movement = await StockMovement.create({
            stockItemId: item.id,
            type: value.type,
            quantity: value.quantity,
            unitCost: value.type === 'in' ? value.unitCost : null,
            change: (afterUnits - beforeUnits) / 1000,
            beforeQuantity,
            afterQuantity,
            unit: item.unit,
            reason: value.reason,
            actorUserId,
        }, { transaction });
        return { item, movement };
    });
};

export const listStockMovements = async (query) => {
    const { page, limit, offset } = parsePagination(query);
    const where = {};
    if (typeof query.itemId === 'string' && query.itemId) {
        validateItemId(query.itemId);
        where.stockItemId = query.itemId;
    }
    if (typeof query.type === 'string' && query.type) {
        if (!['in', 'out', 'count'].includes(query.type)) {
            throw new StockError(400, 'Movement type must be in, out, or count.', 'VALIDATION_ERROR');
        }
        where.type = query.type;
    }
    const { count, rows } = await StockMovement.findAndCountAll({
        where,
        limit,
        offset,
        order: [['createdAt', 'DESC']],
        include: [{ model: StockItem, as: 'item', attributes: ['id', 'name', 'sku', 'unit'] }],
    });
    return {
        movements: rows,
        pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
    };
};


