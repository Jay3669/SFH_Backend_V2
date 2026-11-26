import test from 'node:test';
import assert from 'node:assert/strict';
import {
    validateMenuCategoryInput,
    validateMenuCategoryListQuery,
} from '../src/validators/menuCategoryValidator.js';

test('menu category creation trims values and accepts automatic display order', () => {
    assert.deepEqual(validateMenuCategoryInput({
        name: '  Breakfast  ',
        description: '  Served before noon  ',
        imageUrl: ' https://example.com/breakfast.png ',
    }), {
        value: {
            name: 'Breakfast',
            description: 'Served before noon',
            imageUrl: 'https://example.com/breakfast.png',
        },
    });
});

test('menu category updates preserve omitted values and validate supplied fields', () => {
    assert.deepEqual(validateMenuCategoryInput({ description: null }, true), {
        value: { description: null },
    });
    assert.deepEqual(validateMenuCategoryInput({ imageUrl: null }, true), {
        value: { imageUrl: null },
    });
    assert.match(validateMenuCategoryInput({ displayOrder: 1.5 }, true).error, /integer/);
    assert.match(validateMenuCategoryInput({ isActive: 'false' }, true).error, /boolean/);
    assert.match(validateMenuCategoryInput({ imageUrl: 'x'.repeat(2049) }, true).error, /imageUrl/);
    assert.match(validateMenuCategoryInput({}, true).error, /at least one/);
});

test('menu category queries default to display order and reject invalid filters', () => {
    assert.deepEqual(validateMenuCategoryListQuery({}).value, {
        page: 1,
        limit: 20,
        offset: 0,
        q: '',
        status: 'all',
        sort: 'displayOrder',
        order: 'ASC',
    });
    assert.match(validateMenuCategoryListQuery({ limit: '101' }).error, /limit/);
    assert.match(validateMenuCategoryListQuery({ status: 'archived' }).error, /status/);
});
