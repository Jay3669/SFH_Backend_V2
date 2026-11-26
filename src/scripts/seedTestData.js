import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import database, { schema } from '../config/database.js';
import User from '../models/user.model.js';
import { StockCategory, StockItem, StockMovement } from '../models/stock.model.js';
import { findNextStockCategoryDisplayOrder } from '../utils/stockCategoryDisplayOrder.js';
import {
    MenuItem,
    ProductionCancellation,
    ProductionCostDetail,
    ProductionIngredient,
    ProductionRecord,
    ProductionRecovery,
    Recipe,
    RecipeIngredient,
    RecipeVersion,
} from '../models/production.model.js';

const PREFIX = 'QA Fixture v1';
const CONFIRMATION = 'I_CONFIRM_NON_PRODUCTION';
const SEED_COUNT = 50;
const INITIAL_QUANTITY = 25;
const PRODUCTION_QUANTITY = 1;
const RECOVERY_QUANTITY = 0.25;
const ADDITIONAL_COST = 0.5;

const ingredientNames = [
    'Basmati Rice', 'Brown Rice', 'Wheat Flour', 'Chickpeas', 'Red Lentils',
    'Yellow Lentils', 'Black Beans', 'Kidney Beans', 'Tomatoes', 'Onions',
    'Potatoes', 'Carrots', 'Spinach', 'Cauliflower', 'Green Peas',
    'Bell Peppers', 'Cucumbers', 'Lemons', 'Ginger', 'Garlic',
    'Chicken Breast', 'Chicken Thighs', 'Paneer', 'Tofu', 'Yogurt',
    'Whole Milk', 'Cream', 'Butter', 'Cheddar Cheese', 'Coconut Milk',
    'Sunflower Oil', 'Olive Oil', 'Coconut Oil', 'Ghee', 'Cumin Seeds',
    'Coriander Powder', 'Turmeric', 'Paprika', 'Black Pepper', 'Garam Masala',
    'Cinnamon', 'Cardamom', 'Bay Leaves', 'Fresh Cilantro', 'Fresh Mint',
    'Brown Sugar', 'Sea Salt', 'Vegetable Stock', 'Tamarind Paste', 'Cashews',
];

const categoryNames = [
    'Grains', 'Legumes', 'Fresh Produce', 'Poultry', 'Dairy',
    'Plant Proteins', 'Oils', 'Spices', 'Herbs', 'Pantry',
];

const firstNames = ['Aarav', 'Maya', 'Rohan', 'Anika', 'Ishaan', 'Leela', 'Kabir', 'Nisha'];
const lastNames = ['Sharma', 'Patel', 'Rao', 'Mehta', 'Nair', 'Kapoor', 'Das', 'Iyer'];

const makeId = (kind, index) => {
    const bytes = Buffer.from(
        crypto.createHash('sha256').update(`${PREFIX}:${kind}:${index}`).digest('hex').slice(0, 32),
        'hex',
    );
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const value = bytes.toString('hex');
    return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
};

const daysAgo = (days, minuteOffset = 0) => new Date(
    Date.now() - days * 24 * 60 * 60 * 1000 + minuteOffset * 60 * 1000,
);

const dateOnly = (value) => value.toISOString().slice(0, 10);
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');

const ensureNoExistingFixture = async (transaction) => {
    const existing = [];
    existing.push(await StockCategory.findOne({ where: { name: { [Op.like]: `${PREFIX}%` } }, transaction }));
    existing.push(await StockItem.findOne({ where: { name: { [Op.like]: `${PREFIX}%` } }, transaction }));
    existing.push(await MenuItem.findOne({ where: { name: { [Op.like]: `${PREFIX}%` } }, transaction }));
    existing.push(await User.findOne({ where: { email: { [Op.like]: 'qa.fixture.%@sfh.test' } }, transaction }));
    if (existing.some(Boolean)) {
        throw new Error('QA fixture data already exists; refusing to modify or duplicate it.');
    }
};

