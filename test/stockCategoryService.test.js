import test from 'node:test';
import assert from 'node:assert/strict';
import { listStockCategories } from '../src/services/stockCategoryService.js';
import { StockCategory, StockItem } from '../src/models/stock.model.js';

test('listing categories does not pass the array index as a transaction', async (t) => {
    const categories = [
        { id: 'category-1', toJSON: () => ({ id: 'category-1' }) },
        { id: 'category-2', toJSON: () => ({ id: 'category-2' }) },
    ];

    t.mock.method(StockCategory, 'findAll', async () => categories);
    t.mock.method(StockItem, 'count', async (options) => {
        assert.equal(options.transaction, undefined);
        return 0;
    });

    const result = await listStockCategories();

    assert.deepEqual(result, [
        { id: 'category-1', itemCount: 0 },
        { id: 'category-2', itemCount: 0 },
    ]);
});
