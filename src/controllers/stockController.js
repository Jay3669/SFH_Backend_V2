import { CREATED, OPERATION_SUCCESS } from '../function/response.js';
import {
    archiveStockItem,
    createStockItem,
    createStockMovement,
    getStockItem,
    getStockSummary,
    listStockItems,
    listStockMovements,
    restoreStockItem,
    updateStockItem,
} from '../services/stockService.js';
import {
    createStockCategory,
    deleteStockCategory,
    getStockCategory,
    listStockCategories,
    updateStockCategory,
} from '../services/stockCategoryService.js';

export const getStockSummaryController = async (req, res, next) => {
    try {
        return res.status(200).json(OPERATION_SUCCESS('Stock summary loaded.', await getStockSummary()));
    } catch (error) {
        return next(error);
    }
};

export const listStockItemsController = async (req, res, next) => {
    try {
        const result = await listStockItems(req.query);
        return res.status(200).json(OPERATION_SUCCESS('Stock items loaded.', result.items, result.pagination));
    } catch (error) {
        return next(error);
    }
};

export const getStockItemController = async (req, res, next) => {
    try {
        return res.status(200).json(OPERATION_SUCCESS('Stock item loaded.', await getStockItem(req.params.itemId)));
    } catch (error) {
        return next(error);
    }
};

export const createStockItemController = async (req, res, next) => {
    try {
        return res.status(201).json(CREATED('Stock item created.', await createStockItem(req.body)));
    } catch (error) {
        return next(error);
    }
};

export const updateStockItemController = async (req, res, next) => {
    try {
        return res.status(200).json(OPERATION_SUCCESS(
            'Stock item updated.',
            await updateStockItem(req.params.itemId, req.body),
        ));
    } catch (error) {
        return next(error);
    }
};

export const archiveStockItemController = async (req, res, next) => {
    try {
        return res.status(200).json(OPERATION_SUCCESS(
            'Stock item archived.',
            await archiveStockItem(req.params.itemId),
        ));
    } catch (error) {
        return next(error);
    }
};

export const restoreStockItemController = async (req, res, next) => {
    try {
        return res.status(200).json(OPERATION_SUCCESS(
            'Stock item restored.',
            await restoreStockItem(req.params.itemId),
        ));
    } catch (error) {
        return next(error);
    }
};

export const listStockCategoriesController = async (req, res, next) => {
    try {
        return res.status(200).json(OPERATION_SUCCESS('Stock categories loaded.', await listStockCategories()));
    } catch (error) {
        return next(error);
    }
};

export const getStockCategoryController = async (req, res, next) => {
    try {
        return res.status(200).json(OPERATION_SUCCESS(
            'Stock category loaded.',
            await getStockCategory(req.params.categoryId),
        ));
    } catch (error) {
        return next(error);
    }
};

export const createStockCategoryController = async (req, res, next) => {
    try {
        return res.status(201).json(CREATED('Stock category created.', await createStockCategory(req.body)));
    } catch (error) {
        return next(error);
    }
};

export const updateStockCategoryController = async (req, res, next) => {
    try {
        return res.status(200).json(OPERATION_SUCCESS(
            'Stock category updated.',
            await updateStockCategory(req.params.categoryId, req.body),
        ));
    } catch (error) {
        return next(error);
    }
};

export const deleteStockCategoryController = async (req, res, next) => {
    try {
        return res.status(200).json(OPERATION_SUCCESS(
            'Stock category deleted.',
            await deleteStockCategory(req.params.categoryId),
        ));
    } catch (error) {
        return next(error);
    }
};

export const createStockMovementController = async (req, res, next) => {
    try {
        const result = await createStockMovement({
            itemId: req.params.itemId,
            body: req.body,
            actorUserId: req.user.id,
        });
        return res.status(201).json(CREATED('Stock movement recorded.', result));
    } catch (error) {
        return next(error);
    }
};

export const listStockMovementsController = async (req, res, next) => {
    try {
        const result = await listStockMovements(req.query);
        return res.status(200).json(OPERATION_SUCCESS(
            'Stock movements loaded.',
            result.movements,
            result.pagination,
        ));
    } catch (error) {
        return next(error);
    }
};

