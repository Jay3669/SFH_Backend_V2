import test from 'node:test';
import assert from 'node:assert/strict';
import { findNextStockCategoryDisplayOrder } from '../src/utils/stockCategoryDisplayOrder.js';

test('finds the first missing positive category order', () => {
    assert.equal(findNextStockCategoryDisplayOrder([]), 1);
    assert.equal(findNextStockCategoryDisplayOrder([1, 2, 3]), 4);
    assert.equal(findNextStockCategoryDisplayOrder([1, 3, 5]), 2);
    assert.equal(findNextStockCategoryDisplayOrder([1, 2, 3, 5]), 4);
});
