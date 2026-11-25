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
