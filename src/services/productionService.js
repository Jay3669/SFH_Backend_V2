import crypto from 'node:crypto';
import { Op, UniqueConstraintError } from 'sequelize';
import database from '../config/database.js';
import MenuCategory from '../models/menuCategory.model.js';
import { getApplicationSettingsRecord } from './applicationSettingsService.js';
import { StockItem, StockMovement } from '../models/stock.model.js';
import {
    MenuItem,
    OperatingExpense,
    ProductionCancellation,
    ProductionCostDetail,
    ProductionDay,
    ProductionDayItem,
    ProductionIngredient,
    ProductionRecord,
    ProductionRecovery,
    ProductionSale,
    ProductionSaleItem,
    Recipe,
    RecipeIngredient,
    RecipeVersion,
} from '../models/production.model.js';
import {
    calculateProductionCosts,
    calculateProductionScaling,
    convertQuantity,
    ProductionMathError,
    toScaledInteger,
} from '../utils/productionMath.js';
import { calculateProductionDayFinancials } from '../utils/productionFinance.js';
import {
    validateCancellationInput,
    validateMenuItemInput,
    validateOperatingExpenseInput,
    validateProductionDayInput,
    validateProductionInput,
    validateProductionSaleInput,
    validateRecipeVersionInput,
    validateYieldInput,
} from '../validators/productionValidator.js';

const MAX_STOCK_QUANTITY = 99_999_999_999.999;
const MAX_MONEY_CENTS = 99_999_999_999_999n;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isDateOnly = (value) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export class ProductionError extends Error {
    constructor(statusCode, message, code = 'PRODUCTION_ERROR') {
        super(message);
        this.name = 'ProductionError';
        this.statusCode = statusCode;
        this.code = code;
    }
}

const validate = (result) => {
    if (result.error) throw new ProductionError(400, result.error, 'VALIDATION_ERROR');
    return result.value;
};

const convertMathError = (error) => {
    if (error instanceof ProductionMathError) {
        throw new ProductionError(400, error.message, 'VALIDATION_ERROR');
    }
    throw error;
};

const parsePagination = (query) => {
    const page = query.page === undefined ? 1 : Number(query.page);
    const limit = query.limit === undefined ? 20 : Number(query.limit);
    if (!Number.isInteger(page) || page < 1 ||
        !Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new ProductionError(400, 'Page must be positive and limit must be from 1 to 100.', 'VALIDATION_ERROR');
    }
    return { page, limit, offset: (page - 1) * limit };
};

const validateId = (id, label) => {
    if (typeof id !== 'string' || !UUID_PATTERN.test(id)) {
        throw new ProductionError(400, `A valid ${label} ID is required.`, 'VALIDATION_ERROR');
    }
};

const notFound = (message) => new ProductionError(404, message, 'NOT_FOUND');
const conflict = (message) => new ProductionError(409, message, 'CONFLICT');
const moneyCents = (value, label = 'Amount') => toScaledInteger(value, 2, label);
const fromCents = (value) => Number(value) / 100;
const roundQuantity = (value) => Math.round(value * 1000) / 1000;
const roundMoney = (value) => Math.round(value * 100) / 100;

const lockProductionDay = async (productionDate, transaction) => {
    await ProductionDay.findOrCreate({
        where: { productionDate },
        defaults: { productionDate },
        transaction,
    });
    const day = await ProductionDay.findByPk(productionDate, {
        transaction,
        lock: transaction.LOCK.UPDATE,
    });
    if (!day) throw new ProductionError(503, 'The production day could not be initialized.');
    return day;
};

const recipeInclude = {
    model: RecipeIngredient,
    as: 'ingredients',
    include: [{ model: StockItem, as: 'stockItem' }],
};

const getRecipeBundle = async (recipeId, options = {}) => {
    validateId(recipeId, 'recipe');
    const recipe = await Recipe.findByPk(recipeId, {
        ...options,
        include: [{ model: MenuItem, as: 'menuItem' }],
    });
    if (!recipe) throw notFound('Recipe not found.');
    if (recipe.isArchived || !recipe.menuItem?.isActive) {
        throw new ProductionError(409, 'This recipe is archived or its menu item is inactive.', 'RECIPE_INACTIVE');
    }
    const version = await RecipeVersion.findOne({
        where: { recipeId: recipe.id, version: recipe.currentVersion },
        ...options,
        include: [recipeInclude],
    });
    if (!version) throw new ProductionError(503, 'The current recipe version is unavailable.');
    return { recipe, version };
};

const getRecipeByVersion = async (versionId, options = {}) => {
    validateId(versionId, 'recipe version');
    const version = await RecipeVersion.findByPk(versionId, {
        ...options,
        include: [
            { model: Recipe, as: 'recipe', include: [{ model: MenuItem, as: 'menuItem' }] },
            recipeInclude,
        ],
    });
    if (!version) throw notFound('Recipe version not found.');
    return version;
};

const verifyIngredients = async (ingredients, transaction) => {
    const ids = ingredients.map((ingredient) => ingredient.stockItemId);
    const stockItems = await StockItem.findAll({
        where: { id: ids },
        transaction,
        order: [['id', 'ASC']],
    });
    if (stockItems.length !== ids.length) {
        throw new ProductionError(400, 'One or more recipe ingredients reference missing stock items.', 'VALIDATION_ERROR');
    }
    const byId = new Map(stockItems.map((item) => [item.id, item]));
    const rows = ingredients.map((ingredient) => {
        const stockItem = byId.get(ingredient.stockItemId);
        if (!stockItem.isActive) {
            throw new ProductionError(400, `Stock item "${stockItem.name}" is inactive.`, 'INACTIVE_STOCK_ITEM');
        }
        try {
            if (convertQuantity(ingredient.quantity, ingredient.unit, stockItem.unit) < 0.001) {
                throw new ProductionMathError('Ingredient quantity is below the stock unit precision.');
            }
        } catch (error) {
            convertMathError(error);
        }
        return { ...ingredient, stockItem };
    });
    return rows;
};

const createRecipeVersion = async ({ recipe, value, actorUserId, transaction, versionNumber }) => {
    const stockIngredients = await verifyIngredients(value.ingredients, transaction);
    try {
        calculateProductionScaling({
            baseProductionQuantity: value.baseProductionQuantity,
            baseProductionUnit: value.baseProductionUnit,
            requestedQuantity: value.baseProductionQuantity,
            expectedPlateCount: value.expectedPlateCount,
            recipeWastagePercentage: value.wastagePercentage,
            ingredients: stockIngredients.map((ingredient) => ({
                quantity: ingredient.quantity,
                unit: ingredient.unit,
                stockUnit: ingredient.stockItem.unit,
                unitCost: ingredient.stockItem.unitCost,
                balance: ingredient.stockItem.quantity,
                wastagePercentage: ingredient.wastagePercentage,
            })),
        });
    } catch (error) {
        convertMathError(error);
    }

    const nextVersion = versionNumber || recipe.currentVersion + 1;
    const version = await RecipeVersion.create({
        recipeId: recipe.id,
        version: nextVersion,
        baseProductionQuantity: value.baseProductionQuantity,
        baseProductionUnit: value.baseProductionUnit.trim().toLowerCase(),
        expectedPlateCount: value.expectedPlateCount,
        servingSize: value.servingSize,
        servingUnit: value.servingUnit?.trim().toLowerCase() || null,
        preparationInstructions: value.preparationInstructions,
        cookingTimeMinutes: value.cookingTimeMinutes,
        wastagePercentage: value.wastagePercentage,
        createdBy: actorUserId,
        updatedBy: actorUserId,
    }, { transaction });
    await RecipeIngredient.bulkCreate(stockIngredients.map((ingredient) => ({
        recipeVersionId: version.id,
        stockItemId: ingredient.stockItemId,
        quantity: ingredient.quantity,
        unit: ingredient.unit.trim().toLowerCase(),
        preparationNotes: ingredient.preparationNotes,
        wastagePercentage: ingredient.wastagePercentage,
    })), { transaction });
    await recipe.update({ currentVersion: nextVersion, updatedBy: actorUserId }, { transaction });
    return version;
};

const buildScaling = (version, requestedQuantity, requestedUnit, stockOverrides) => {
    const ingredientInputs = version.ingredients.map((ingredient) => {
        const stockItem = stockOverrides?.get(ingredient.stockItemId) || ingredient.stockItem;
        if (!stockItem || !stockItem.isActive) {
            throw new ProductionError(
                409,
                `Stock item "${stockItem?.name || ingredient.stockItemId}" is inactive or unavailable.`,
                'INACTIVE_STOCK_ITEM',
            );
        }
        return {
            quantity: ingredient.quantity,
            unit: ingredient.unit,
            stockUnit: stockItem.unit,
            unitCost: stockItem.unitCost,
            balance: stockItem.quantity,
            wastagePercentage: ingredient.wastagePercentage,
            stockItem,
            recipeIngredientId: ingredient.id,
        };
    });
    try {
        const scaling = calculateProductionScaling({
            baseProductionQuantity: version.baseProductionQuantity,
            baseProductionUnit: version.baseProductionUnit,
            requestedQuantity,
            requestedUnit: requestedUnit || version.baseProductionUnit,
            expectedPlateCount: version.expectedPlateCount,
            recipeWastagePercentage: version.wastagePercentage,
            ingredients: ingredientInputs,
        });
        const ingredients = scaling.ingredients.map((scaled, index) => ({
            ...scaled,
            stockItem: ingredientInputs[index].stockItem,
            recipeIngredientId: ingredientInputs[index].recipeIngredientId,
            ingredientName: ingredientInputs[index].stockItem.name,
        }));
        return { ...scaling, ingredients };
    } catch (error) {
        convertMathError(error);
    }
};

