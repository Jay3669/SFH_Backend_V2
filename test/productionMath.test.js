import test from 'node:test';
import assert from 'node:assert/strict';
import {
    calculateProductionCosts,
    calculateProductionScaling,
    convertQuantity,
} from '../src/utils/productionMath.js';

test('converts compatible stock units and rejects incompatible dimensions', () => {
    assert.equal(convertQuantity(750, 'g', 'kg'), 0.75);
    assert.equal(convertQuantity(2, 'l', 'ml'), 2000);
    assert.throws(() => convertQuantity(1, 'kg', 'piece'), /Cannot convert/);
    assert.equal(convertQuantity(0.001, 'g', 'kg'), 0);
});

test('scales ingredients, yields, and stacked wastage without floating point drift', () => {
    const result = calculateProductionScaling({
        baseProductionQuantity: 1,
        baseProductionUnit: 'kg',
        requestedQuantity: 2,
        expectedPlateCount: 4,
        recipeWastagePercentage: 2,
        ingredients: [{
            quantity: 500,
            unit: 'g',
            stockUnit: 'kg',
            unitCost: 100,
            balance: 10,
            wastagePercentage: 1,
        }],
    });

    assert.equal(result.expectedPlateCount, 8);
    assert.equal(result.ingredients[0].theoreticalQuantity, 1);
    assert.equal(result.ingredients[0].quantityDeducted, 1.03);
    assert.equal(result.ingredients[0].balanceAfterMilli, 8970n);
    assert.equal(result.ingredients[0].totalCost, 103);
});

test('scales every recipe ingredient for the requested production quantity including wastage', () => {
    const result = calculateProductionScaling({
        baseProductionQuantity: 1,
        baseProductionUnit: 'plate',
        requestedQuantity: 100,
        requestedUnit: 'plate',
        expectedPlateCount: 1,
        recipeWastagePercentage: 2,
        ingredients: ['Apple', 'Grapes', 'Orange', 'Papaya', 'Pineapple'].map((name) => ({
            name,
            quantity: 30,
            unit: 'g',
            stockUnit: 'kg',
            unitCost: 60,
            balance: 10,
        })),
    });

    assert.equal(result.ingredients.length, 5);
    assert.deepEqual(result.ingredients.map((ingredient) => ingredient.theoreticalQuantity), [
        3, 3, 3, 3, 3,
    ]);
    assert.deepEqual(result.ingredients.map((ingredient) => ingredient.quantityDeducted), [
        3.06, 3.06, 3.06, 3.06, 3.06,
    ]);
    assert.deepEqual(result.ingredients.map((ingredient) => ingredient.totalCost), [
        183.6, 183.6, 183.6, 183.6, 183.6,
    ]);
});

test('prices each 40-gram ingredient at ₹60 per kilogram as ₹96 for 40 plates', () => {
    const result = calculateProductionScaling({
        baseProductionQuantity: 1,
        baseProductionUnit: 'plate',
        requestedQuantity: 40,
        requestedUnit: 'plate',
        expectedPlateCount: 1,
        ingredients: ['Apple', 'Banana', 'Grapes'].map((name) => ({
            name,
            quantity: 40,
            unit: 'g',
            stockUnit: 'kg',
            unitCost: 60,
            balance: 10,
        })),
    });

    assert.deepEqual(result.ingredients.map((ingredient) => ingredient.totalCost), [96, 96, 96]);
    assert.equal(
        calculateProductionCosts({
            ingredients: result.ingredients,
            productionQuantity: 40,
            productionUnit: 'plate',
            expectedPlateCount: 40,
        }).costPerPlate,
        7.2,
    );
});

test('calculates ingredient, overhead, per-kilogram, and per-plate costs', () => {
    const result = calculateProductionCosts({
        ingredients: [{ totalCost: 103 }],
        additionalCosts: [{ amount: 7 }],
        productionQuantity: 2,
        productionUnit: 'kg',
        expectedPlateCount: 8,
    });

    assert.deepEqual(result, {
        totalIngredientCost: 103,
        additionalCost: 7,
        totalProductionCost: 110,
        costPerKg: 55,
        costPerPlate: 13.75,
    });
});

test('rejects scaled ingredient quantities below stock precision', () => {
    assert.throws(() => calculateProductionScaling({
        baseProductionQuantity: 100,
        baseProductionUnit: 'kg',
        requestedQuantity: 0.001,
        expectedPlateCount: 1000,
        ingredients: [{
            quantity: 0.001,
            unit: 'kg',
            stockUnit: 'kg',
            unitCost: 1,
            balance: 1,
        }],
    }), /stock precision/);
});
