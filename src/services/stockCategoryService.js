import { ForeignKeyConstraintError, Op, UniqueConstraintError } from 'sequelize';
import database from '../config/database.js';
import { StockCategory, StockItem } from '../models/stock.model.js';
import {
    MAX_STOCK_CATEGORY_DISPLAY_ORDER,
    validateStockCategoryInput,
} from '../validators/stockCategoryValidator.js';
import { findNextStockCategoryDisplayOrder } from '../utils/stockCategoryDisplayOrder.js';
import { StockError } from './stockService.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const parseCategoryId = (id) => {
    if (typeof id !== 'string' || !UUID_PATTERN.test(id)) {
        throw new StockError(400, 'A valid stock category ID is required.', 'VALIDATION_ERROR');
    }
};

const validatedValue = (result) => {
    if (result.error) throw new StockError(400, result.error, 'VALIDATION_ERROR');
    return result.value;
};

const assertUniqueCategoryName = async (name, exceptId, transaction) => {
    const existing = await StockCategory.findOne({
        where: database.sequelize.where(
            database.sequelize.fn('lower', database.sequelize.col('name')),
            name.toLowerCase(),
        ),
        transaction,
    });
    if (existing && existing.id !== exceptId) {
        throw new StockError(409, 'A stock category with this name already exists.', 'CONFLICT');
    }
};

const lockCategoryOrdering = (transaction) => database.sequelize.query(
    'LOCK TABLE "public"."stock_categories" IN SHARE ROW EXCLUSIVE MODE',
    { transaction },
);

const existingDisplayOrders = async (transaction) => {
    const categories = await StockCategory.findAll({
        attributes: ['displayOrder'],
        raw: true,
        transaction,
    });
    return categories.map((category) => Number(category.displayOrder));
};

const ensureDisplayOrderHasCapacity = (displayOrder) => {
    if (displayOrder > MAX_STOCK_CATEGORY_DISPLAY_ORDER) {
        throw new StockError(409, 'No available stock category display order remains.', 'CONFLICT');
    }
};

const mapUniqueCategoryError = (error) => {
    if (!(error instanceof UniqueConstraintError)) throw error;
    const fields = Array.isArray(error.fields) ? error.fields : Object.keys(error.fields || {});
    const constraint = error.original?.constraint || error.parent?.constraint || '';
    if (fields.includes('name') || constraint.includes('name')) {
        throw new StockError(409, 'A stock category with this name already exists.', 'CONFLICT');
    }
    if (fields.some((field) => ['displayOrder', 'display_order'].includes(field)) ||
        constraint.includes('display_order')) {
        throw new StockError(409, 'A stock category with this display order already exists.', 'CONFLICT');
    }
    throw new StockError(409, 'A stock category conflicts with an existing unique value.', 'CONFLICT');
};

const compactDisplayOrders = async (transaction) => database.sequelize.query(`
    WITH ordered_categories AS (
        SELECT "id", ROW_NUMBER() OVER (ORDER BY "display_order" ASC, "name" ASC, "id" ASC)::integer AS next_order
        FROM "public"."stock_categories"
    )
    UPDATE "public"."stock_categories" AS category
    SET "display_order" = ordered_categories.next_order
    FROM ordered_categories
    WHERE category."id" = ordered_categories."id"
      AND category."display_order" <> ordered_categories.next_order
`, { transaction });

const categoryWithItemCount = async (category, transaction) => ({
    ...category.toJSON(),
    itemCount: await StockItem.count({ where: { categoryId: category.id }, transaction }),
});

export const listStockCategories = async () => {
    const categories = await StockCategory.findAll({
        order: [['displayOrder', 'ASC'], ['name', 'ASC']],
    });
    return Promise.all(categories.map(categoryWithItemCount));
};

export const getStockCategory = async (id) => {
    parseCategoryId(id);
    const category = await StockCategory.findByPk(id);
    if (!category) throw new StockError(404, 'Stock category not found.', 'NOT_FOUND');
    return categoryWithItemCount(category);
};