const buildPreviewResponse = ({ recipe, version, value, stockOverrides }) => {
    const scaling = buildScaling(version, value.quantity, value.unit, stockOverrides);
    let costs;
    try {
        costs = calculateProductionCosts({
            ingredients: scaling.ingredients,
            additionalCosts: value.additionalCosts,
            productionQuantity: scaling.productionQuantity,
            productionUnit: scaling.productionUnit,
            expectedPlateCount: scaling.expectedPlateCount,
        });
    } catch (error) {
        convertMathError(error);
    }
    const ingredients = scaling.ingredients.map((ingredient) => ({
        stockItemId: ingredient.stockItem.id,
        ingredientName: ingredient.ingredientName,
        unit: ingredient.unit,
        theoreticalQuantity: ingredient.theoreticalQuantity,
        quantityDeducted: ingredient.quantityDeducted,
        availableQuantity: ingredient.stockItem.quantity,
        balanceAfter: ingredient.balanceAfterMilli < 0n ? null : Number(ingredient.balanceAfterMilli) / 1000,
        unitCost: ingredient.unitCost,
        totalCost: ingredient.totalCost,
        sufficient: ingredient.balanceAfterMilli >= 0n,
    }));
    return {
        recipe: {
            id: recipe.id,
            name: recipe.name,
            currentVersion: version.version,
            menuItem: recipe.menuItem,
        },
        productionQuantity: scaling.productionQuantity,
        productionUnit: scaling.productionUnit,
        productionDate: value.productionDate,
        expectedPlateCount: scaling.expectedPlateCount,
        sellingPricePerPlate: Number(recipe.menuItem.price),
        expectedSalesAmount: roundMoney(Number(recipe.menuItem.price) * scaling.expectedPlateCount),
        expectedProfit: roundMoney(
            (Number(recipe.menuItem.price) * scaling.expectedPlateCount) - costs.totalProductionCost,
        ),
        ingredients,
        additionalCosts: value.additionalCosts,
        ...costs,
        canProduce: ingredients.every((ingredient) => ingredient.sufficient),
        shortages: ingredients.filter((ingredient) => !ingredient.sufficient).map((ingredient) => ({
            stockItemId: ingredient.stockItemId,
            ingredientName: ingredient.ingredientName,
            requiredQuantity: ingredient.quantityDeducted,
            availableQuantity: ingredient.availableQuantity,
            unit: ingredient.unit,
        })),
    };
};

const productionDetailInclude = [
    { model: MenuItem, as: 'menuItem' },
    { model: RecipeVersion, as: 'recipeVersion' },
    { model: ProductionIngredient, as: 'ingredients', include: [{ model: StockItem, as: 'stockItem' }] },
    { model: ProductionCostDetail, as: 'additionalCosts' },
    {
        model: ProductionCancellation,
        as: 'cancellation',
        include: [{ model: ProductionRecovery, as: 'recoveries', include: [{ model: ProductionIngredient, as: 'productionIngredient' }] }],
    },
];

const getProductionDetail = async (id, options = {}) => {
    validateId(id, 'production');
    const record = await ProductionRecord.findByPk(id, { ...options, include: productionDetailInclude });
    if (!record) throw notFound('Production record not found.');
    return record;
};

export const getProductionRecord = (id) => getProductionDetail(id);

