import test from 'node:test';
import assert from 'node:assert/strict';
import { validateStockCategoryInput } from '../src/validators/stockCategoryValidator.js';

test('validates and normalizes stock category fields', () => {
    assert.deepEqual(
        validateStockCategoryInput({ name: '  Dry Goods ', description: ' Pantry items ' }).value,
        { name: 'Dry Goods', description: 'Pantry items' },
    );
});

test('requires a category name and rejects unsupported fields', () => {
    assert.match(validateStockCategoryInput({ description: 'Pantry' }).error, /category name/);
    assert.match(validateStockCategoryInput({ name: 'Pantry', itemCount: 2 }).error, /Unsupported/);
    assert.match(validateStockCategoryInput({ name: 'Pantry', categoryCode: 'CAT-000001' }).error, /Unsupported/);
});

test('allows partial description updates but rejects empty updates', () => {
    assert.deepEqual(validateStockCategoryInput({ description: null }, true).value, { description: null });
    assert.match(validateStockCategoryInput({}, true).error, /update/);
});

test('validates stock category image and display order', () => {
    assert.deepEqual(
        validateStockCategoryInput({
            name: 'Spices',
            imageUrl: ' https://example.com/spices.png ',
            displayOrder: 3,
        }).value,
        { name: 'Spices', imageUrl: 'https://example.com/spices.png', displayOrder: 3 },
    );
    assert.deepEqual(validateStockCategoryInput({ name: 'Spices', displayOrder: null }).value, {
        name: 'Spices',
    });
    assert.match(validateStockCategoryInput({ name: 'Spices', displayOrder: 0 }).error, /from 1/);
    assert.match(validateStockCategoryInput({ name: 'Spices', displayOrder: 1.5 }).error, /displayOrder/);
    assert.match(validateStockCategoryInput({ displayOrder: null }, true).error, /from 1/);
    assert.match(
        validateStockCategoryInput({ name: 'Spices', imageUrl: 'x'.repeat(2049) }).error,
        /imageUrl/,
    );
});
