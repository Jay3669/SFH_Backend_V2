import { CREATED, OPERATION_SUCCESS } from '../function/response.js';
import {
    archiveRecipe,
    cancelProduction,
    closeProductionDay,
    confirmProduction,
    completeProductionSale,
    createOperatingExpense,
    createMenuItem,
    createRecipe,
    createRecipeVersionForRecipe,
    getProductionRecord,
    getProductionReport,
    getProductionAvailability,
    getFinancialReport,
    listOperatingExpenses,
    getRecipe,
    listMenuItems,
    listProductionRecords,
    listProductionStockItems,
    listRecipes,
    previewProduction,
    updateMenuItem,
    updateProductionYield,
} from '../services/productionService.js';

export const listMenuItemsController = async (req, res, next) => {
    try {
        const result = await listMenuItems(req.query);
        return res.status(200).json(OPERATION_SUCCESS('Menu items loaded.', result.items, result.pagination));
    } catch (error) {
        return next(error);
    }
};

export const createMenuItemController = async (req, res, next) => {
    try {
        return res.status(201).json(CREATED('Menu item created.', await createMenuItem(req.body)));
    } catch (error) {
        return next(error);
    }
};

export const listProductionStockItemsController = async (req, res, next) => {
    try {
        return res.status(200).json(OPERATION_SUCCESS(
            'Active stock items loaded.',
            await listProductionStockItems(),
        ));
    } catch (error) {
        return next(error);
    }
};

export const updateMenuItemController = async (req, res, next) => {
    try {
        return res.status(200).json(OPERATION_SUCCESS(
            'Menu item updated.',
            await updateMenuItem(req.params.menuItemId, req.body),
        ));
    } catch (error) {
        return next(error);
    }
};

export const listRecipesController = async (req, res, next) => {
    try {
        const result = await listRecipes(req.query);
        return res.status(200).json(OPERATION_SUCCESS('Recipes loaded.', result.items, result.pagination));
    } catch (error) {
        return next(error);
    }
};

export const getRecipeController = async (req, res, next) => {
    try {
        return res.status(200).json(OPERATION_SUCCESS('Recipe loaded.', await getRecipe(req.params.recipeId)));
    } catch (error) {
        return next(error);
    }
};

export const createRecipeController = async (req, res, next) => {
    try {
        return res.status(201).json(CREATED(
            'Recipe created.',
            await createRecipe(req.body, req.user.id),
        ));
    } catch (error) {
        return next(error);
    }
};

export const createRecipeVersionController = async (req, res, next) => {
    try {
        return res.status(201).json(CREATED(
            'Recipe version created.',
            await createRecipeVersionForRecipe(req.params.recipeId, req.body, req.user.id),
        ));
    } catch (error) {
        return next(error);
    }
};

export const archiveRecipeController = async (req, res, next) => {
    try {
        const isArchived = req.body?.isArchived;
        return res.status(200).json(OPERATION_SUCCESS(
            isArchived ? 'Recipe archived.' : 'Recipe restored.',
            await archiveRecipe(req.params.recipeId, isArchived),
        ));
    } catch (error) {
        return next(error);
    }
};

export const previewProductionController = async (req, res, next) => {
    try {
        return res.status(200).json(OPERATION_SUCCESS('Production preview calculated.', await previewProduction(req.body)));
    } catch (error) {
        return next(error);
    }
};

export const confirmProductionController = async (req, res, next) => {
    try {
        const result = await confirmProduction(req.body, req.user.id);
        return res.status(result.duplicate ? 200 : 201).json(
            result.duplicate
                ? OPERATION_SUCCESS('Production was already confirmed.', result.production)
                : CREATED('Production confirmed and stock deducted.', result.production),
        );
    } catch (error) {
        return next(error);
    }
};

export const listProductionRecordsController = async (req, res, next) => {
    try {
        const result = await listProductionRecords(req.query);
        return res.status(200).json(OPERATION_SUCCESS('Production records loaded.', result.items, result.pagination));
    } catch (error) {
        return next(error);
    }
};

