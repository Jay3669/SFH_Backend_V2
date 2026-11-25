const CATEGORY_FIELDS = new Set(['name', 'description', 'imageUrl', 'displayOrder']);
export const MAX_STOCK_CATEGORY_DISPLAY_ORDER = 100000;
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export const validateStockCategoryInput = (body, partial = false) => {
    if (!isObject(body)) return { error: 'A JSON object is required.' };
    const unknownField = Object.keys(body).find((field) => !CATEGORY_FIELDS.has(field));
    if (unknownField) return { error: `Unsupported stock category field: ${unknownField}.` };
    if (Object.keys(body).length === 0) {
        return { error: partial ? 'Provide a category field to update.' : 'Category name is required.' };
    }

    const value = {};
    if (!partial || Object.prototype.hasOwnProperty.call(body, 'name')) {
        if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 80) {
            return { error: 'Provide a category name of at most 80 characters.' };
        }
        value.name = body.name.trim();
    }
    if (Object.prototype.hasOwnProperty.call(body, 'description')) {
        if (body.description !== null && typeof body.description !== 'string') {
            return { error: 'Category description must be a string.' };
        }
        const description = typeof body.description === 'string' ? body.description.trim() : '';
        if (description.length > 255) {
            return { error: 'Category description must be at most 255 characters.' };
        }
        value.description = description || null;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'imageUrl')) {
        if (body.imageUrl !== null && (typeof body.imageUrl !== 'string' || body.imageUrl.length > 2048)) {
            return { error: 'imageUrl must be at most 2048 characters.' };
        }
        const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : '';
        value.imageUrl = imageUrl || null;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'displayOrder')) {
        if (!partial && (body.displayOrder === null || body.displayOrder === undefined)) {
            return { value };
        }
        if (!Number.isInteger(body.displayOrder) ||
            body.displayOrder < 1 ||
            body.displayOrder > MAX_STOCK_CATEGORY_DISPLAY_ORDER) {
            return { error: `displayOrder must be an integer from 1 to ${MAX_STOCK_CATEGORY_DISPLAY_ORDER}.` };
        }
        value.displayOrder = body.displayOrder;
    }
    return { value };
};
