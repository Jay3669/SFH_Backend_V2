import test from 'node:test';
import assert from 'node:assert/strict';
import {
    validateStockItemInput,
    validateStockMovementInput,
} from '../src/validators/stockValidator.js';

test('validates stock item fields and preserves category identifiers', () => {
    const result = validateStockItemInput({
        name: '  Basmati rice ',
        unit: 'kg',
        categoryId: '4a70b1cb-6e4a-4f4e-9f75-04d0d921ac68',
        reorderLevel: 3.25,
        imageUrl: ' https://example.com/rice.png ',
        expiryDate: '2027-01-31',
        displayOrder: 4,
    });

    assert.deepEqual(result.value, {
        name: 'Basmati rice',
        categoryId: '4a70b1cb-6e4a-4f4e-9f75-04d0d921ac68',
        unit: 'kg',
        sku: null,
        reorderLevel: 3.25,
        imageUrl: 'https://example.com/rice.png',
        expiryDate: '2027-01-31',
        displayOrder: 4,
    });
    assert.equal(validateStockItemInput({ name: 'Flour', unit: 'kg' }).value.category, 'General');
});

test('rejects direct quantity changes and excessive decimal precision', () => {
    assert.match(
        validateStockItemInput({
            name: 'Rice',
            unit: 'kg',
            quantity: 10,
        }).error,
        /Unsupported stock item field/,
    );
    assert.match(
        validateStockItemInput({
            name: 'Rice',
            unit: 'kg',
            reorderLevel: 1.2345,
        }).error,
        /at most 3 decimal places/,
    );
});

test('accepts positive receipts and zero-count adjustments with a reason', () => {
    assert.deepEqual(
        validateStockMovementInput({
            type: 'in',
            quantity: 1.25,
            unitCost: 64.5,
            reason: 'Supplier delivery',
        }).value,
        { type: 'in', quantity: 1.25, unitCost: 64.5, totalCost: 80.63, reason: 'Supplier delivery' },
    );
    assert.deepEqual(
        validateStockMovementInput({
            type: 'in',
            quantity: 10,
            totalCost: 600,
            reason: 'Supplier delivery',
        }).value,
        { type: 'in', quantity: 10, unitCost: 60, totalCost: 600, reason: 'Supplier delivery' },
    );
    assert.equal(
        validateStockMovementInput({ type: 'count', quantity: 0, reason: 'Physical count' }).error,
        undefined,
    );
});

test('rejects zero issues and movement records without a reason', () => {
    assert.match(
        validateStockMovementInput({ type: 'out', quantity: 0, reason: 'Kitchen issue' }).error,
        /Quantity must be a number/,
    );
    assert.match(
        validateStockMovementInput({ type: 'in', quantity: 2, unitCost: 10, reason: ' ' }).error,
        /Provide a reason/,
    );
    assert.match(
        validateStockMovementInput({
            type: 'in',
            quantity: 2,
            unitCost: 10,
            totalCost: 20,
            reason: 'Supplier delivery',
        }).error,
        /exactly one/,
    );
    assert.match(
        validateStockMovementInput({ type: 'in', quantity: 2, reason: 'Supplier delivery' }).error,
        /exactly one/,
    );
});

test('requires a category and does not allow computed cost edits', () => {
    assert.match(
        validateStockItemInput({ name: 'Rice', unit: 'kg', categoryId: 'not-an-id' }).error,
        /valid stock category/,
    );
    assert.match(
        validateStockItemInput({ name: 'Rice', unit: 'kg', unitCost: 5 }).error,
        /Unsupported stock item field/,
    );
    assert.match(
        validateStockItemInput({ name: 'Rice', unit: 'kg', itemCode: 'ITM-000001' }).error,
        /Unsupported stock item field/,
    );
});

test('validates stock item image, expiry date, and display order', () => {
    assert.deepEqual(
        validateStockItemInput({ name: 'Rice', unit: 'kg' }).value,
        {
            name: 'Rice',
            unit: 'kg',
            category: 'General',
            sku: null,
            imageUrl: null,
            expiryDate: null,
            displayOrder: 0,
            reorderLevel: 0,
        },
    );
    assert.match(
        validateStockItemInput({ name: 'Rice', unit: 'kg', expiryDate: '2027-02-29' }).error,
        /valid YYYY-MM-DD date/,
    );
    assert.match(
        validateStockItemInput({ name: 'Rice', unit: 'kg', displayOrder: 1.5 }).error,
        /displayOrder/,
    );
    assert.match(
        validateStockItemInput({ name: 'Rice', unit: 'kg', imageUrl: 'x'.repeat(2049) }).error,
        /imageUrl/,
    );
    assert.deepEqual(
        validateStockItemInput({ imageUrl: null, expiryDate: null, displayOrder: 2 }, true).value,
        { imageUrl: null, expiryDate: null, displayOrder: 2 },
    );
});
