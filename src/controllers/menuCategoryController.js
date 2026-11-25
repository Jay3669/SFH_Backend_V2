import { CREATED, OPERATION_SUCCESS } from '../function/response.js';
import {
    createMenuCategory,
    deleteMenuCategory,
    getMenuCategory,
    listMenuCategories,
    updateMenuCategory,
} from '../services/menuCategoryService.js';

export const listMenuCategoriesController = async (req, res, next) => {
    try {
        const result = await listMenuCategories(req.query);
        return res.status(200).json(
            OPERATION_SUCCESS('Menu categories loaded.', result.items, result.pagination),
        );
    } catch (error) {
        return next(error);
    }
};

export const getMenuCategoryController = async (req, res, next) => {
    try {
        return res.status(200).json(
            OPERATION_SUCCESS('Menu category loaded.', await getMenuCategory(req.params.categoryId)),
        );
    } catch (error) {
        return next(error);
    }
};

export const createMenuCategoryController = async (req, res, next) => {
    try {
        return res.status(201).json(
            CREATED('Menu category created.', await createMenuCategory(req.body)),
        );
    } catch (error) {
        return next(error);
    }
};

export const updateMenuCategoryController = async (req, res, next) => {
    try {
        return res.status(200).json(
            OPERATION_SUCCESS(
                'Menu category updated.',
                await updateMenuCategory(req.params.categoryId, req.body),
            ),
        );
    } catch (error) {
        return next(error);
    }
};

export const deleteMenuCategoryController = async (req, res, next) => {
    try {
        const result = await deleteMenuCategory(req.params.categoryId);
        return res.status(200).json(OPERATION_SUCCESS(
            result.deactivated
                ? 'Category has associated menu items and was deactivated.'
                : 'Menu category deleted.',
            result,
        ));
    } catch (error) {
        return next(error);
    }
};
