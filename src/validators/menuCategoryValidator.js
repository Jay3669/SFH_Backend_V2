const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DISPLAY_ORDER = 2_147_483_647;

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const optionalQueryString = (value, field, maximum) => {
    if (value === undefined) return { value: '' };
    if (typeof value !== 'string' || value.length > maximum) {
        return { error: `${field} must be a string of at most ${maximum} characters.` };
    }
    return { value: value.trim() };
};

const positiveIntegerQuery = (value, field, fallback, maximum = Number.MAX_SAFE_INTEGER) => {
    if (value === undefined) return { value: fallback };
    if (typeof value !== 'string' || !/^\d+$/.test(value)) {
        return { error: `${field} must be a positive integer.` };
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
        return { error: `${field} must be from 1 to ${maximum}.` };
    }
    return { value: parsed };
};

export const validateMenuCategoryInput = (body, partial = false) => {
    if (!isObject(body)) return { error: 'A JSON object is required.' };
    const allowed = new Set(['name', 'description', 'displayOrder', 'isActive']);
    const unsupported = Object.keys(body).find((field) => !allowed.has(field));
    if (unsupported) return { error: `Unsupported menu category field: ${unsupported}.` };
    if (partial && Object.keys(body).length === 0) {
        return { error: 'Provide at least one menu category field.' };
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
            return { error: 'description must be a string or null.' };
        }
        if (typeof body.description === 'string' && body.description.length > 255) {
            return { error: 'description must be at most 255 characters.' };
        }
        value.description = typeof body.description === 'string'
            ? body.description.trim() || null
            : null;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'displayOrder')) {
        if (!Number.isInteger(body.displayOrder) ||
            body.displayOrder < 0 ||
            body.displayOrder > MAX_DISPLAY_ORDER) {
            return { error: `displayOrder must be an integer from 0 to ${MAX_DISPLAY_ORDER}.` };
        }
        value.displayOrder = body.displayOrder;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'isActive')) {
        if (typeof body.isActive !== 'boolean') return { error: 'isActive must be a boolean.' };
        value.isActive = body.isActive;
    }
    return { value };
};

export const validateMenuCategoryListQuery = (query) => {
    const page = positiveIntegerQuery(query.page, 'page', 1);
    if (page.error) return page;
    const limit = positiveIntegerQuery(query.limit, 'limit', 20, 100);
    if (limit.error) return limit;
    const q = optionalQueryString(query.q, 'q', 100);
    if (q.error) return q;

    const status = query.status === undefined ? 'all' : query.status;
    if (!['active', 'inactive', 'all'].includes(status)) {
        return { error: 'status must be active, inactive, or all.' };
    }
    const sort = query.sort === undefined ? 'displayOrder' : query.sort;
    if (!['displayOrder', 'name', 'createdAt'].includes(sort)) {
        return { error: 'sort must be displayOrder, name, or createdAt.' };
    }
    const order = query.order === undefined ? 'asc' : query.order;
    if (typeof order !== 'string' || !['asc', 'desc'].includes(order.toLowerCase())) {
        return { error: 'order must be asc or desc.' };
    }

    return {
        value: {
            page: page.value,
            limit: limit.value,
            offset: (page.value - 1) * limit.value,
            q: q.value,
            status,
            sort,
            order: order.toUpperCase(),
        },
    };
};

export const isValidMenuCategoryId = (id) =>
    typeof id === 'string' && UUID_PATTERN.test(id);
