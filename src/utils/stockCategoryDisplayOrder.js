export const findNextStockCategoryDisplayOrder = (displayOrders) => {
    const occupied = new Set(Array.from(displayOrders, Number));
    let order = 1;
    while (occupied.has(order)) order += 1;
    return order;
};
