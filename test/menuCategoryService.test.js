import test from 'node:test';
import assert from 'node:assert/strict';
import database from '../src/config/database.js';
import MenuCategory from '../src/models/menuCategory.model.js';
import { createMenuCategory } from '../src/services/menuCategoryService.js';

test('menu category creation assigns the next display order when omitted', async (t) => {
    const transaction = {};
    let createdValues;
    t.mock.method(database.sequelize, 'transaction', async (callback) => callback(transaction));
    t.mock.method(database.sequelize, 'query', async (sql, options) => {
        assert.match(sql, /LOCK TABLE .*menu_categories/);
        assert.equal(options.transaction, transaction);
        return [];
    });
    t.mock.method(MenuCategory, 'max', async (field, options) => {
        assert.equal(field, 'displayOrder');
        assert.equal(options.transaction, transaction);
        return 4;
    });
    t.mock.method(MenuCategory, 'create', async (values, options) => {
        createdValues = values;
        assert.equal(options.transaction, transaction);
        return { toJSON: () => ({ id: 'category-id', ...values }) };
    });

    const result = await createMenuCategory({
        name: 'Breakfast & Tiffins',
        description: 'Start your morning right.',
        isActive: true,
    });

    assert.equal(createdValues.displayOrder, 5);
    assert.equal(result.displayOrder, 5);
    assert.equal(result.menuItemCount, 0);
});