export const createStockCategory = async (body) => {
    const value = validatedValue(validateStockCategoryInput(body));
    try {
        return await database.sequelize.transaction(async (transaction) => {
            await lockCategoryOrdering(transaction);
            await assertUniqueCategoryName(value.name, undefined, transaction);
            if (value.displayOrder === undefined) {
                value.displayOrder = findNextStockCategoryDisplayOrder(await existingDisplayOrders(transaction));
                ensureDisplayOrderHasCapacity(value.displayOrder);
            } else {
                const conflictingCategory = await StockCategory.findOne({
                    where: { displayOrder: value.displayOrder },
                    transaction,
                });
                if (conflictingCategory) {
                    const maximumOrder = await StockCategory.max('displayOrder', {
                        where: { displayOrder: { [Op.gte]: value.displayOrder } },
                        transaction,
                    });
                    ensureDisplayOrderHasCapacity(Number(maximumOrder) + 1);
                    await StockCategory.increment('displayOrder', {
                        by: 1,
                        where: { displayOrder: { [Op.gte]: value.displayOrder } },
                        transaction,
                    });
                }
            }
            const category = await StockCategory.create(value, { transaction });
            return categoryWithItemCount(category, transaction);
        });
    } catch (error) {
        mapUniqueCategoryError(error);
    }
};

export const updateStockCategory = async (id, body) => {
    parseCategoryId(id);
    const value = validatedValue(validateStockCategoryInput(body, true));
    return database.sequelize.transaction(async (transaction) => {
        await lockCategoryOrdering(transaction);
        const category = await StockCategory.findByPk(id, {
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        if (!category) throw new StockError(404, 'Stock category not found.', 'NOT_FOUND');
        const oldName = category.name;
        const oldDisplayOrder = Number(category.displayOrder);
        if (value.displayOrder !== undefined && value.displayOrder !== oldDisplayOrder) {
            if (value.displayOrder < oldDisplayOrder) {
                await StockCategory.increment('displayOrder', {
                    by: 1,
                    where: {
                        displayOrder: {
                            [Op.gte]: value.displayOrder,
                            [Op.lt]: oldDisplayOrder,
                        },
                    },
                    transaction,
                });
            } else {
                await StockCategory.decrement('displayOrder', {
                    by: 1,
                    where: {
                        displayOrder: {
                            [Op.gt]: oldDisplayOrder,
                            [Op.lte]: value.displayOrder,
                        },
                    },
                    transaction,
                });
            }
        }
        if (value.name && value.name !== oldName) {
            await assertUniqueCategoryName(value.name, category.id, transaction);
        }
        await category.update(value, { transaction });
        if (value.name && value.name !== oldName) {
            await StockItem.update(
                { category: value.name },
                { where: { categoryId: category.id }, transaction },
            );
        }
        return categoryWithItemCount(category, transaction);
    }).catch((error) => {
        mapUniqueCategoryError(error);
    });
};

export const deleteStockCategory = async (id) => {
    parseCategoryId(id);
    try {
        return await database.sequelize.transaction(async (transaction) => {
            await lockCategoryOrdering(transaction);
            const category = await StockCategory.findByPk(id, {
                transaction,
                lock: transaction.LOCK.UPDATE,
            });
            if (!category) throw new StockError(404, 'Stock category not found.', 'NOT_FOUND');
            const itemCount = await StockItem.count({
                where: { categoryId: category.id },
                transaction,
            });
            if (itemCount > 0) {
                throw new StockError(409, 'Reassign or archive all stock items before deleting this category.', 'CATEGORY_IN_USE');
            }
            await category.destroy({ transaction });
            await compactDisplayOrders(transaction);
            return { id: category.id, deleted: true };
        });
    } catch (error) {
        if (error instanceof ForeignKeyConstraintError) {
            throw new StockError(409, 'This category is still assigned to stock items.', 'CATEGORY_IN_USE');
        }
        mapUniqueCategoryError(error);
    }
};

