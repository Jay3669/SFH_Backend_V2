import test from 'node:test';
import assert from 'node:assert/strict';
import database from '../src/config/database.js';
import {
    ProductionDay,
    ProductionIngredient,
    ProductionRecord,
    ProductionSaleItem,
    ProductionCancellation,
    ProductionRecovery,
} from '../src/models/production.model.js';
import { StockItem, StockMovement } from '../src/models/stock.model.js';
import { cancelProduction } from '../src/services/productionService.js';

test('cancellation restores every recorded ingredient once in the same transaction', async (t) => {
    const transaction = { LOCK: { UPDATE: 'UPDATE' } };
    const record = {
        id: '3b241101-e2bb-4255-8caf-4136c566a962',
        productionDate: '2026-11-27',
        reference: 'PRD-20261127-3B241101',
        status: 'confirmed',
        async update(values) {
            Object.assign(this, values);
        },
    };
    const ingredientRows = ['Apple', 'Grapes', 'Orange', 'Papaya', 'Pineapple'].map((name, index) => ({
        id: `3b241101-e2bb-4255-8caf-4136c566a96${index}`,
        stockItemId: `4b241101-e2bb-4255-8caf-4136c566a96${index}`,
        ingredientName: name,
        quantityDeducted: '3.060',
        unit: 'kg',
        unitCost: '600.00',
    }));
    const stockItems = ingredientRows.map((ingredient) => ({
        id: ingredient.stockItemId,
        quantity: '10.000',
        unitCost: '600.00',
        unit: 'kg',
        async update(values) {
            Object.assign(this, values);
        },
    }));
    const movements = [];
    const recoveries = [];
    let movementSequence = 0;

    t.mock.method(database.sequelize, 'transaction', async (callback) => callback(transaction));
    t.mock.method(ProductionDay, 'findOrCreate', async () => [{ isClosed: false }, true]);
    t.mock.method(ProductionDay, 'findOne', async () => ({ isClosed: false }));
    t.mock.method(ProductionRecord, 'findByPk', async () => record);
    t.mock.method(ProductionSaleItem, 'sum', async () => 0);
    t.mock.method(ProductionIngredient, 'findAll', async () => ingredientRows);
    t.mock.method(StockItem, 'findAll', async () => stockItems);
    t.mock.method(ProductionCancellation, 'create', async () => ({ id: '5b241101-e2bb-4255-8caf-4136c566a962' }));
    t.mock.method(StockMovement, 'create', async (values) => {
        movements.push(values);
        movementSequence += 1;
        return { id: `6b241101-e2bb-4255-8caf-4136c566a96${movementSequence}` };
    });
    t.mock.method(ProductionRecovery, 'create', async (values) => {
        recoveries.push(values);
        return values;
    });

    await cancelProduction(record.id, { reason: 'Batch cancelled' }, '7b241101-e2bb-4255-8caf-4136c566a962');

    assert.equal(record.status, 'cancelled');
    assert.equal(movements.length, ingredientRows.length);
    assert.equal(recoveries.length, ingredientRows.length);
    assert.deepEqual(stockItems.map((item) => item.quantity), [13.06, 13.06, 13.06, 13.06, 13.06]);
    assert.deepEqual(movements.map((movement) => movement.quantity), ingredientRows.map(() => '3.060'));
    assert.deepEqual(recoveries.map((recovery) => recovery.quantityRecovered), ingredientRows.map(() => '3.060'));

    await assert.rejects(
        cancelProduction(record.id, { reason: 'Duplicate cancellation' }, '7b241101-e2bb-4255-8caf-4136c566a962'),
        /Production is already cancelled/,
    );
    assert.equal(movements.length, ingredientRows.length);
    assert.equal(recoveries.length, ingredientRows.length);
});