const requestFingerprint = (value, actorUserId) => crypto.createHash('sha256')
    .update(JSON.stringify({
        actorUserId,
        recipeId: value.recipeId,
        quantity: value.quantity,
        unit: value.unit || null,
        productionDate: value.productionDate,
        actualPlateCount: value.actualPlateCount,
        notes: value.notes,
        additionalCosts: [...value.additionalCosts].sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .digest('hex');

const getExistingIdempotentProduction = async (idempotencyKey, actorUserId, requestHash) => {
    const existing = await ProductionRecord.findOne({
        where: { idempotencyKey },
        attributes: ['id', 'preparedBy', 'requestHash'],
    });
    if (!existing) return null;
    if (existing.preparedBy !== actorUserId) {
        throw conflict('This idempotency key is already associated with another request.');
    }
    if (existing.requestHash !== requestHash) {
        throw conflict('This idempotency key was already used with different production data.');
    }
    return getProductionDetail(existing.id);
};

export const listMenuItems = async (query) => {
    const { page, limit, offset } = parsePagination(query);
    const where = {};
    if (query.status !== undefined && !['active', 'inactive', 'all'].includes(query.status)) {
        throw new ProductionError(400, 'status must be active, inactive, or all.', 'VALIDATION_ERROR');
    }
    if (query.status === 'inactive') where.isActive = false;
    else if (query.status !== 'all') where.isActive = true;
    if (typeof query.q === 'string' && query.q.trim()) {
        where[Op.or] = [
            { name: { [Op.iLike]: `%${query.q.trim().slice(0, 100)}%` } },
            { category: { [Op.iLike]: `%${query.q.trim().slice(0, 100)}%` } },
        ];
    }
    const { count, rows } = await MenuItem.findAndCountAll({
        where,
        limit,
        offset,
        order: [['displayOrder', 'ASC'], ['name', 'ASC'], ['id', 'ASC']],
        include: [{ model: Recipe, as: 'recipe', required: false }],
    });
    return { items: rows, pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) } };
};

export const listProductionStockItems = async () => StockItem.findAll({
    where: { isActive: true },
    attributes: ['id', 'name', 'sku', 'categoryId', 'category', 'unit', 'quantity', 'unitCost', 'isActive'],
    order: [['name', 'ASC']],
});

const resolveMenuCategory = async (value, transaction) => {
    const options = { transaction, lock: transaction.LOCK.UPDATE };
    const category = value.categoryId
        ? await MenuCategory.findOne({
            where: { id: value.categoryId, isActive: true },
            ...options,
        })
        : await MenuCategory.findOne({
            where: database.sequelize.where(
                database.sequelize.fn('lower', database.sequelize.col('name')),
                value.category.toLowerCase(),
            ),
            ...options,
        });
    if (!category || !category.isActive) {
        throw new ProductionError(400, 'Select an active existing menu category.', 'VALIDATION_ERROR');
    }
    return { categoryId: category.id, category: category.name };
};

export const createMenuItem = async (body) => {
    const value = validate(validateMenuItemInput(body));
    return database.sequelize.transaction(async (transaction) => {
        const category = await resolveMenuCategory(value, transaction);
        return MenuItem.create({ ...value, ...category }, { transaction });
    });
};

export const updateMenuItem = async (id, body) => {
    validateId(id, 'menu item');
    const value = validate(validateMenuItemInput(body, true));
    return database.sequelize.transaction(async (transaction) => {
        const category = value.categoryId || value.category
            ? await resolveMenuCategory(value, transaction)
            : {};
        const item = await MenuItem.findByPk(id, {
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        if (!item) throw notFound('Menu item not found.');
        await item.update({ ...value, ...category }, { transaction });
        return item;
    });
};

export const listRecipes = async (query) => {
    const { page, limit, offset } = parsePagination(query);
    const where = {};
    if (query.status !== undefined && !['active', 'archived', 'all'].includes(query.status)) {
        throw new ProductionError(400, 'status must be active, archived, or all.', 'VALIDATION_ERROR');
    }
    if (query.status === 'archived') where.isArchived = true;
    else if (query.status !== 'all') where.isArchived = false;
    const { count, rows } = await Recipe.findAndCountAll({
        where,
        limit,
        offset,
        order: [['updatedAt', 'DESC']],
        include: [{ model: MenuItem, as: 'menuItem' }],
    });
    const versions = rows.length
        ? await RecipeVersion.findAll({
            where: {
                [Op.or]: rows.map((recipe) => ({ recipeId: recipe.id, version: recipe.currentVersion })),
            },
            include: [recipeInclude],
        })
        : [];
    const versionByRecipe = new Map(versions.map((version) => [version.recipeId, version]));
    const items = rows.map((recipe) => ({
        ...recipe.toJSON(),
        current: versionByRecipe.get(recipe.id) || null,
    }));
    return { items, pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) } };
};

export const getRecipe = async (id) => {
    const { recipe, version } = await getRecipeBundle(id);
    const fullVersion = await RecipeVersion.findByPk(version.id, { include: [recipeInclude] });
    return { ...recipe.toJSON(), current: fullVersion };
};

export const createRecipe = async (body, actorUserId) => {
    const value = validate(validateRecipeVersionInput(body, true));
    return database.sequelize.transaction(async (transaction) => {
        const menuItem = await MenuItem.findByPk(value.menuItemId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!menuItem || !menuItem.isActive) throw notFound('An active menu item is required to create a recipe.');
        const existing = await Recipe.findOne({ where: { menuItemId: menuItem.id }, transaction });
        if (existing) throw conflict('This menu item already has a recipe. Add a new recipe version instead.');
        const recipe = await Recipe.create({
            menuItemId: menuItem.id,
            name: value.name,
            currentVersion: 1,
            createdBy: actorUserId,
            updatedBy: actorUserId,
        }, { transaction });
        const version = await createRecipeVersion({ recipe, value, actorUserId, transaction, versionNumber: 1 });
        return getRecipeDetailWithOptions(recipe.id, { transaction, versionId: version.id });
    });
};

const getRecipeDetailWithOptions = async (recipeId, options = {}) => {
    const { transaction, versionId } = options;
    const recipe = await Recipe.findByPk(recipeId, {
        transaction,
        include: [{ model: MenuItem, as: 'menuItem' }],
    });
    const version = await RecipeVersion.findOne({
        where: versionId ? { id: versionId } : { recipeId, version: recipe.currentVersion },
        transaction,
        include: [recipeInclude],
    });
    return { ...recipe.toJSON(), current: version };
};

export const createRecipeVersionForRecipe = async (recipeId, body, actorUserId) => {
    validateId(recipeId, 'recipe');
    const value = validate(validateRecipeVersionInput(body));
    return database.sequelize.transaction(async (transaction) => {
        const recipe = await Recipe.findByPk(recipeId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!recipe) throw notFound('Recipe not found.');
        if (recipe.isArchived) throw conflict('Restore the recipe before creating a new version.');
        const version = await createRecipeVersion({ recipe, value, actorUserId, transaction });
        return getRecipeDetailWithOptions(recipe.id, { transaction, versionId: version.id });
    });
};

export const archiveRecipe = async (id, isArchived) => {
    validateId(id, 'recipe');
    if (typeof isArchived !== 'boolean') throw new ProductionError(400, 'isArchived must be a boolean.', 'VALIDATION_ERROR');
    const recipe = await Recipe.findByPk(id, { include: [{ model: MenuItem, as: 'menuItem' }] });
    if (!recipe) throw notFound('Recipe not found.');
    await recipe.update({ isArchived });
    return recipe;
};

export const previewProduction = async (body) => {
    const value = validate(validateProductionInput(body, true));
    const { recipe, version } = await getRecipeBundle(value.recipeId);
    return buildPreviewResponse({ recipe, version, value });
};

export const confirmProduction = async (body, actorUserId) => {
    const value = validate(validateProductionInput(body));
    const requestHash = requestFingerprint(value, actorUserId);
    const existing = await getExistingIdempotentProduction(value.idempotencyKey, actorUserId, requestHash);
    if (existing) return { production: existing, duplicate: true };

    try {
        const production = await database.sequelize.transaction(async (transaction) => {
            const day = await lockProductionDay(value.productionDate, transaction);
            if (day.isClosed) throw conflict('Production for this date is already closed.');
            const recipe = await Recipe.findByPk(value.recipeId, {
                transaction,
                lock: { level: transaction.LOCK.UPDATE, of: Recipe },
                include: [{ model: MenuItem, as: 'menuItem' }],
            });
            if (!recipe || recipe.isArchived || !recipe.menuItem?.isActive) {
                throw notFound('An active recipe is required to confirm production.');
            }
            const version = await RecipeVersion.findOne({
                where: { recipeId: recipe.id, version: recipe.currentVersion },
                transaction,
                include: [recipeInclude],
            });
            if (!version) throw new ProductionError(503, 'The current recipe version is unavailable.');

            const stockIds = version.ingredients.map((ingredient) => ingredient.stockItemId).sort();
            const lockedItems = await StockItem.findAll({
                where: { id: stockIds },
                transaction,
                lock: transaction.LOCK.UPDATE,
                order: [['id', 'ASC']],
            });
            if (lockedItems.length !== stockIds.length) {
                throw new ProductionError(409, 'A recipe stock item no longer exists.', 'STOCK_ITEM_UNAVAILABLE');
            }
            const stockOverrides = new Map(lockedItems.map((item) => [item.id, item]));
            const preview = buildPreviewResponse({ recipe, version, value, stockOverrides });
            if (!preview.canProduce) {
                throw new ProductionError(409, 'Insufficient stock to confirm this production.', 'INSUFFICIENT_STOCK');
            }

            const id = crypto.randomUUID();
            const reference = `PRD-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${id.slice(0, 8).toUpperCase()}`;
            const record = await ProductionRecord.create({
                id,
                reference,
                idempotencyKey: value.idempotencyKey,
                requestHash,
                menuItemId: recipe.menuItemId,
                recipeVersionId: version.id,
                productionDate: value.productionDate,
                productionQuantity: preview.productionQuantity,
                productionUnit: preview.productionUnit,
                expectedPlateCount: preview.expectedPlateCount,
                actualPlateCount: value.actualPlateCount,
                sellingPricePerPlate: preview.sellingPricePerPlate,
                totalIngredientCost: preview.totalIngredientCost,
                additionalCost: preview.additionalCost,
                totalProductionCost: preview.totalProductionCost,
                costPerKg: preview.costPerKg,
                costPerPlate: preview.costPerPlate,
                notes: value.notes,
                preparedBy: actorUserId,
                status: 'confirmed',
            }, { transaction });

            const ingredientRows = [];
            for (let index = 0; index < version.ingredients.length; index += 1) {
                const recipeIngredient = version.ingredients[index];
                const calculated = preview.ingredients[index];
                const stockItem = stockOverrides.get(recipeIngredient.stockItemId);
                const beforeMilli = toScaledInteger(stockItem.quantity, 3, 'Stock balance');
                const deductedMilli = toScaledInteger(calculated.quantityDeducted, 3, 'Production quantity');
                const afterMilli = beforeMilli - deductedMilli;
                if (afterMilli < 0n) {
                    throw new ProductionError(409, 'Insufficient stock to confirm this production.', 'INSUFFICIENT_STOCK');
                }
                const beforeQuantity = Number(beforeMilli) / 1000;
                const afterQuantity = Number(afterMilli) / 1000;
                await stockItem.update({ quantity: afterQuantity }, { transaction });
                const movement = await StockMovement.create({
                    stockItemId: stockItem.id,
                    type: 'out',
                    quantity: calculated.quantityDeducted,
                    unitCost: calculated.unitCost,
                    change: -calculated.quantityDeducted,
                    beforeQuantity,
                    afterQuantity,
                    unit: stockItem.unit,
                    reason: `Production ${reference}`,
                    actorUserId,
                    referenceType: 'production',
                    referenceId: record.id,
                    totalCost: calculated.totalCost,
                }, { transaction });
                ingredientRows.push({
                    productionRecordId: record.id,
                    recipeIngredientId: recipeIngredient.id,
                    stockItemId: stockItem.id,
                    ingredientName: stockItem.name,
                    theoreticalQuantity: calculated.theoreticalQuantity,
                    quantityDeducted: calculated.quantityDeducted,
                    unit: stockItem.unit,
                    wastagePercentage: recipeIngredient.wastagePercentage,
                    recipeWastagePercentage: version.wastagePercentage,
                    unitCost: calculated.unitCost,
                    totalCost: calculated.totalCost,
                    balanceAfter: afterQuantity,
                    stockMovementId: movement.id,
                });
            }
            await ProductionIngredient.bulkCreate(ingredientRows, { transaction });
            if (value.additionalCosts.length) {
                await ProductionCostDetail.bulkCreate(value.additionalCosts.map((cost) => ({
                    productionRecordId: record.id,
                    name: cost.name,
                    amount: cost.amount,
                })), { transaction });
            }
            return record.id;
        });
        return { production: await getProductionDetail(production), duplicate: false };
    } catch (error) {
        if (!(error instanceof UniqueConstraintError) &&
            error.name !== 'SequelizeUniqueConstraintError') throw error;
        const duplicate = await getExistingIdempotentProduction(value.idempotencyKey, actorUserId, requestHash);
        if (duplicate) return { production: duplicate, duplicate: true };
        throw conflict('This production request conflicts with an existing record.');
    }
};

const getProductionDate = (query) => {
    const productionDate = query.productionDate || query.date || new Date().toISOString().slice(0, 10);
    if (!isDateOnly(productionDate)) {
        throw new ProductionError(400, 'productionDate must be a valid YYYY-MM-DD date.', 'VALIDATION_ERROR');
    }
    return productionDate;
};

const platesForRecord = (record) => Number(record.actualPlateCount ?? record.expectedPlateCount);

export const getProductionAvailability = async (query) => {
    const productionDate = getProductionDate(query);
    const day = await ProductionDay.findByPk(productionDate);
    const records = await ProductionRecord.findAll({
        where: { productionDate, status: 'confirmed' },
        include: [{
            model: MenuItem,
            as: 'menuItem',
            attributes: ['id', 'name', 'category', 'categoryId', 'price', 'imageUrl', 'isActive'],
            required: true,
        }],
        order: [['createdAt', 'ASC'], ['id', 'ASC']],
    });
    const recordIds = records.map((record) => record.id);
    const saleRows = recordIds.length
        ? await ProductionSaleItem.findAll({
            where: { productionRecordId: recordIds },
            attributes: ['productionRecordId', 'quantity', 'totalPrice'],
        })
        : [];
    const soldByRecord = new Map();
    const salesRevenueByMenu = new Map();
    for (const row of saleRows) {
        soldByRecord.set(
            row.productionRecordId,
            (soldByRecord.get(row.productionRecordId) || 0) + Number(row.quantity),
        );
        const record = records.find((item) => item.id === row.productionRecordId);
        if (record) {
            salesRevenueByMenu.set(
                record.menuItemId,
                (salesRevenueByMenu.get(record.menuItemId) || 0) + Number(row.totalPrice),
            );
        }
    }
    const byMenuItem = new Map();
    for (const record of records) {
        const current = byMenuItem.get(record.menuItemId) || {
            menuItemId: record.menuItemId,
            name: record.menuItem.name,
            category: record.menuItem.category,
            categoryId: record.menuItem.categoryId,
            imageUrl: record.menuItem.imageUrl,
            price: Number(record.menuItem.price),
            producedPlates: 0,
            soldPlates: 0,
            availablePlates: 0,
            productionCost: 0,
            expectedSales: 0,
            salesRevenue: 0,
        };
        const produced = platesForRecord(record);
        const sold = soldByRecord.get(record.id) || 0;
        current.producedPlates += produced;
        current.soldPlates += sold;
        current.availablePlates += Math.max(0, produced - sold);
        current.productionCost += Number(record.totalProductionCost);
        current.expectedSales += Number(record.sellingPricePerPlate) * produced;
        current.salesRevenue = salesRevenueByMenu.get(record.menuItemId) || 0;
        byMenuItem.set(record.menuItemId, current);
    }
    const items = [...byMenuItem.values()].map((item) => ({
        ...item,
        producedPlates: roundQuantity(item.producedPlates),
        soldPlates: roundQuantity(item.soldPlates),
        availablePlates: day?.isClosed ? 0 : roundQuantity(item.availablePlates),
        productionCost: roundMoney(item.productionCost),
        expectedSales: roundMoney(item.expectedSales),
        expectedProfit: roundMoney(item.expectedSales - item.productionCost),
        salesRevenue: roundMoney(item.salesRevenue),
    }));
    return {
        productionDate,
        isClosed: Boolean(day?.isClosed),
        summary: {
            producedPlates: roundQuantity(items.reduce((total, item) => total + item.producedPlates, 0)),
            soldPlates: roundQuantity(items.reduce((total, item) => total + item.soldPlates, 0)),
            availablePlates: roundQuantity(items.reduce((total, item) => total + item.availablePlates, 0)),
            productionCost: roundMoney(items.reduce((total, item) => total + item.productionCost, 0)),
            expectedSales: roundMoney(items.reduce((total, item) => total + item.expectedSales, 0)),
            actualSales: roundMoney(items.reduce((total, item) => total + item.salesRevenue, 0)),
        },
        items,
    };
};

const saleFingerprint = (value, actorUserId) => crypto.createHash('sha256')
    .update(JSON.stringify({ actorUserId, ...value }))
    .digest('hex');

const getProductionSale = async (id, options = {}) => ProductionSale.findByPk(id, {
    ...options,
    include: [{ model: ProductionSaleItem, as: 'items' }],
});

const getExistingProductionSale = async (idempotencyKey, requestHash) => {
    const existing = await ProductionSale.findOne({
        where: { idempotencyKey },
        include: [{ model: ProductionSaleItem, as: 'items' }],
    });
    if (!existing) return null;
    if (existing.requestHash !== requestHash) {
        throw conflict('This checkout key was already used for a different sale.');
    }
    return existing;
};

export const completeProductionSale = async (body, cashierId) => {
    const value = validate(validateProductionSaleInput(body));
    const requestHash = saleFingerprint(value, cashierId);
    const existing = await getExistingProductionSale(value.idempotencyKey, requestHash);
    if (existing) return { sale: existing, duplicate: true };

    try {
        const saleId = await database.sequelize.transaction(async (transaction) => {
            const day = await lockProductionDay(value.productionDate, transaction);
            if (day.isClosed) throw conflict('Billing is closed for this production date.');

            const applicationSettings = await getApplicationSettingsRecord({
                transaction,
                lock: transaction.LOCK.UPDATE,
            });
            const settings = applicationSettings.settings;
            const billingSettings = settings.billing;
            const paymentSettings = settings.payments;
            if (value.settingsUpdatedAt &&
                value.settingsUpdatedAt !== applicationSettings.updatedAt.toISOString()) {
                throw new ProductionError(
                    409,
                    'Billing settings changed. Refresh the checkout and confirm the updated total.',
                    'SETTINGS_CHANGED',
                );
            }
            const taxRate = billingSettings.tax.enabled ? billingSettings.tax.rate : 0;
            const packingCharge = billingSettings.packingCharge.enabled
                ? billingSettings.packingCharge.amount
                : 0;
            if (value.taxRate !== undefined && value.taxRate !== taxRate) {
                throw new ProductionError(400, 'Tax is controlled by application settings.', 'VALIDATION_ERROR');
            }
            if (value.packingCharge !== undefined && value.packingCharge !== packingCharge) {
                throw new ProductionError(400, 'Packing charge is controlled by application settings.', 'VALIDATION_ERROR');
            }
            if (value.paymentMethod === 'split') {
                if (!paymentSettings.allowSplit) {
                    throw new ProductionError(400, 'Split payment is disabled in application settings.', 'VALIDATION_ERROR');
                }
            } else if (!paymentSettings.enabledMethods[value.paymentMethod]) {
                throw new ProductionError(400, 'The selected payment method is disabled in application settings.', 'VALIDATION_ERROR');
            }

            const records = await ProductionRecord.findAll({
                where: { productionDate: value.productionDate, status: 'confirmed' },
                transaction,
                lock: transaction.LOCK.UPDATE,
                order: [['createdAt', 'ASC'], ['id', 'ASC']],
            });
            const recordIds = records.map((record) => record.id);
            const soldRows = recordIds.length
                ? await ProductionSaleItem.findAll({
                    where: { productionRecordId: recordIds },
                    attributes: ['productionRecordId', 'quantity'],
                    transaction,
                })
                : [];
            const soldByRecord = new Map();
            for (const row of soldRows) {
                soldByRecord.set(
                    row.productionRecordId,
                    (soldByRecord.get(row.productionRecordId) || 0) + Number(row.quantity),
                );
            }
            const menuItems = await MenuItem.findAll({
                where: {
                    id: value.items.map((item) => item.menuItemId),
                    isActive: true,
                },
                transaction,
                lock: transaction.LOCK.UPDATE,
                order: [['id', 'ASC']],
            });
            if (menuItems.length !== value.items.length) {
                throw conflict('One or more selected menu items are inactive or unavailable.');
            }
            const menuById = new Map(menuItems.map((item) => [item.id, item]));
            const saleLots = [];
            for (const requested of value.items) {
                const menuItem = menuById.get(requested.menuItemId);
                let remainingMilli = BigInt(requested.quantity) * 1_000n;
                for (const record of records.filter((row) => row.menuItemId === requested.menuItemId)) {
                    const producedMilli = toScaledInteger(platesForRecord(record), 3, 'Produced plates');
                    const soldMilli = toScaledInteger(soldByRecord.get(record.id) || 0, 3, 'Sold plates');
                    const availableMilli = producedMilli - soldMilli;
                    if (availableMilli <= 0n) continue;
                    const quantityMilli = availableMilli < remainingMilli ? availableMilli : remainingMilli;
                    saleLots.push({
                        productionRecord: record,
                        menuItem,
                        quantityMilli,
                        quantity: Number(quantityMilli) / 1_000,
                        unitPriceCents: moneyCents(menuItem.price, 'Menu price'),
                        costPerPlateCents: moneyCents(record.costPerPlate, 'Production cost per plate'),
                    });
                    remainingMilli -= quantityMilli;
                    if (remainingMilli === 0n) break;
                }
                if (remainingMilli > 0n) {
                    throw conflict(`Not enough available plates for "${menuItem.name}".`);
                }
            }

            const subtotalCents = value.items.reduce((total, item) =>
                total + moneyCents(menuById.get(item.menuItemId).price, 'Menu price') * BigInt(item.quantity),
            0n);
            for (const requested of value.items) {
                const lots = saleLots.filter((lot) => lot.menuItem.id === requested.menuItemId);
                const requestedMilli = BigInt(requested.quantity) * 1_000n;
                const itemGrossCents = moneyCents(menuById.get(requested.menuItemId).price, 'Menu price') *
                    BigInt(requested.quantity);
                const allocations = lots.map((lot, index) => {
                    const numerator = itemGrossCents * lot.quantityMilli;
                    return {
                        lot,
                        index,
                        cents: numerator / requestedMilli,
                        remainder: numerator % requestedMilli,
                    };
                });
                let unallocated = itemGrossCents - allocations.reduce((total, item) => total + item.cents, 0n);
                const priority = [...allocations].sort((left, right) =>
                    left.remainder === right.remainder ? left.index - right.index :
                        left.remainder > right.remainder ? -1 : 1);
                for (const allocation of priority) {
                    if (unallocated === 0n) break;
                    allocation.cents += 1n;
                    unallocated -= 1n;
                }
                for (const allocation of allocations) allocation.lot.grossCents = allocation.cents;
            }
            const discountCents = moneyCents(value.discountAmount, 'discountAmount');
            if (discountCents > subtotalCents) {
                throw new ProductionError(400, 'discountAmount cannot exceed the sale subtotal.', 'VALIDATION_ERROR');
            }
            const discountAllocations = saleLots.map((lot, index) => {
                const grossCents = lot.grossCents;
                if (subtotalCents === 0n) return { index, grossCents, discountCents: 0n, remainder: 0n };
                const numerator = discountCents * grossCents;
                return {
                    index,
                    grossCents,
                    discountCents: numerator / subtotalCents,
                    remainder: numerator % subtotalCents,
                };
            });
            let unallocatedDiscountCents = discountCents - discountAllocations.reduce(
                (total, line) => total + line.discountCents,
                0n,
            );
            const discountPriority = [...discountAllocations].sort((left, right) =>
                left.remainder === right.remainder ? left.index - right.index :
                    left.remainder > right.remainder ? -1 : 1);
            for (const allocation of discountPriority) {
                if (unallocatedDiscountCents === 0n) break;
                allocation.discountCents += 1n;
                unallocatedDiscountCents -= 1n;
            }
            const discountedSubtotalCents = subtotalCents - discountCents;
            const taxRateHundredths = moneyCents(taxRate, 'taxRate');
            const taxCents = (discountedSubtotalCents * taxRateHundredths + 5_000n) / 10_000n;
            const packingCents = moneyCents(packingCharge, 'packingCharge');
            const additionalCharges = billingSettings.additionalCharges
                .filter((charge) => charge.enabled)
                .map((charge) => {
                    const configuredAmount = moneyCents(charge.amount, `additional charge ${charge.name}`);
                    const amountCents = charge.calculationType === 'percentage'
                        ? (discountedSubtotalCents * configuredAmount + 5_000n) / 10_000n
                        : configuredAmount;
                    return {
                        id: charge.id,
                        name: charge.name,
                        calculationType: charge.calculationType,
                        configuredAmount: charge.amount,
                        amount: fromCents(amountCents),
                        cents: amountCents,
                    };
                });
            const additionalChargesCents = additionalCharges.reduce(
                (total, charge) => total + charge.cents,
                0n,
            );
            const totalCents = discountedSubtotalCents + taxCents + packingCents + additionalChargesCents;
            if (totalCents > MAX_MONEY_CENTS) {
                throw new ProductionError(400, 'Sale total exceeds the supported monetary range.', 'VALIDATION_ERROR');
            }

            const paymentBreakdown = value.paymentMethod === 'split'
                ? value.paymentBreakdown
                : { [value.paymentMethod]: fromCents(totalCents) };
            const tenderTotalCents = Object.entries(paymentBreakdown).reduce((total, [method, amount]) => {
                if (!paymentSettings.enabledMethods[method]) {
                    throw new ProductionError(
                        400,
                        `The ${method} tender is disabled in application settings.`,
                        'VALIDATION_ERROR',
                    );
                }
                return total + moneyCents(amount, `paymentBreakdown.${method}`);
            }, 0n);
            if (tenderTotalCents !== totalCents) {
                throw new ProductionError(400, 'Payment tender amounts must equal the bill total.', 'VALIDATION_ERROR');
            }

            const id = crypto.randomUUID();
            let invoiceNumber = BigInt(String(applicationSettings.nextInvoiceNumber));
            let reference;
            do {
                reference = `${billingSettings.invoicePrefix}-${invoiceNumber.toString().padStart(6, '0')}`;
                const existingReference = await ProductionSale.findOne({
                    where: { reference },
                    attributes: ['id'],
                    transaction,
                });
                if (!existingReference) break;
                invoiceNumber += 1n;
            } while (true);
            await applicationSettings.update({
                nextInvoiceNumber: (invoiceNumber + 1n).toString(),
            }, { transaction });

            const sale = await ProductionSale.create({
                id,
                reference,
                idempotencyKey: value.idempotencyKey,
                requestHash,
                productionDate: value.productionDate,
                subtotal: fromCents(subtotalCents),
                discountAmount: fromCents(discountCents),
                taxRate,
                taxAmount: fromCents(taxCents),
                packingCharge: fromCents(packingCents),
                additionalCharges: additionalCharges.map(({ cents, ...charge }) => charge),
                totalAmount: fromCents(totalCents),
                paymentMethod: value.paymentMethod,
                paymentBreakdown,
                paymentStatus: 'completed',
                cashierId,
                customerId: value.customerId,
            }, { transaction });
            await ProductionSaleItem.bulkCreate(saleLots.map((lot, index) => {
                const discount = discountAllocations.find((allocation) => allocation.index === index);
                return {
                    saleId: sale.id,
                    productionRecordId: lot.productionRecord.id,
                    menuItemId: lot.menuItem.id,
                    menuItemName: lot.menuItem.name,
                    quantity: lot.quantity,
                    unitPrice: fromCents(lot.unitPriceCents),
                    costPerPlate: fromCents(lot.costPerPlateCents),
                    discountAmount: fromCents(discount.discountCents),
                    totalPrice: fromCents(discount.grossCents - discount.discountCents),
                };
            }), { transaction });
            return sale.id;
        });
        return { sale: await getProductionSale(saleId), duplicate: false };
    } catch (error) {
        if (!(error instanceof UniqueConstraintError) &&
            error.name !== 'SequelizeUniqueConstraintError') throw error;
        const duplicate = await getExistingProductionSale(value.idempotencyKey, requestHash);
        if (duplicate) return { sale: duplicate, duplicate: true };
        throw conflict('This checkout conflicts with an existing sale.');
    }
};

export const closeProductionDay = async (body, actorUserId) => {
    const { productionDate } = validate(validateProductionDayInput(body));
    return database.sequelize.transaction(async (transaction) => {
        const day = await lockProductionDay(productionDate, transaction);
        if (day.isClosed) throw conflict('Production for this date is already closed.');
        const records = await ProductionRecord.findAll({
            where: { productionDate, status: 'confirmed' },
            transaction,
            lock: transaction.LOCK.UPDATE,
            order: [['createdAt', 'ASC'], ['id', 'ASC']],
        });
        const menuItems = records.length
            ? await MenuItem.findAll({
                where: { id: [...new Set(records.map((record) => record.menuItemId))] },
                attributes: ['id', 'name'],
                transaction,
            })
            : [];
        const menuById = new Map(menuItems.map((item) => [item.id, item]));
        const recordIds = records.map((record) => record.id);
        const saleRows = recordIds.length
            ? await ProductionSaleItem.findAll({
                where: { productionRecordId: recordIds },
                attributes: ['productionRecordId', 'menuItemId', 'quantity', 'totalPrice'],
                transaction,
            })
            : [];
        const soldByRecord = new Map();
        const revenueByMenu = new Map();
        for (const row of saleRows) {
            soldByRecord.set(
                row.productionRecordId,
                (soldByRecord.get(row.productionRecordId) || 0) + Number(row.quantity),
            );
            revenueByMenu.set(
                row.menuItemId,
                (revenueByMenu.get(row.menuItemId) || 0) + Number(row.totalPrice),
            );
        }
        const totalsByMenu = new Map();
        for (const record of records) {
            const produced = platesForRecord(record);
            const sold = soldByRecord.get(record.id) || 0;
            if (sold > produced + 0.0005) {
                throw new ProductionError(503, 'Sold plates exceed recorded production; daily close was stopped.');
            }
            const remaining = Math.max(0, produced - sold);
            const costCents = moneyCents(record.totalProductionCost, 'Production cost');
            const perPlateCents = moneyCents(record.costPerPlate, 'Production cost per plate');
            const wastageCents = (
                perPlateCents * toScaledInteger(remaining, 3, 'Remaining plates') + 500n
            ) / 1_000n;
            const current = totalsByMenu.get(record.menuItemId) || {
                menuItemId: record.menuItemId,
                menuItemName: menuById.get(record.menuItemId)?.name || 'Unknown',
                producedPlates: 0,
                soldPlates: 0,
                wastagePlates: 0,
                productionCostCents: 0n,
                wastageCostCents: 0n,
                salesRevenue: 0,
            };
            current.producedPlates += produced;
            current.soldPlates += sold;
            current.wastagePlates += remaining;
            current.productionCostCents += costCents;
            current.wastageCostCents += wastageCents;
            current.salesRevenue = revenueByMenu.get(record.menuItemId) || 0;
            totalsByMenu.set(record.menuItemId, current);
        }
        const items = [...totalsByMenu.values()];
        const totalProduced = items.reduce((total, item) => total + item.producedPlates, 0);
        const totalSold = items.reduce((total, item) => total + item.soldPlates, 0);
        const totalWastage = items.reduce((total, item) => total + item.wastagePlates, 0);
        const totalProductionCostCents = items.reduce((total, item) => total + item.productionCostCents, 0n);
        const totalSalesRevenueCents = items.reduce(
            (total, item) => total + moneyCents(item.salesRevenue, 'Sales revenue'),
            0n,
        );
        const totalWastageCostCents = items.reduce((total, item) => total + item.wastageCostCents, 0n);
        const financials = calculateProductionDayFinancials(records.map((record) => ({
            producedPlates: platesForRecord(record),
            soldPlates: soldByRecord.get(record.id) || 0,
            totalProductionCost: record.totalProductionCost,
            costPerPlate: record.costPerPlate,
        })), fromCents(totalSalesRevenueCents));
        await ProductionDayItem.bulkCreate(items.map((item) => ({
            productionDate,
            menuItemId: item.menuItemId,
            menuItemName: item.menuItemName,
            producedPlates: roundQuantity(item.producedPlates),
            soldPlates: roundQuantity(item.soldPlates),
            wastagePlates: roundQuantity(item.wastagePlates),
            productionCost: fromCents(item.productionCostCents),
            salesRevenue: roundMoney(item.salesRevenue),
            wastageCost: fromCents(item.wastageCostCents),
        })), { transaction });
        await day.update({
            isClosed: true,
            closedAt: new Date(),
            closedBy: actorUserId,
            totalProducedPlates: roundQuantity(totalProduced),
            totalSoldPlates: roundQuantity(totalSold),
            totalWastagePlates: roundQuantity(totalWastage),
            totalProductionCost: fromCents(totalProductionCostCents),
            totalSalesRevenue: fromCents(totalSalesRevenueCents),
            totalWastageCost: fromCents(totalWastageCostCents),
        }, { transaction });
        return {
            productionDate,
            isClosed: true,
            closedAt: day.closedAt,
            summary: {
                producedPlates: roundQuantity(totalProduced),
                soldPlates: roundQuantity(totalSold),
                wastagePlates: roundQuantity(totalWastage),
                availablePlates: 0,
                productionCost: fromCents(totalProductionCostCents),
                salesRevenue: fromCents(totalSalesRevenueCents),
                wastageCost: fromCents(totalWastageCostCents),
                soldFoodCost: financials.soldFoodCost,
                grossProfit: fromCents(totalSalesRevenueCents - totalProductionCostCents),
                grossLoss: financials.grossLoss,
            },
            items: items.map((item) => ({
                menuItemId: item.menuItemId,
                menuItemName: item.menuItemName,
                producedPlates: roundQuantity(item.producedPlates),
                soldPlates: roundQuantity(item.soldPlates),
                remainingPlates: roundQuantity(item.wastagePlates),
                wastagePlates: roundQuantity(item.wastagePlates),
                productionCost: fromCents(item.productionCostCents),
                salesRevenue: roundMoney(item.salesRevenue),
                wastageCost: fromCents(item.wastageCostCents),
            })),
        };
    });
};

export const createOperatingExpense = async (body, actorUserId) => {
    const value = validate(validateOperatingExpenseInput(body));
    return OperatingExpense.create({ ...value, createdBy: actorUserId });
};

export const listOperatingExpenses = async (query) => {
    const { from, to } = parseReportDates(query);
    return OperatingExpense.findAll({
        where: { expenseDate: { [Op.between]: [from, to] } },
        order: [['expenseDate', 'DESC'], ['createdAt', 'DESC']],
    });
};

export const listProductionRecords = async (query) => {
    const { page, limit, offset } = parsePagination(query);
    const where = {};
    for (const field of ['from', 'to']) {
        if (query[field] !== undefined && !isDateOnly(query[field])) {
            throw new ProductionError(400, `${field} must be a YYYY-MM-DD date.`, 'VALIDATION_ERROR');
        }
    }
    if (query.from && query.to && query.from > query.to) {
        throw new ProductionError(400, 'from must not be after to.', 'VALIDATION_ERROR');
    }
    if (query.from || query.to) {
        where.productionDate = {};
        if (query.from) where.productionDate[Op.gte] = query.from;
        if (query.to) where.productionDate[Op.lte] = query.to;
    }
    if (query.status && !['confirmed', 'cancelled', 'all'].includes(query.status)) {
        throw new ProductionError(400, 'status must be confirmed, cancelled, or all.', 'VALIDATION_ERROR');
    }
    if (query.status && query.status !== 'all') where.status = query.status;
    if (query.menuItemId) {
        validateId(query.menuItemId, 'menu item');
        where.menuItemId = query.menuItemId;
    }
    const { count, rows } = await ProductionRecord.findAndCountAll({
        where,
        limit,
        offset,
        order: [['productionDate', 'DESC'], ['createdAt', 'DESC']],
        include: [
            { model: MenuItem, as: 'menuItem', attributes: ['id', 'name', 'category'] },
            { model: RecipeVersion, as: 'recipeVersion', attributes: ['version'] },
        ],
    });
    return { items: rows, pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) } };
};