export const getProductionRecordController = async (req, res, next) => {
    try {
        return res.status(200).json(OPERATION_SUCCESS(
            'Production record loaded.',
            await getProductionRecord(req.params.productionId),
        ));
    } catch (error) {
        return next(error);
    }
};

export const updateProductionYieldController = async (req, res, next) => {
    try {
        return res.status(200).json(OPERATION_SUCCESS(
            'Production yield updated.',
            await updateProductionYield(req.params.productionId, req.body),
        ));
    } catch (error) {
        return next(error);
    }
};

export const cancelProductionController = async (req, res, next) => {
    try {
        return res.status(200).json(OPERATION_SUCCESS(
            'Production cancelled; eligible quantities were returned to stock.',
            await cancelProduction(req.params.productionId, req.body, req.user.id),
        ));
    } catch (error) {
        return next(error);
    }
};

export const productionAvailabilityController = async (req, res, next) => {
    try {
        return res.status(200).json(OPERATION_SUCCESS(
            'Available production loaded.',
            await getProductionAvailability(req.query),
        ));
    } catch (error) {
        return next(error);
    }
};

export const completeProductionSaleController = async (req, res, next) => {
    try {
        const result = await completeProductionSale(req.body, req.user.id);
        return res.status(result.duplicate ? 200 : 201).json(
            result.duplicate
                ? OPERATION_SUCCESS('This sale was already completed.', result.sale)
                : CREATED('Payment recorded and sale completed.', result.sale),
        );
    } catch (error) {
        return next(error);
    }
};

export const closeProductionDayController = async (req, res, next) => {
    try {
        return res.status(200).json(OPERATION_SUCCESS(
            'Daily production closed and remaining plates recorded as wastage.',
            await closeProductionDay(req.body, req.user.id),
        ));
    } catch (error) {
        return next(error);
    }
};

export const operatingExpensesController = async (req, res, next) => {
    try {
        if (req.method === 'POST') {
            return res.status(201).json(CREATED(
                'Operating expense recorded.',
                await createOperatingExpense(req.body, req.user.id),
            ));
        }
        return res.status(200).json(OPERATION_SUCCESS(
            'Operating expenses loaded.',
            await listOperatingExpenses(req.query),
        ));
    } catch (error) {
        return next(error);
    }
};

const escapeCsv = (value) => {
    const text = String(value ?? '');
    const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
};

export const financialProductionReportController = async (req, res, next) => {
    try {
        const report = await getFinancialReport(req.query);
        if (req.query.format === 'csv') {
            const rows = [
                ['Date', 'Menu item', 'Produced', 'Sold', 'Remaining', 'Wastage', 'Production cost', 'Sales revenue', 'Wastage cost'],
                ...report.menuItems.map((row) => [
                    row.date,
                    row.name,
                    row.producedPlates,
                    row.soldPlates,
                    row.remainingPlates,
                    row.wastagePlates,
                    row.productionCost,
                    row.salesRevenue,
                    row.wastageCost,
                ]),
            ];
            res.type('text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename="production-financial-report.csv"');
            return res.status(200).send(rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n'));
        }
        return res.status(200).json(OPERATION_SUCCESS('Production financial report loaded.', report));
    } catch (error) {
        return next(error);
    }
};

export const productionReportController = async (req, res, next) => {
    try {
        const report = await getProductionReport(req.query);
        if (req.query.format === 'csv') {
            const rows = [
                ['Date', 'Menu item', 'Batches', 'Plates', 'Production cost'],
                ...report.daily.map((row) => [
                    row.date,
                    '',
                    row.batches,
                    row.plates,
                    row.productionCost,
                ]),
                ...report.menuItems.map((row) => [
                    '',
                    row.name,
                    row.batches,
                    row.plates,
                    row.productionCost,
                ]),
            ];
            res.type('text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename="production-report.csv"');
            return res.status(200).send(rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n'));
        }
        return res.status(200).json(OPERATION_SUCCESS('Production report loaded.', report));
    } catch (error) {
        return next(error);
    }
};