const createFixture = async (transaction) => {
    await ensureNoExistingFixture(transaction);

    const testAdminPassword = `Sfh-${crypto.randomBytes(6).toString('hex')}`;
    const users = await Promise.all(Array.from({ length: SEED_COUNT }, async (_, offset) => {
        const index = offset + 1;
        const isAdmin = index === 1;
        const inactive = index === 49;
        const blocked = index === 50;
        const status = inactive ? 'inactive' : blocked ? 'blocked' : 'active';
        const isVerified = index % 2 === 0;
        const password = isAdmin ? testAdminPassword : crypto.randomBytes(18).toString('hex');
        return {
            id: makeId('user', index),
            firstName: firstNames[offset % firstNames.length],
            lastName: `${lastNames[offset % lastNames.length]} ${String(index).padStart(2, '0')}`,
            email: `qa.fixture.${String(index).padStart(3, '0')}@sfh.test`,
            passwordHash: await bcrypt.hash(password, 10),
            phoneNumber: `1555000${String(index).padStart(4, '0')}`,
            role: isAdmin ? 'admin' : index === 2 ? 'manager' : index === 3 ? 'employee' : index === 4 ? 'cashier' : 'customer',
            isActive: status === 'active',
            status,
            isVerified,
            emailVerifiedAt: isVerified ? daysAgo(index) : null,
            phoneVerifiedAt: index % 5 === 0 ? daysAgo(index) : null,
            isSubscribed: index % 3 === 0,
        };
    }));
    await User.bulkCreate(users, { transaction, validate: true });
    const actorUserId = users[0].id;

    await database.sequelize.query(
        `LOCK TABLE "${schema}"."stock_categories" IN SHARE ROW EXCLUSIVE MODE`,
        { transaction },
    );
    const existingCategoryOrders = await StockCategory.findAll({
        attributes: ['displayOrder'],
        raw: true,
        transaction,
    });
    const usedCategoryOrders = new Set(existingCategoryOrders.map((category) => Number(category.displayOrder)));
    const categories = Array.from({ length: SEED_COUNT }, (_, offset) => {
        const index = offset + 1;
        const displayOrder = findNextStockCategoryDisplayOrder(usedCategoryOrders);
        usedCategoryOrders.add(displayOrder);
        return {
            id: makeId('category', index),
            name: `${PREFIX} Category ${String(index).padStart(2, '0')} - ${categoryNames[offset % categoryNames.length]}`,
            description: `QA inventory category ${index}; generated fixture data.`,
            displayOrder,
        };
    });
    await StockCategory.bulkCreate(categories, { transaction, validate: true });

    const stocks = Array.from({ length: SEED_COUNT }, (_, offset) => {
        const index = offset + 1;
        const itemName = ingredientNames[offset];
        const unitCost = Number((2.5 + index * 0.17).toFixed(2));
        return {
            id: makeId('stock', index),
            name: `${PREFIX} Ingredient ${String(index).padStart(2, '0')} - ${itemName}`,
            sku: `SFH-QA-${String(index).padStart(3, '0')}`,
            categoryId: categories[offset].id,
            category: categories[offset].name,
            unit: 'kg',
            quantity: INITIAL_QUANTITY,
            reorderLevel: index <= 5 ? 30 : 5,
            unitCost,
            isActive: true,
        };
    });

    const edgeStocks = [
        {
            id: makeId('stock-edge', 1),
            name: `${PREFIX} Edge - Out of Stock`,
            sku: 'SFH-QA-EDGE-OUT',
            categoryId: categories[0].id,
            category: categories[0].name,
            unit: 'kg',
            quantity: 0,
            reorderLevel: 1,
            unitCost: 3.25,
            isActive: true,
        },
        {
            id: makeId('stock-edge', 2),
            name: `${PREFIX} Edge - Low Stock`,
            sku: 'SFH-QA-EDGE-LOW',
            categoryId: categories[1].id,
            category: categories[1].name,
            unit: 'kg',
            quantity: 0.5,
            reorderLevel: 2,
            unitCost: 1.25,
            isActive: true,
        },
        {
            id: makeId('stock-edge', 3),
            name: `${PREFIX} Edge - Inactive`,
            sku: 'SFH-QA-EDGE-INACTIVE',
            categoryId: categories[2].id,
            category: categories[2].name,
            unit: 'kg',
            quantity: 5,
            reorderLevel: 1,
            unitCost: 4.5,
            isActive: false,
        },
    ];
    await StockItem.bulkCreate([...stocks, ...edgeStocks], { transaction, validate: true });

    const menus = Array.from({ length: SEED_COUNT }, (_, offset) => {
        const index = offset + 1;
        return {
            id: makeId('menu', index),
            name: `${PREFIX} Menu ${String(index).padStart(2, '0')} - ${ingredientNames[offset]} Bowl`,
            category: offset % 2 === 0 ? 'Main Course' : 'Lunch Special',
            isVegetarian: offset % 3 !== 0,
            description: `Test menu item using ${ingredientNames[offset].toLowerCase()}.`,
            isActive: true,
        };
    });
    await MenuItem.bulkCreate(menus, { transaction, validate: true });

    const recipes = menus.map((menu, offset) => ({
        id: makeId('recipe', offset + 1),
        menuItemId: menu.id,
        name: `${PREFIX} Recipe ${String(offset + 1).padStart(2, '0')}`,
        currentVersion: 1,
        isArchived: false,
        createdBy: actorUserId,
        updatedBy: actorUserId,
    }));
    await Recipe.bulkCreate(recipes, { transaction, validate: true });

    const versions = recipes.map((recipe, offset) => ({
        id: makeId('recipe-version', offset + 1),
        recipeId: recipe.id,
        version: 1,
        baseProductionQuantity: PRODUCTION_QUANTITY,
        baseProductionUnit: 'kg',
        expectedPlateCount: 4,
        servingSize: 0.25,
        servingUnit: 'kg',
        preparationInstructions: 'Wash, prepare, and cook until ready to serve.',
        cookingTimeMinutes: 25 + offset % 30,
        wastagePercentage: 0,
        createdBy: actorUserId,
        updatedBy: actorUserId,
    }));
    await RecipeVersion.bulkCreate(versions, { transaction, validate: true });

    const recipeIngredients = stocks.map((stock, offset) => ({
        id: makeId('recipe-ingredient', offset + 1),
        recipeVersionId: versions[offset].id,
        stockItemId: stock.id,
        quantity: PRODUCTION_QUANTITY,
        unit: 'kg',
        preparationNotes: 'Measure before cooking.',
        wastagePercentage: 0,
    }));
    await RecipeIngredient.bulkCreate(recipeIngredients, { transaction, validate: true });

    const records = [];
    const productionIngredients = [];
    const costDetails = [];
    const cancellations = [];
    const recoveries = [];
    const movements = [];

    for (let offset = 0; offset < SEED_COUNT; offset += 1) {
        const index = offset + 1;
        const stock = stocks[offset];
        const recipe = recipes[offset];
        const version = versions[offset];
        const recipeIngredient = recipeIngredients[offset];
        const unitCost = Number(stock.unitCost);
        const confirmedDate = daysAgo(100 - offset);
        const cancelledDate = daysAgo(50 - offset);
        const confirmedId = makeId('production-confirmed', index);
        const cancelledId = makeId('production-cancelled', index);

        const productionCases = [
            { id: confirmedId, status: 'confirmed', date: confirmedDate, actualPlateCount: index % 10 === 0 ? 0 : 4 },
            { id: cancelledId, status: 'cancelled', date: cancelledDate, actualPlateCount: null },
        ];

        for (const [caseOffset, productionCase] of productionCases.entries()) {
            const caseIndex = caseOffset + 1;
            const ingredientCost = unitCost * PRODUCTION_QUANTITY;
            const totalCost = Number((ingredientCost + ADDITIONAL_COST).toFixed(2));
            const record = {
                id: productionCase.id,
                reference: `QA-${String(index).padStart(3, '0')}-${caseIndex === 1 ? 'OK' : 'CANCEL'}`,
                idempotencyKey: `${PREFIX.toLowerCase().replaceAll(' ', '-')}-${index}-${caseIndex}`,
                requestHash: hash(`${productionCase.id}:${recipe.id}:${productionCase.status}`),
                menuItemId: menus[offset].id,
                recipeVersionId: version.id,
                productionDate: dateOnly(productionCase.date),
                productionQuantity: PRODUCTION_QUANTITY,
                productionUnit: 'kg',
                expectedPlateCount: 4,
                actualPlateCount: productionCase.actualPlateCount,
                totalIngredientCost: ingredientCost,
                additionalCost: ADDITIONAL_COST,
                totalProductionCost: totalCost,
                costPerKg: totalCost,
                costPerPlate: Number((totalCost / 4).toFixed(2)),
                notes: productionCase.status === 'cancelled'
                    ? `${PREFIX}: cancellation and recovery scenario.`
                    : `${PREFIX}: confirmed batch for reporting and yield testing.`,
                preparedBy: actorUserId,
                status: productionCase.status,
                createdAt: productionCase.date,
                updatedAt: productionCase.date,
            };
            records.push(record);

            const beforeQuantity = caseIndex === 1
                ? INITIAL_QUANTITY
                : INITIAL_QUANTITY - PRODUCTION_QUANTITY;
            const afterQuantity = beforeQuantity - PRODUCTION_QUANTITY;
            const movementDate = new Date(productionCase.date.getTime() + caseOffset * 60 * 1000);
            const movementId = makeId(`stock-out-${caseIndex}`, index);
            movements.push({
                id: movementId,
                stockItemId: stock.id,
                type: 'out',
                quantity: PRODUCTION_QUANTITY,
                unitCost: null,
                change: -PRODUCTION_QUANTITY,
                beforeQuantity,
                afterQuantity,
                unit: 'kg',
                reason: `${PREFIX}: production ${record.reference}`,
                referenceType: 'production',
                referenceId: record.id,
                totalCost: ingredientCost,
                actorUserId,
                createdAt: movementDate,
                updatedAt: movementDate,
            });
            productionIngredients.push({
                id: makeId(`production-ingredient-${caseIndex}`, index),
                productionRecordId: record.id,
                recipeIngredientId: recipeIngredient.id,
                stockItemId: stock.id,
                ingredientName: stock.name,
                theoreticalQuantity: PRODUCTION_QUANTITY,
                quantityDeducted: PRODUCTION_QUANTITY,
                unit: 'kg',
                wastagePercentage: 0,
                recipeWastagePercentage: 0,
                unitCost,
                totalCost: ingredientCost,
                balanceAfter: afterQuantity,
                stockMovementId: movementId,
                createdAt: movementDate,
                updatedAt: movementDate,
            });
            costDetails.push({
                id: makeId(`production-cost-${caseIndex}`, index),
                productionRecordId: record.id,
                name: 'Fuel and utilities',
                amount: ADDITIONAL_COST,
                createdAt: productionCase.date,
                updatedAt: productionCase.date,
            });

            if (caseIndex === 2) {
                const cancellationId = makeId('cancellation', index);
                const recoveryMovementId = makeId('stock-recovery-movement', index);
                const recoveryDate = new Date(movementDate.getTime() + 60 * 1000);
                cancellations.push({
                    id: cancellationId,
                    productionRecordId: record.id,
                    reason: `${PREFIX}: cancelled before service.`,
                    notes: 'A quarter kilogram was unused and returned to stock.',
                    cancelledBy: actorUserId,
                    cancelledAt: recoveryDate,
                    createdAt: recoveryDate,
                    updatedAt: recoveryDate,
                });
                movements.push({
                    id: recoveryMovementId,
                    stockItemId: stock.id,
                    type: 'in',
                    quantity: RECOVERY_QUANTITY,
                    unitCost,
                    change: RECOVERY_QUANTITY,
                    beforeQuantity: afterQuantity,
                    afterQuantity: afterQuantity + RECOVERY_QUANTITY,
                    unit: 'kg',
                    reason: `${PREFIX}: unused ingredient recovery`,
                    referenceType: 'production-recovery',
                    referenceId: cancellationId,
                    totalCost: Number((unitCost * RECOVERY_QUANTITY).toFixed(2)),
                    actorUserId,
                    createdAt: recoveryDate,
                    updatedAt: recoveryDate,
                });
                recoveries.push({
                    id: makeId('recovery', index),
                    cancellationId,
                    productionIngredientId: makeId('production-ingredient-2', index),
                    quantityRecovered: RECOVERY_QUANTITY,
                    unit: 'kg',
                    stockMovementId: recoveryMovementId,
                    createdAt: recoveryDate,
                    updatedAt: recoveryDate,
                });
            }
        }
    }

    const edgeMovements = [
        {
            id: makeId('stock-edge-movement', 1),
            stockItemId: edgeStocks[0].id,
            type: 'count',
            quantity: 0,
            change: 0,
            beforeQuantity: 0,
            afterQuantity: 0,
            unit: 'kg',
            reason: `${PREFIX}: verified zero-stock edge case`,
            actorUserId,
        },
        {
            id: makeId('stock-edge-movement', 2),
            stockItemId: edgeStocks[1].id,
            type: 'in',
            quantity: 0.5,
            unitCost: 1.25,
            change: 0.5,
            beforeQuantity: 0,
            afterQuantity: 0.5,
            unit: 'kg',
            reason: `${PREFIX}: low-stock edge case`,
            actorUserId,
        },
        {
            id: makeId('stock-edge-movement', 3),
            stockItemId: edgeStocks[2].id,
            type: 'in',
            quantity: 5,
            unitCost: 4.5,
            change: 5,
            beforeQuantity: 0,
            afterQuantity: 5,
            unit: 'kg',
            reason: `${PREFIX}: inactive-item history`,
            actorUserId,
        },
    ];
    const edgeMovementRows = edgeMovements.map((movement) => ({
        ...movement,
        unitCost: movement.unitCost ?? null,
        referenceType: 'qa-fixture',
        referenceId: null,
        totalCost: movement.unitCost == null
            ? 0
            : Number((movement.quantity * movement.unitCost).toFixed(2)),
    }));
    const initialMovements = stocks.map((stock, offset) => ({
        id: makeId('stock-opening', offset + 1),
        stockItemId: stock.id,
        type: 'in',
        quantity: INITIAL_QUANTITY,
        unitCost: stock.unitCost,
        change: INITIAL_QUANTITY,
        beforeQuantity: 0,
        afterQuantity: INITIAL_QUANTITY,
        unit: 'kg',
        reason: `${PREFIX}: opening receipt`,
        referenceType: 'qa-fixture',
        referenceId: null,
        totalCost: Number((INITIAL_QUANTITY * stock.unitCost).toFixed(2)),
        actorUserId,
        createdAt: daysAgo(120),
        updatedAt: daysAgo(120),
    }));

    await ProductionRecord.bulkCreate(records, { transaction, validate: true });
    await StockMovement.bulkCreate([...initialMovements, ...movements, ...edgeMovementRows], {
        transaction,
        validate: true,
    });
    await ProductionIngredient.bulkCreate(productionIngredients, { transaction, validate: true });
    await ProductionCostDetail.bulkCreate(costDetails, { transaction, validate: true });
    await ProductionCancellation.bulkCreate(cancellations, { transaction, validate: true });
    await ProductionRecovery.bulkCreate(recoveries, { transaction, validate: true });

    await Promise.all(stocks.map((stock) => StockItem.update(
        { quantity: INITIAL_QUANTITY - 2 * PRODUCTION_QUANTITY + RECOVERY_QUANTITY },
        { where: { id: stock.id }, transaction },
    )));

    const expected = {
        users: users.length,
        stock_categories: categories.length,
        stock_items: stocks.length + edgeStocks.length,
        stock_movements: initialMovements.length + movements.length + edgeMovementRows.length,
        menu_items: menus.length,
        recipes: recipes.length,
        recipe_versions: versions.length,
        recipe_ingredients: recipeIngredients.length,
        production_records: records.length,
        production_ingredients: productionIngredients.length,
        production_cost_details: costDetails.length,
        production_cancellations: cancellations.length,
        production_recoveries: recoveries.length,
    };

    const checks = [];
    checks.push(await User.count({ where: { id: { [Op.in]: users.map((row) => row.id) } }, transaction }));
    checks.push(await StockCategory.count({ where: { id: { [Op.in]: categories.map((row) => row.id) } }, transaction }));
    checks.push(await StockItem.count({ where: { id: { [Op.in]: [...stocks, ...edgeStocks].map((row) => row.id) } }, transaction }));
    checks.push(await StockMovement.count({
        where: { id: { [Op.in]: [...initialMovements, ...movements, ...edgeMovementRows].map((row) => row.id) } },
        transaction,
    }));
    checks.push(await MenuItem.count({ where: { id: { [Op.in]: menus.map((row) => row.id) } }, transaction }));
    checks.push(await Recipe.count({ where: { id: { [Op.in]: recipes.map((row) => row.id) } }, transaction }));
    checks.push(await RecipeVersion.count({ where: { id: { [Op.in]: versions.map((row) => row.id) } }, transaction }));
    checks.push(await RecipeIngredient.count({ where: { id: { [Op.in]: recipeIngredients.map((row) => row.id) } }, transaction }));
    checks.push(await ProductionRecord.count({ where: { id: { [Op.in]: records.map((row) => row.id) } }, transaction }));
    checks.push(await ProductionIngredient.count({ where: { id: { [Op.in]: productionIngredients.map((row) => row.id) } }, transaction }));
    checks.push(await ProductionCostDetail.count({ where: { id: { [Op.in]: costDetails.map((row) => row.id) } }, transaction }));
    checks.push(await ProductionCancellation.count({ where: { id: { [Op.in]: cancellations.map((row) => row.id) } }, transaction }));
    checks.push(await ProductionRecovery.count({ where: { id: { [Op.in]: recoveries.map((row) => row.id) } }, transaction }));
    const actual = Object.fromEntries(Object.keys(expected).map((table, index) => [table, checks[index]]));
    for (const [table, count] of Object.entries(expected)) {
        if (actual[table] !== count) {
            throw new Error(`Fixture verification failed for ${table}: expected ${count}, found ${actual[table]}.`);
        }
    }

    return {
        expected,
        actual,
        testAdmin: {
            email: users[0].email,
            password: testAdminPassword,
        },
    };
};

const main = async () => {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('Refusing to seed test data when NODE_ENV=production.');
    }
    if (process.env.SEED_TEST_DATA_CONFIRM !== CONFIRMATION) {
        throw new Error(`Set SEED_TEST_DATA_CONFIRM=${CONFIRMATION} only after confirming a disposable non-production database.`);
    }

    const result = await database.sequelize.transaction(createFixture);
    console.log(JSON.stringify({
        message: 'Test fixture transaction committed and record counts verified.',
        inserted: result.actual,
        testAdmin: result.testAdmin,
    }, null, 2));
};

main()
    .catch((error) => {
        console.error(`Test data seeding failed: ${error.message}`);
        process.exitCode = 1;
    })
    .finally(async () => {
        await database.sequelize.close();
    });
