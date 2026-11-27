const toScaledInteger = (value, decimalPlaces) => {
    const [whole, fraction = ''] = String(value).split('.');
    return BigInt(whole) * (10n ** BigInt(decimalPlaces))
        + BigInt((fraction + '0'.repeat(decimalPlaces)).slice(0, decimalPlaces) || '0');
};

export const calculateReceiptUnitCost = (quantity, totalCost) => {
    const quantityMilli = toScaledInteger(quantity, 3);
    const totalCostCents = toScaledInteger(totalCost, 2);
    const unitCostCents = (totalCostCents * 1000n + quantityMilli / 2n) / quantityMilli;
    return Number(unitCostCents) / 100;
};

export const calculateReceiptTotalCost = (quantity, unitCost) => {
    const quantityMilli = toScaledInteger(quantity, 3);
    const unitCostCents = toScaledInteger(unitCost, 2);
    const totalCostCents = (quantityMilli * unitCostCents + 500n) / 1000n;
    return Number(totalCostCents) / 100;
};

export const calculateWeightedAverageCost = (
    onHandQuantity,
    onHandUnitCost,
    receivedQuantity,
    purchaseUnitCost,
) => {
    const onHandUnits = Math.round(onHandQuantity * 1000);
    const receivedUnits = Math.round(receivedQuantity * 1000);
    const totalUnits = onHandUnits + receivedUnits;
    if (totalUnits === 0) return 0;

    const onHandCostCents = Math.round(onHandUnitCost * 100);
    const purchaseCostCents = Math.round(purchaseUnitCost * 100);
    return Math.round(
        (onHandUnits * onHandCostCents + receivedUnits * purchaseCostCents) / totalUnits,
    ) / 100;
};
