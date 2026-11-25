import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateProductionDayFinancials } from '../src/utils/productionFinance.js';

test('daily production P&L records wastage without subtracting it twice', () => {
    const result = calculateProductionDayFinancials([{
        producedPlates: 8,
        soldPlates: 5,
        totalProductionCost: 500,
        costPerPlate: 62.5,
    }], 600);

    assert.deepEqual(result, {
        producedPlates: 8,
        soldPlates: 5,
        wastagePlates: 3,
        productionCost: 500,
        soldFoodCost: 312.5,
        wastageCost: 187.5,
        salesRevenue: 600,
        grossProfit: 100,
        grossLoss: 0,
        operatingExpenses: 0,
        netProfit: 100,
        netLoss: 0,
    });
});

test('operating expenses affect net profit but not gross profit', () => {
    const result = calculateProductionDayFinancials([{
        producedPlates: 10,
        soldPlates: 10,
        totalProductionCost: 500,
        costPerPlate: 50,
    }], 600, 150);

    assert.equal(result.grossProfit, 100);
    assert.equal(result.netProfit, -50);
    assert.equal(result.netLoss, 50);
});
