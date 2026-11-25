import express from 'express';
import {
    archiveStockItemController,
    createStockCategoryController,
    createStockItemController,
    createStockMovementController,
    deleteStockCategoryController,
    getStockCategoryController,
    getStockItemController,
    getStockSummaryController,
    listStockItemsController,
    listStockMovementsController,
    listStockCategoriesController,
    restoreStockItemController,
    updateStockItemController,
    updateStockCategoryController,
} from '../controllers/stockController.js';
import { authenticateToken, authorizePermission } from '../middleware/auth.js';

const router = express.Router();

router.use('/admin/stock', authenticateToken);
router.get('/admin/stock/summary', authorizePermission('inventory:read'), getStockSummaryController);
router.get('/admin/stock/categories', authorizePermission('inventory:read'), listStockCategoriesController);
router.post('/admin/stock/categories', authorizePermission('inventory:manage'), createStockCategoryController);
router.get('/admin/stock/categories/:categoryId', authorizePermission('inventory:read'), getStockCategoryController);
router.patch('/admin/stock/categories/:categoryId', authorizePermission('inventory:manage'), updateStockCategoryController);
router.delete('/admin/stock/categories/:categoryId', authorizePermission('inventory:manage'), deleteStockCategoryController);
router.get('/admin/stock/items', authorizePermission('inventory:read'), listStockItemsController);
router.post('/admin/stock/items', authorizePermission('inventory:manage'), createStockItemController);
router.get('/admin/stock/items/:itemId', authorizePermission('inventory:read'), getStockItemController);
router.patch('/admin/stock/items/:itemId', authorizePermission('inventory:manage'), updateStockItemController);
router.patch('/admin/stock/items/:itemId/restore', authorizePermission('inventory:manage'), restoreStockItemController);
router.delete('/admin/stock/items/:itemId', authorizePermission('inventory:manage'), archiveStockItemController);
router.get('/admin/stock/movements', authorizePermission('inventory:read'), listStockMovementsController);
router.post('/admin/stock/items/:itemId/movements', authorizePermission('inventory:manage'), createStockMovementController);

export default router;
