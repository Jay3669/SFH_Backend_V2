import express from 'express';
import {
    createMenuCategoryController,
    deleteMenuCategoryController,
    getMenuCategoryController,
    listMenuCategoriesController,
    updateMenuCategoryController,
} from '../controllers/menuCategoryController.js';
import { authenticateToken, authorizePermission } from '../middleware/auth.js';

const router = express.Router();

router.use('/admin/production/menu-categories', authenticateToken);
router.get(
    '/admin/production/menu-categories',
    authorizePermission('menu:read'),
    listMenuCategoriesController,
);
router.post(
    '/admin/production/menu-categories',
    authorizePermission('menu:create'),
    createMenuCategoryController,
);
router.get(
    '/admin/production/menu-categories/:categoryId',
    authorizePermission('menu:read'),
    getMenuCategoryController,
);
router.put(
    '/admin/production/menu-categories/:categoryId',
    authorizePermission('menu:update'),
    updateMenuCategoryController,
);
router.patch(
    '/admin/production/menu-categories/:categoryId',
    authorizePermission('menu:update'),
    updateMenuCategoryController,
);
router.delete(
    '/admin/production/menu-categories/:categoryId',
    authorizePermission('menu:update'),
    deleteMenuCategoryController,
);

export default router;
