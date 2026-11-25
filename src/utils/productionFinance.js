import { toScaledInteger } from './productionMath.js';

const centsToNumber = (cents) => Number(cents) / 100;
const roundedPlateCost = (costPerPlate, platesMilli) => (
    toScaledInteger(costPerPlate, 2, 'Cost per plate') *
    platesMilli + 500n
) / 1_000n;

export const calculateProductionDayFinancials = (productions, salesRevenue, operatingExpenses = 0) => {
    let producedMilli = 0n;
    let soldMilli = 0n;
    let productionCostCents = 0n;
    let soldFoodCostCents = 0n;
    let wastageCostCents = 0n;
    for (const production of productions) {
        const produced = toScaledInteger(production.producedPlates, 3, 'Produced plates');
        const sold = toScaledInteger(production.soldPlates, 3, 'Sold plates');
        if (sold > produced) throw new RangeError('Sold plates cannot exceed produced plates.');
        const wastage = produced - sold;
        producedMilli += produced;
        soldMilli += sold;
        productionCostCents += toScaledInteger(production.totalProductionCost, 2, 'Production cost');
        soldFoodCostCents += roundedPlateCost(production.costPerPlate, sold);
        wastageCostCents += roundedPlateCost(production.costPerPlate, wastage);
    }
    const salesRevenueCents = toScaledInteger(salesRevenue, 2, 'Sales revenue');
    const operatingExpenseCents = toScaledInteger(operatingExpenses, 2, 'Operating expenses');
    const grossProfitCents = salesRevenueCents - productionCostCents;
    const netProfitCents = grossProfitCents - operatingExpenseCents;
    return {
        producedPlates: Number(producedMilli) / 1_000,
        soldPlates: Number(soldMilli) / 1_000,
        wastagePlates: Number(producedMilli - soldMilli) / 1_000,
        productionCost: centsToNumber(productionCostCents),
        soldFoodCost: centsToNumber(soldFoodCostCents),
        wastageCost: centsToNumber(wastageCostCents),
        salesRevenue: centsToNumber(salesRevenueCents),
        grossProfit: centsToNumber(grossProfitCents),
        grossLoss: centsToNumber(grossProfitCents < 0n ? -grossProfitCents : 0n),
        operatingExpenses: centsToNumber(operatingExpenseCents),
        netProfit: centsToNumber(netProfitCents),
        netLoss: centsToNumber(netProfitCents < 0n ? -netProfitCents : 0n),
    };
};
