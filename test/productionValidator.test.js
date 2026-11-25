import test from 'node:test';
import assert from 'node:assert/strict';
import {
    validateCancellationInput,
    validateMenuItemInput,
    validateOperatingExpenseInput,
    validateProductionDayInput,
    validateProductionInput,
    validateProductionSaleInput,
    validateRecipeVersionInput,
} from '../src/validators/productionValidator.js';

const uuid = '3b241101-e2bb-4255-8caf-4136c566a962';

test('menu item validation accepts and bounds a non-negative price', () => {
    const result = validateMenuItemInput({
        name: 'Masala Dosa',
        categoryId: uuid,
        price: 129.5,
    });
    assert.deepEqual(result.value, {
        name: 'Masala Dosa',
        categoryId: uuid,
        price: 129.5,
    });
    assert.equal(validateMenuItemInput({ name: 'Masala Dosa', categoryId: uuid }).value.price, undefined);
    for (const price of [-1, 1.234, Number.NaN, 10_000_000_000, '129.50']) {
        assert.match(validateMenuItemInput({ name: 'Masala Dosa', categoryId: uuid, price }).error, /price/);
    }
});

test('production validation rejects impossible dates and requires an idempotency key', () => {
    assert.match(
        validateProductionInput({
            recipeId: uuid,
            quantity: 1,
            productionDate: '2025-14-40',
        }, true).error,
        /YYYY-MM-DD/,
    );
    assert.match(
        validateProductionInput({ recipeId: uuid, quantity: 1 }, false).error,
        /idempotencyKey/,
    );
});

test('recipe validation rejects duplicate stock lines and unknown properties', () => {
    const body = {
        baseProductionQuantity: 1,
        baseProductionUnit: 'kg',
        expectedPlateCount: 4,
        wastagePercentage: 2,
        ingredients: [
            { stockItemId: uuid, quantity: 100, unit: 'g' },
            { stockItemId: uuid, quantity: 50, unit: 'g' },
        ],
    };
    assert.match(validateRecipeVersionInput(body).error, /once/);
    assert.match(
        validateRecipeVersionInput({ ...body, ingredients: [body.ingredients[0]], secret: true }).error,
        /Unsupported recipe field/,
    );
});

test('cancellation validation requires a reason and valid, unique recovery rows', () => {
    assert.match(validateCancellationInput({ recoveries: [] }).error, /reason/);
    assert.match(validateCancellationInput({
        reason: 'Batch stopped',
        recoveries: [
            { productionIngredientId: uuid, quantityRecovered: 0.5 },
            { productionIngredientId: uuid, quantityRecovered: 0.25 },
        ],
    }).error, /once/);
});

test('POS sale validation requires whole plate quantities and a supported payment method', () => {
    const body = {
        productionDate: '2026-11-20',
        idempotencyKey: 'checkout-key-1',
        paymentMethod: 'upi',
        discountAmount: 10,
        taxRate: 5,
        packingCharge: 2,
        items: [{ menuItemId: uuid, quantity: 2 }],
    };
    assert.deepEqual(validateProductionSaleInput(body).value, {
        ...body,
        items: [{ menuItemId: uuid, quantity: 2 }],
    });
    assert.match(validateProductionSaleInput({
        ...body,
        items: [{ menuItemId: uuid, quantity: 1.5 }],
    }).error, /whole-number/);
    assert.match(validateProductionSaleInput({ ...body, paymentMethod: 'wallet' }).error, /paymentMethod/);
    assert.match(validateProductionSaleInput({ ...body, paymentStatus: 'completed' }).error, /Unsupported sale field/);
});

test('POS split payments require two distinct positive tenders', () => {
    const body = {
        productionDate: '2026-11-20',
        idempotencyKey: 'checkout-split-1',
        paymentMethod: 'split',
        discountAmount: 0,
        items: [{ menuItemId: uuid, quantity: 1 }],
    };
    const split = validateProductionSaleInput({
        ...body,
        paymentBreakdown: { cash: 25, card: 75 },
    });
    assert.deepEqual(split.value.paymentBreakdown, { cash: 25, card: 75 });
    assert.match(validateProductionSaleInput({
        ...body,
        paymentBreakdown: { cash: 100 },
    }).error, /exactly two distinct/);
    assert.match(validateProductionSaleInput({
        ...body,
        paymentBreakdown: { cash: 0, card: 100 },
    }).error, /paymentBreakdown.cash/);
    assert.match(validateProductionSaleInput({
        ...body,
        paymentBreakdown: { cash: 50, wallet: 50 },
    }).error, /exactly two distinct/);
});

test('daily closing and operating expenses validate dates and positive amounts', () => {
    assert.equal(validateProductionDayInput({ productionDate: '2026-02-30' }).error !== undefined, true);
    assert.equal(validateProductionDayInput({ productionDate: '2026-11-20' }).value.productionDate, '2026-11-20');
    assert.match(validateOperatingExpenseInput({
        expenseDate: '2026-11-20',
        category: 'Rent',
        description: 'November rent',
        amount: 0,
    }).error, /amount/);
});