export const updateProductionYield = async (id, body) => {
    validateId(id, 'production');
    const value = validate(validateYieldInput(body));
    const recordId = await database.sequelize.transaction(async (transaction) => {
        const record = await ProductionRecord.findByPk(id, { transaction });
        if (!record) throw notFound('Production record not found.');
        const day = await lockProductionDay(record.productionDate, transaction);
        if (day.isClosed) throw conflict('A closed production yield cannot be changed.');
        const lockedRecord = await ProductionRecord.findByPk(id, {
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        if (lockedRecord.status !== 'confirmed') throw conflict('Cancelled production yield cannot be changed.');
        const soldPlates = Number(await ProductionSaleItem.sum('quantity', {
            where: { productionRecordId: lockedRecord.id },
            transaction,
        }) || 0);
        if (soldPlates > 0) throw conflict('Actual yield cannot be changed after plates have been sold.');
        const platesMilli = toScaledInteger(value.actualPlateCount, 3, 'actualPlateCount');
        const totalCostCents = toScaledInteger(lockedRecord.totalProductionCost, 2, 'totalProductionCost');
        const costPerPlateCents = platesMilli > 0n
            ? (totalCostCents * 1_000n + platesMilli / 2n) / platesMilli
            : 0n;
        if (costPerPlateCents > MAX_MONEY_CENTS) {
            throw new ProductionError(400, 'Cost per plate exceeds the supported monetary range.', 'VALIDATION_ERROR');
        }
        await lockedRecord.update({
            actualPlateCount: value.actualPlateCount,
            costPerPlate: Number(costPerPlateCents) / 100,
        }, { transaction });
        return lockedRecord.id;
    });
    return getProductionDetail(recordId);
};

export const cancelProduction = async (id, body, actorUserId) => {
    validateId(id, 'production');
    const value = validate(validateCancellationInput(body));
    return database.sequelize.transaction(async (transaction) => {
        const current = await ProductionRecord.findByPk(id, { transaction });
        if (!current) throw notFound('Production record not found.');
        const day = await lockProductionDay(current.productionDate, transaction);
        if (day.isClosed) throw conflict('A closed production batch cannot be cancelled.');
        const record = await ProductionRecord.findByPk(id, {
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        if (record.status !== 'confirmed') throw conflict('Production is already cancelled.');
        const soldPlates = Number(await ProductionSaleItem.sum('quantity', {
            where: { productionRecordId: record.id },
            transaction,
        }) || 0);
        if (soldPlates > 0) throw conflict('A production batch with sold plates cannot be cancelled.');
        const ingredientRows = await ProductionIngredient.findAll({
            where: { productionRecordId: record.id },
            transaction,
            order: [['stockItemId', 'ASC']],
        });
        const requestedRecoveries = new Map(value.recoveries.map((entry) => [
            entry.productionIngredientId,
            entry.quantityRecovered,
        ]));
        const ingredientById = new Map(ingredientRows.map((ingredient) => [ingredient.id, ingredient]));
        for (const recovery of value.recoveries) {
            const ingredient = ingredientById.get(recovery.productionIngredientId);
            if (!ingredient) throw new ProductionError(400, 'A recovery references an ingredient outside this production.', 'VALIDATION_ERROR');
            if (toScaledInteger(recovery.quantityRecovered, 3, 'quantityRecovered') >
                toScaledInteger(ingredient.quantityDeducted, 3, 'quantityDeducted')) {
                throw new ProductionError(400, 'Recovered quantity cannot exceed the quantity consumed.', 'VALIDATION_ERROR');
            }
        }
        const stockIds = [...new Set(value.recoveries.map((entry) =>
            ingredientById.get(entry.productionIngredientId).stockItemId))].sort();
        const stockItems = await StockItem.findAll({
            where: { id: stockIds },
            transaction,
            lock: transaction.LOCK.UPDATE,
            order: [['id', 'ASC']],
        });
        const stockById = new Map(stockItems.map((item) => [item.id, item]));
        const cancellation = await ProductionCancellation.create({
            productionRecordId: record.id,
            reason: value.reason,
            notes: value.notes,
            cancelledBy: actorUserId,
        }, { transaction });
        for (const [ingredientId, quantityRecovered] of requestedRecoveries) {
            const ingredient = ingredientById.get(ingredientId);
            const stockItem = stockById.get(ingredient.stockItemId);
            if (!stockItem) throw new ProductionError(409, 'A recovered stock item no longer exists.', 'STOCK_ITEM_UNAVAILABLE');
            const beforeMilli = toScaledInteger(stockItem.quantity, 3, 'Stock balance');
            const recoveredMilli = toScaledInteger(quantityRecovered, 3, 'quantityRecovered');
            const afterMilli = beforeMilli + recoveredMilli;
            if (afterMilli > toScaledInteger(MAX_STOCK_QUANTITY, 3, 'Maximum stock quantity')) {
                throw new ProductionError(400, 'The recovered quantity would exceed the stock limit.', 'VALIDATION_ERROR');
            }
            const originalUnitCostCents = toScaledInteger(ingredient.unitCost, 2, 'Original unit cost');
            const currentUnitCostCents = toScaledInteger(stockItem.unitCost, 2, 'Current unit cost');
            const weightedUnitCostCents = afterMilli > 0n
                ? (beforeMilli * currentUnitCostCents + recoveredMilli * originalUnitCostCents + afterMilli / 2n) / afterMilli
                : originalUnitCostCents;
            const totalCostCents = (recoveredMilli * originalUnitCostCents + 500n) / 1_000n;
            if (totalCostCents > MAX_MONEY_CENTS) {
                throw new ProductionError(400, 'Recovered stock value exceeds the supported monetary range.', 'VALIDATION_ERROR');
            }
            const afterQuantity = Number(afterMilli) / 1000;
            await stockItem.update({
                quantity: afterQuantity,
                unitCost: Number(weightedUnitCostCents) / 100,
            }, { transaction });
            const movement = await StockMovement.create({
                stockItemId: stockItem.id,
                type: 'in',
                quantity: quantityRecovered,
                unitCost: Number(originalUnitCostCents) / 100,
                change: quantityRecovered,
                beforeQuantity: Number(beforeMilli) / 1000,
                afterQuantity,
                unit: stockItem.unit,
                reason: `Production recovery ${record.reference}`,
                actorUserId,
                referenceType: 'production_recovery',
                referenceId: record.id,
                totalCost: Number(totalCostCents) / 100,
            }, { transaction });
            await ProductionRecovery.create({
                cancellationId: cancellation.id,
                productionIngredientId: ingredient.id,
                quantityRecovered,
                unit: ingredient.unit,
                stockMovementId: movement.id,
            }, { transaction });
        }
        await record.update({ status: 'cancelled' }, { transaction });
        return getProductionDetail(record.id, { transaction });
    });
};

const parseReportDates = (query) => {
    const today = new Date().toISOString().slice(0, 10);
    const to = query.to || today;
    const from = query.from || new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (!isDateOnly(from) || !isDateOnly(to) || from > to) {
        throw new ProductionError(400, 'Provide a valid date range using YYYY-MM-DD.', 'VALIDATION_ERROR');
    }
    if ((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 > 3652) {
        throw new ProductionError(400, 'Report date range cannot exceed 10 years.', 'VALIDATION_ERROR');
    }
    return { from, to };
};

export const getFinancialReport = async (query) => {
    const { from, to } = parseReportDates(query);
    if (query.paymentMethod && !['cash', 'upi', 'card', 'split', 'all'].includes(query.paymentMethod)) {
        throw new ProductionError(400, 'paymentMethod must be cash, upi, card, split, or all.', 'VALIDATION_ERROR');
    }
    if (query.paymentStatus && !['completed', 'failed', 'cancelled', 'all'].includes(query.paymentStatus)) {
        throw new ProductionError(400, 'paymentStatus must be completed, failed, cancelled, or all.', 'VALIDATION_ERROR');
    }
    if (query.menuItemId) validateId(query.menuItemId, 'menu item');
    const menuWhere = {};
    if (query.menuItemId) menuWhere.id = query.menuItemId;
    if (query.categoryId) {
        validateId(query.categoryId, 'menu category');
        menuWhere.categoryId = query.categoryId;
    }
    const filteredMenus = query.categoryId || query.menuItemId
        ? await MenuItem.findAll({ where: menuWhere, attributes: ['id', 'name', 'category'] })
        : null;
    const menuIds = filteredMenus?.map((item) => item.id);
    const records = await ProductionRecord.findAll({
        where: {
            productionDate: { [Op.between]: [from, to] },
            status: 'confirmed',
            ...(menuIds ? { menuItemId: menuIds } : {}),
        },
        include: [{
            model: MenuItem,
            as: 'menuItem',
            attributes: ['id', 'name', 'category', 'categoryId'],
        }],
        order: [['productionDate', 'ASC'], ['createdAt', 'ASC']],
    });
    const saleWhere = { productionDate: { [Op.between]: [from, to] } };
    if (query.paymentMethod && query.paymentMethod !== 'all') saleWhere.paymentMethod = query.paymentMethod;
    if (query.paymentStatus && query.paymentStatus !== 'all') saleWhere.paymentStatus = query.paymentStatus;
    const allSales = await ProductionSale.findAll({
        where: saleWhere,
        include: [{ model: ProductionSaleItem, as: 'items' }],
        order: [['createdAt', 'ASC']],
    });
    const allowedMenuIds = menuIds ? new Set(menuIds) : null;
    const sales = allSales.map((sale) => {
        const items = sale.items.filter((item) => !allowedMenuIds || allowedMenuIds.has(item.menuItemId));
        return { sale, items };
    }).filter(({ items }) => items.length > 0);
    const closedItems = await ProductionDayItem.findAll({
        where: { productionDate: { [Op.between]: [from, to] } },
    });
    const closedByMenuDate = new Map(closedItems.map((item) => [
        `${item.productionDate}:${item.menuItemId}`,
        item,
    ]));
    const expenses = await OperatingExpense.findAll({
        where: { expenseDate: { [Op.between]: [from, to] } },
        order: [['expenseDate', 'ASC']],
    });
    const itemTotals = new Map();
    const dayTotals = new Map();
    const getItem = (menuItemId, date, menuItemName) => {
        const key = `${date}:${menuItemId}`;
        if (!itemTotals.has(key)) {
            itemTotals.set(key, {
                date,
                menuItemId,
                name: menuItemName,
                producedPlates: 0,
                soldPlates: 0,
                remainingPlates: 0,
                wastagePlates: 0,
                productionCost: 0,
                expectedRevenue: 0,
                salesRevenue: 0,
                wastageCost: 0,
            });
        }
        return itemTotals.get(key);
    };
    for (const record of records) {
        const produced = platesForRecord(record);
        const item = getItem(record.menuItemId, record.productionDate, record.menuItem.name);
        item.producedPlates += produced;
        item.productionCost += Number(record.totalProductionCost);
        item.expectedRevenue += Number(record.sellingPricePerPlate) * produced;
        const day = dayTotals.get(record.productionDate) || {
            date: record.productionDate,
            producedPlates: 0,
            soldPlates: 0,
            productionCost: 0,
            expectedRevenue: 0,
            salesRevenue: 0,
            wastagePlates: 0,
            wastageCost: 0,
            operatingExpenses: 0,
        };
        day.producedPlates += produced;
        day.productionCost += Number(record.totalProductionCost);
        day.expectedRevenue += Number(record.sellingPricePerPlate) * produced;
        dayTotals.set(record.productionDate, day);
    }
    const paymentMethods = {
        cash: { bills: 0, amount: 0 },
        upi: { bills: 0, amount: 0 },
        card: { bills: 0, amount: 0 },
        split: { bills: 0, amount: 0 },
    };
    const paymentTenders = {
        cash: { bills: 0, amount: 0 },
        upi: { bills: 0, amount: 0 },
        card: { bills: 0, amount: 0 },
    };
    const paymentStatuses = {
        completed: { bills: 0, amount: 0 },
        failed: { bills: 0, amount: 0 },
        cancelled: { bills: 0, amount: 0 },
    };
    for (const { sale, items } of sales) {
        const amount = items.reduce((total, item) => total + Number(item.totalPrice), 0);
        const quantity = items.reduce((total, item) => total + Number(item.quantity), 0);
        const date = sale.productionDate;
        const day = dayTotals.get(date) || {
            date,
            producedPlates: 0,
            soldPlates: 0,
            productionCost: 0,
            expectedRevenue: 0,
            salesRevenue: 0,
            wastagePlates: 0,
            wastageCost: 0,
            operatingExpenses: 0,
        };
        day.soldPlates += quantity;
        day.salesRevenue += amount;
        dayTotals.set(date, day);
        for (const line of items) {
            const record = records.find((row) => row.id === line.productionRecordId);
            const item = getItem(
                line.menuItemId,
                date,
                line.menuItemName || record?.menuItem?.name || 'Unknown',
            );
            item.soldPlates += Number(line.quantity);
            item.salesRevenue += Number(line.totalPrice);
        }
        const method = paymentMethods[sale.paymentMethod];
        const collectedAmount = Number(sale.totalAmount);
        const status = paymentStatuses[sale.paymentStatus];
        if (method) {
            method.bills += 1;
            method.amount += collectedAmount;
        }
        if (status) {
            status.bills += 1;
            status.amount += collectedAmount;
        }
        const tenders = sale.paymentBreakdown && Object.keys(sale.paymentBreakdown).length
            ? sale.paymentBreakdown
            : paymentTenders[sale.paymentMethod]
                ? { [sale.paymentMethod]: collectedAmount }
                : {};
        for (const [tenderName, tenderAmount] of Object.entries(tenders)) {
            const tender = paymentTenders[tenderName];
            if (!tender) continue;
            tender.bills += 1;
            tender.amount += Number(tenderAmount);
        }
    }
    for (const item of itemTotals.values()) {
        const closed = closedByMenuDate.get(`${item.date}:${item.menuItemId}`);
        if (closed) {
            item.wastagePlates = Number(closed.wastagePlates);
            item.wastageCost = Number(closed.wastageCost);
        } else {
            item.remainingPlates = Math.max(0, item.producedPlates - item.soldPlates);
        }
        const day = dayTotals.get(item.date);
        if (day) {
            day.wastagePlates += item.wastagePlates;
            day.wastageCost += item.wastageCost;
        }
    }
    for (const day of dayTotals.values()) {
        const isClosed = closedItems.some((item) => item.productionDate === day.date);
        if (isClosed) day.remainingPlates = 0;
        else day.remainingPlates = Math.max(0, day.producedPlates - day.soldPlates);
    }
    for (const expense of expenses) {
        const day = dayTotals.get(expense.expenseDate) || {
            date: expense.expenseDate,
            producedPlates: 0,
            soldPlates: 0,
            remainingPlates: 0,
            productionCost: 0,
            expectedRevenue: 0,
            salesRevenue: 0,
            wastagePlates: 0,
            wastageCost: 0,
            operatingExpenses: 0,
        };
        day.operatingExpenses += Number(expense.amount);
        dayTotals.set(expense.expenseDate, day);
    }
    for (const day of dayTotals.values()) {
        day.grossProfit = day.salesRevenue - day.productionCost;
        day.netProfit = day.grossProfit - day.operatingExpenses;
    }
    const totalProductionCost = records.reduce((total, row) => total + Number(row.totalProductionCost), 0);
    const totalProducedPlates = records.reduce((total, row) => total + platesForRecord(row), 0);
    const totalSoldPlates = sales.reduce(
        (total, entry) => total + entry.items.reduce((quantity, item) => quantity + Number(item.quantity), 0),
        0,
    );
    const totalSalesRevenue = sales.reduce(
        (total, entry) => total + entry.items.reduce((amount, item) => amount + Number(item.totalPrice), 0),
        0,
    );
    const soldFoodCostCents = sales.reduce((total, entry) =>
        total + entry.items.reduce((lineTotal, item) => {
            const costCents = moneyCents(item.costPerPlate, 'Production cost per plate');
            const quantityMilli = toScaledInteger(item.quantity, 3, 'Sold plates');
            return lineTotal + (costCents * quantityMilli + 500n) / 1_000n;
        }, 0n),
    0n);
    const totalWastagePlates = [...itemTotals.values()].reduce((total, item) => total + item.wastagePlates, 0);
    const totalWastageCost = [...itemTotals.values()].reduce((total, item) => total + item.wastageCost, 0);
    const operatingExpenses = expenses.reduce((total, expense) => total + Number(expense.amount), 0);
    const grossProfit = totalSalesRevenue - totalProductionCost;
    const itemRows = [...itemTotals.values()].map((item) => ({
        ...item,
        producedPlates: roundQuantity(item.producedPlates),
        soldPlates: roundQuantity(item.soldPlates),
        remainingPlates: roundQuantity(item.remainingPlates),
        wastagePlates: roundQuantity(item.wastagePlates),
        productionCost: roundMoney(item.productionCost),
        expectedRevenue: roundMoney(item.expectedRevenue),
        salesRevenue: roundMoney(item.salesRevenue),
        wastageCost: roundMoney(item.wastageCost),
    }));
    return {
        period: { from, to },
        summary: {
            totalProductionCost: roundMoney(totalProductionCost),
            totalExpectedRevenue: roundMoney(records.reduce(
                (total, record) => total + Number(record.sellingPricePerPlate) * platesForRecord(record),
                0,
            )),
            totalSalesRevenue: roundMoney(totalSalesRevenue),
            soldFoodCost: fromCents(soldFoodCostCents),
            totalProducedPlates: roundQuantity(totalProducedPlates),
            totalSoldPlates: roundQuantity(totalSoldPlates),
            availablePlates: roundQuantity([...itemTotals.values()].reduce((total, item) => total + item.remainingPlates, 0)),
            totalWastagePlates: roundQuantity(totalWastagePlates),
            totalWastageCost: roundMoney(totalWastageCost),
            grossProfit: roundMoney(grossProfit),
            grossLoss: roundMoney(Math.max(0, -grossProfit)),
            operatingExpenses: roundMoney(operatingExpenses),
            netProfit: roundMoney(grossProfit - operatingExpenses),
            netLoss: roundMoney(Math.max(0, operatingExpenses - grossProfit)),
        },
        paymentMethods: Object.fromEntries(Object.entries(paymentMethods).map(([key, value]) => [
            key,
            { bills: value.bills, amount: roundMoney(value.amount) },
        ])),
        paymentTenders: Object.fromEntries(Object.entries(paymentTenders).map(([key, value]) => [
            key,
            { bills: value.bills, amount: roundMoney(value.amount) },
        ])),
        paymentStatuses: Object.fromEntries(Object.entries(paymentStatuses).map(([key, value]) => [
            key,
            { bills: value.bills, amount: roundMoney(value.amount) },
        ])),
        daily: [...dayTotals.values()].map((day) => ({
            ...day,
            producedPlates: roundQuantity(day.producedPlates),
            soldPlates: roundQuantity(day.soldPlates),
            remainingPlates: roundQuantity(day.remainingPlates),
            productionCost: roundMoney(day.productionCost),
            expectedRevenue: roundMoney(day.expectedRevenue),
            salesRevenue: roundMoney(day.salesRevenue),
            wastagePlates: roundQuantity(day.wastagePlates),
            wastageCost: roundMoney(day.wastageCost),
            operatingExpenses: roundMoney(day.operatingExpenses),
            grossProfit: roundMoney(day.grossProfit),
            netProfit: roundMoney(day.netProfit),
        })),
        menuItems: itemRows,
        expenses: expenses.map((expense) => expense.toJSON()),
    };
};

export const getProductionReport = async (query) => {
    const { from, to } = parseReportDates(query);
    const records = await ProductionRecord.findAll({
        where: { productionDate: { [Op.between]: [from, to] }, status: 'confirmed' },
        include: [{ model: MenuItem, as: 'menuItem', attributes: ['id', 'name', 'category'] }],
        order: [['productionDate', 'ASC']],
    });
    const recordIds = records.map((record) => record.id);
    const ingredientRows = recordIds.length
        ? await ProductionIngredient.findAll({
            where: { productionRecordId: recordIds },
            include: [{ model: StockItem, as: 'stockItem', attributes: ['id', 'name', 'unit'] }],
        })
        : [];
    const byDay = new Map();
    const byMenuItem = new Map();
    for (const record of records) {
        const date = record.productionDate;
        const daily = byDay.get(date) || { date, batches: 0, plates: 0, productionCost: 0 };
        daily.batches += 1;
        daily.plates += Number(record.actualPlateCount ?? record.expectedPlateCount);
        daily.productionCost += Number(record.totalProductionCost);
        byDay.set(date, daily);

        const menuItem = byMenuItem.get(record.menuItemId) || {
            menuItemId: record.menuItemId,
            name: record.menuItem?.name || 'Unknown',
            batches: 0,
            plates: 0,
            productionCost: 0,
        };
        menuItem.batches += 1;
        menuItem.plates += Number(record.actualPlateCount ?? record.expectedPlateCount);
        menuItem.productionCost += Number(record.totalProductionCost);
        byMenuItem.set(record.menuItemId, menuItem);
    }
    const byIngredient = new Map();
    for (const ingredient of ingredientRows) {
        const current = byIngredient.get(ingredient.stockItemId) || {
            stockItemId: ingredient.stockItemId,
            name: ingredient.stockItem?.name || ingredient.ingredientName,
            unit: ingredient.unit,
            quantityUsed: 0,
            totalCost: 0,
        };
        current.quantityUsed += Number(ingredient.quantityDeducted);
        current.totalCost += Number(ingredient.totalCost);
        byIngredient.set(ingredient.stockItemId, current);
    }
    const roundMoney = (number) => Math.round(number * 100) / 100;
    const roundQuantity = (number) => Math.round(number * 1000) / 1000;
    const totalPlates = records.reduce(
        (total, record) => total + Number(record.actualPlateCount ?? record.expectedPlateCount),
        0,
    );
    return {
        period: { from, to },
        summary: {
            batches: records.length,
            platesProduced: roundQuantity(records.reduce(
                (total, record) => total + Number(record.actualPlateCount ?? record.expectedPlateCount),
                0,
            )),
            totalProductionCost: roundMoney(records.reduce((total, record) => total + Number(record.totalProductionCost), 0)),
            averageCostPerPlate: totalPlates > 0
                ? roundMoney(
                    records.reduce((total, record) => total + Number(record.totalProductionCost), 0) /
                    totalPlates,
                )
                : 0,
        },
        daily: [...byDay.values()].map((row) => ({
            ...row,
            plates: roundQuantity(row.plates),
            productionCost: roundMoney(row.productionCost),
        })),
        menuItems: [...byMenuItem.values()].map((row) => ({
            ...row,
            plates: roundQuantity(row.plates),
            productionCost: roundMoney(row.productionCost),
        })).sort((left, right) => right.productionCost - left.productionCost),
        ingredients: [...byIngredient.values()].map((row) => ({
            ...row,
            quantityUsed: roundQuantity(row.quantityUsed),
            totalCost: roundMoney(row.totalCost),
        })).sort((left, right) => right.totalCost - left.totalCost),
        productions: records,
    };
};

