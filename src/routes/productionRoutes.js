import express from 'express';
import {
    archiveRecipeController,
    cancelProductionController,
    closeProductionDayController,
    confirmProductionController,
    completeProductionSaleController,
    createMenuItemController,
    createRecipeController,
    createRecipeVersionController,
    getProductionRecordController,
    financialProductionReportController,
    getRecipeController,
    listMenuItemsController,
    listProductionRecordsController,
    listProductionStockItemsController,
    listRecipesController,
    previewProductionController,
    productionAvailabilityController,
    productionReportController,
    operatingExpensesController,
    updateMenuItemController,
    updateProductionYieldController,
} from '../controllers/productionController.js';
import { authenticateToken, authorizePermission } from '../middleware/auth.js';

const router = express.Router();

router.use('/admin/production', authenticateToken);

router.get('/admin/production/menu-items', authorizePermission('menu:read'), listMenuItemsController);
router.post('/admin/production/menu-items', authorizePermission('menu:create'), createMenuItemController);
router.patch('/admin/production/menu-items/:menuItemId', authorizePermission('menu:update'), updateMenuItemController);
router.get('/admin/production/stock-items', authorizePermission('recipes:read'), listProductionStockItemsController);

router.get('/admin/production/recipes', authorizePermission('recipes:read'), listRecipesController);
router.post('/admin/production/recipes', authorizePermission('recipes:create'), createRecipeController);
router.get('/admin/production/recipes/:recipeId', authorizePermission('recipes:read'), getRecipeController);
router.post('/admin/production/recipes/:recipeId/versions', authorizePermission('recipes:update'), createRecipeVersionController);
router.patch('/admin/production/recipes/:recipeId/archive', authorizePermission('recipes:archive'), archiveRecipeController);

router.get('/admin/production/reports', authorizePermission('production:reports:read'), productionReportController);
router.get('/admin/production/financial-reports', authorizePermission('production:reports:read'), financialProductionReportController);
router.get('/admin/production/expenses', authorizePermission('production:reports:read'), operatingExpensesController);
router.post('/admin/production/expenses', authorizePermission('production:expenses:manage'), operatingExpensesController);
router.get('/admin/production/availability', authorizePermission('production:pos:read'), productionAvailabilityController);
router.post('/admin/production/sales', authorizePermission('production:pos:checkout'), completeProductionSaleController);
router.post('/admin/production/close', authorizePermission('production:close'), closeProductionDayController);
router.post('/admin/production/preview', authorizePermission('production:preview'), previewProductionController);
router.get('/admin/production/records', authorizePermission('production:read'), listProductionRecordsController);
router.post('/admin/production/records', authorizePermission('production:create'), confirmProductionController);
router.get('/admin/production/records/:productionId', authorizePermission('production:read'), getProductionRecordController);
router.patch('/admin/production/records/:productionId/yield', authorizePermission('production:update'), updateProductionYieldController);
router.post('/admin/production/records/:productionId/cancel', authorizePermission('production:cancel'), cancelProductionController);

export default router;
