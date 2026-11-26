import { Op, UniqueConstraintError } from 'sequelize';
import database, { schema } from '../config/database.js';
import MenuCategory from '../models/menuCategory.model.js';
import MenuItem from '../models/menuItem.model.js';
import {
    isValidMenuCategoryId,
    validateMenuCategoryInput,
    validateMenuCategoryListQuery,
} from '../validators/menuCategoryValidator.js';

export class MenuCategoryError extends Error {
    constructor(statusCode, message, code = 'MENU_CATEGORY_ERROR') {
        super(message);
        this.name = 'MenuCategoryError';
        this.statusCode = statusCode;
        this.code = code;
    }
}

const validate = (result) => {
    if (result.error) throw new MenuCategoryError(400, result.error, 'VALIDATION_ERROR');
    return result.value;
};

const validateId = (id) => {
    if (!isValidMenuCategoryId(id)) {
        throw new MenuCategoryError(400, 'A valid menu category ID is required.', 'VALIDATION_ERROR');
    }
};

const notFound = () => new MenuCategoryError(404, 'Menu category not found.', 'NOT_FOUND');
const MAX_DISPLAY_ORDER = 2_147_483_647;

const lockCategoryOrdering = (transaction) => database.sequelize.query(
    `LOCK TABLE "${schema}"."menu_categories" IN SHARE ROW EXCLUSIVE MODE`,
    { transaction },
);

const throwCategoryNameConflict = (error) => {
    if (error instanceof UniqueConstraintError || error.name === 'SequelizeUniqueConstraintError') {
        throw new MenuCategoryError(409, 'A menu category with this name already exists.', 'CATEGORY_NAME_EXISTS');
    }
    throw error;
};

const mapMenuItemCounts = async (categories, transaction) => {
    if (categories.length === 0) return [];
    const counts = await MenuItem.findAll({
        attributes: [
            'categoryId',
            [database.sequelize.fn('COUNT', database.sequelize.col('id')), 'menuItemCount'],
        ],
        where: { categoryId: { [Op.in]: categories.map((category) => category.id) } },
        group: ['categoryId'],
        raw: true,
        transaction,
    });
    const countById = new Map(counts.map((row) => [row.categoryId, Number(row.menuItemCount)]));
    return categories.map((category) => ({
        ...category.toJSON(),
        menuItemCount: countById.get(category.id) || 0,
    }));
};

const mapMenuItemCount = async (category, transaction) => {
    const menuItemCount = await MenuItem.count({
        where: { categoryId: category.id },
        transaction,
    });
    return { ...category.toJSON(), menuItemCount };
};

export const listMenuCategories = async (query) => {
    const value = validate(validateMenuCategoryListQuery(query));
    const where = {};
    if (value.status !== 'all') where.isActive = value.status === 'active';
    if (value.q) {
        where[Op.or] = [
            { name: { [Op.iLike]: `%${value.q}%` } },
            { description: { [Op.iLike]: `%${value.q}%` } },
        ];
    }
    const { count, rows } = await MenuCategory.findAndCountAll({
        where,
        limit: value.limit,
        offset: value.offset,
        order: [[value.sort, value.order], ['name', 'ASC'], ['id', 'ASC']],
    });
    return {
        items: await mapMenuItemCounts(rows),
        pagination: {
            page: value.page,
            limit: value.limit,
            total: count,
            totalPages: Math.ceil(count / value.limit),
        },
    };
};

export const getMenuCategory = async (id) => {
    validateId(id);
    const category = await MenuCategory.findByPk(id);
    if (!category) throw notFound();
    return mapMenuItemCount(category);
};

export const createMenuCategory = async (body) => {
    const value = validate(validateMenuCategoryInput(body));
    try {
        return await database.sequelize.transaction(async (transaction) => {
            if (value.displayOrder === undefined) {
                await lockCategoryOrdering(transaction);
                const currentMaximum = await MenuCategory.max('displayOrder', { transaction });
                value.displayOrder = (currentMaximum === null ? 0 : Number(currentMaximum)) + 1;
                if (value.displayOrder > MAX_DISPLAY_ORDER) {
                    throw new MenuCategoryError(409, 'No available menu category display order remains.', 'CONFLICT');
                }
            }
            const category = await MenuCategory.create(value, { transaction });
            return { ...category.toJSON(), menuItemCount: 0 };
        });
    } catch (error) {
        throwCategoryNameConflict(error);
    }
};

export const updateMenuCategory = async (id, body) => {
    validateId(id);
    const value = validate(validateMenuCategoryInput(body, true));
    try {
        return await database.sequelize.transaction(async (transaction) => {
            const category = await MenuCategory.findByPk(id, {
                transaction,
                lock: transaction.LOCK.UPDATE,
            });
            if (!category) throw notFound();

            await category.update(value, { transaction });
            if (value.name !== undefined) {
                await MenuItem.update(
                    { category: value.name },
                    { where: { categoryId: category.id }, transaction },
                );
            }
            return mapMenuItemCount(category, transaction);
        });
    } catch (error) {
        throwCategoryNameConflict(error);
    }
};

export const deleteMenuCategory = async (id) => {
    validateId(id);
    return database.sequelize.transaction(async (transaction) => {
        const category = await MenuCategory.findByPk(id, {
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        if (!category) throw notFound();

        const associatedMenuItemCount = await MenuItem.count({
            where: { categoryId: category.id },
            transaction,
        });
        if (associatedMenuItemCount > 0) {
            await category.update({ isActive: false }, { transaction });
            return {
                category: await mapMenuItemCount(category, transaction),
                categoryId: category.id,
                deleted: false,
                deactivated: true,
                associatedMenuItemCount,
            };
        }

        await category.destroy({ transaction });
        return {
            category: null,
            categoryId: category.id,
            deleted: true,
            deactivated: false,
            associatedMenuItemCount: 0,
        };
    });
};
