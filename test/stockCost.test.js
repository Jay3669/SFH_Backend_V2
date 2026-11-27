import test from 'node:test';
import assert from 'node:assert/strict';
import {
    calculateReceiptTotalCost,
    calculateReceiptUnitCost,
    calculateWeightedAverageCost,
} from '../src/utils/stockCost.js';

test('normalizes a receipt total to cost per stock unit and back', () => {
    assert.equal(calculateReceiptUnitCost(10, 600), 60);
    assert.equal(calculateReceiptTotalCost(10, 60), 600);
});

test('computes a weighted average across receipts and resets after stock is depleted', () => {
    assert.equal(calculateWeightedAverageCost(10, 10, 10, 20), 15);
    assert.equal(calculateWeightedAverageCost(20, 15, 10, 50), 26.67);
    assert.equal(calculateWeightedAverageCost(0, 0, 3, 42.5), 42.5);
});
