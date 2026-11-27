import {
    calculateReceiptTotalCost,
    calculateReceiptUnitCost,
} from '../utils/stockCost.js';

const ITEM_CREATE_FIELDS = new Set([
    'name', 'sku', 'categoryId', 'category', 'unit', 'reorderLevel',
    'imageUrl', 'expiryDate', 'displayOrder',
]);
const ITEM_UPDATE_FIELDS = new Set([
    'name', 'sku', 'categoryId', 'category', 'unit', 'reorderLevel',
    'imageUrl', 'expiryDate', 'displayOrder',
]);
export const MAX_STOCK_QUANTITY = 99_999_999_999.999;
const MAX_COST = 999_999_999_999.99;
const MAX_DISPLAY_ORDER = 100000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isDateOnly = (value) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1) {
        return false;
    }
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const decimalValue = (value, places, max, field, minimum = 0) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > max) {
        return { error: `${field} must be a number from ${minimum} to ${max}.` };
    }
    const scale = 10 ** places;
    const rounded = Math.round(value * scale) / scale;
    if (Math.abs(value - rounded) > Number.EPSILON * Math.max(1, Math.abs(value)) * 8) {
        return { error: `${field} must have at most ${places} decimal places.` };
    }
    return { value: rounded };
};

export const validateStockItemInput = (body, partial = false) => {
    if (!isObject(body)) return { error: 'A JSON object is required.' };
    const allowedFields = partial ? ITEM_UPDATE_FIELDS : ITEM_CREATE_FIELDS;
    const unknownField = Object.keys(body).find((field) => !allowedFields.has(field));
    if (unknownField) return { error: `Unsupported stock item field: ${unknownField}.` };
    if (partial && Object.keys(body).length === 0) {
        return { error: 'Provide at least one stock item field to update.' };
    }

    const value = {};
    for (const [field, maxLength] of [['name', 120], ['unit', 24]]) {
        if (partial && !Object.prototype.hasOwnProperty.call(body, field)) continue;
        const candidate = body[field];
        if (typeof candidate !== 'string' || !candidate.trim() || candidate.trim().length > maxLength) {
            return { error: `Provide a ${field} of at most ${maxLength} characters.` };
        }
        value[field] = candidate.trim();
    }

    if (Object.prototype.hasOwnProperty.call(body, 'categoryId')) {
        if (typeof body.categoryId !== 'string' || !UUID_PATTERN.test(body.categoryId)) {
            return { error: 'Select a valid stock category.' };
        }
        value.categoryId = body.categoryId;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'category')) {
        if (typeof body.category !== 'string' || !body.category.trim() || body.category.trim().length > 80) {
            return { error: 'Provide a category name of at most 80 characters.' };
        }
        value.category = body.category.trim();
    } else if (!partial && !value.categoryId) {
        value.category = 'General';
    }
    if (value.categoryId && value.category) {
        return { error: 'Provide categoryId or category, not both.' };
    }

    if (!partial || Object.prototype.hasOwnProperty.call(body, 'sku')) {
        const sku = body.sku;
        if (sku !== undefined && sku !== null && typeof sku !== 'string') {
            return { error: 'SKU must be a string.' };
        }
        const normalizedSku = typeof sku === 'string' ? sku.trim() : '';
        if (normalizedSku.length > 64) return { error: 'SKU must be at most 64 characters.' };
        value.sku = normalizedSku || null;
    }

    if (!partial || Object.prototype.hasOwnProperty.call(body, 'imageUrl')) {
        const imageUrl = body.imageUrl;
        if (imageUrl !== undefined && imageUrl !== null && typeof imageUrl !== 'string') {
            return { error: 'imageUrl must be a string.' };
        }
        if (typeof imageUrl === 'string' && imageUrl.length > 2048) {
            return { error: 'imageUrl must be at most 2048 characters.' };
        }
        value.imageUrl = typeof imageUrl === 'string' ? imageUrl.trim() || null : null;
    }

    if (!partial || Object.prototype.hasOwnProperty.call(body, 'expiryDate')) {
        const expiryDate = typeof body.expiryDate === 'string' ? body.expiryDate.trim() : body.expiryDate;
        if (expiryDate !== undefined && expiryDate !== null && expiryDate !== '' && !isDateOnly(expiryDate)) {
            return { error: 'expiryDate must be a valid YYYY-MM-DD date or null.' };
        }
        value.expiryDate = expiryDate || null;
    }

    if (!partial || Object.prototype.hasOwnProperty.call(body, 'displayOrder')) {
        const displayOrder = body.displayOrder === undefined && !partial ? 0 : body.displayOrder;
        if (!Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > MAX_DISPLAY_ORDER) {
            return { error: `displayOrder must be an integer from 0 to ${MAX_DISPLAY_ORDER}.` };
        }
        value.displayOrder = displayOrder;
    }

    for (const [field, places, max] of [
        ['reorderLevel', 3, MAX_STOCK_QUANTITY],
    ]) {
        if (partial && !Object.prototype.hasOwnProperty.call(body, field)) continue;
        const candidate = body[field] ?? 0;
        const parsed = decimalValue(candidate, places, max, field);
        if (parsed.error) return parsed;
        value[field] = parsed.value;
    }

    return { value };
};

export const validateStockMovementInput = (body) => {
    if (!isObject(body)) return { error: 'A JSON object is required.' };
    const allowedFields = new Set(['type', 'quantity', 'reason']);
    if (body.type === 'in') {
        allowedFields.add('unitCost');
        allowedFields.add('totalCost');
    }
    const unknownField = Object.keys(body).find((field) => !allowedFields.has(field));
    if (unknownField) return { error: `Unsupported stock movement field: ${unknownField}.` };
    if (!['in', 'out', 'count'].includes(body.type)) {
        return { error: 'Movement type must be in, out, or count.' };
    }
    const parsedQuantity = decimalValue(
        body.quantity,
        3,
        MAX_STOCK_QUANTITY,
        body.type === 'count' ? 'Counted quantity' : 'Quantity',
        body.type === 'count' ? 0 : 0.001,
    );
    if (parsedQuantity.error) return parsedQuantity;
    let unitCost;
    let totalCost;
    if (body.type === 'in') {
        const hasUnitCost = Object.prototype.hasOwnProperty.call(body, 'unitCost');
        const hasTotalCost = Object.prototype.hasOwnProperty.call(body, 'totalCost');
        if (hasUnitCost === hasTotalCost) {
            return { error: 'Provide exactly one of totalCost or unitCost for a stock receipt.' };
        }
        if (hasTotalCost) {
            const parsedTotalCost = decimalValue(body.totalCost, 2, MAX_COST, 'Purchase total cost');
            if (parsedTotalCost.error) return parsedTotalCost;
            totalCost = parsedTotalCost.value;
            unitCost = calculateReceiptUnitCost(parsedQuantity.value, totalCost);
            if (unitCost > MAX_COST) {
                return { error: 'Calculated purchase unit cost exceeds the supported range.' };
            }
        } else {
            const parsedUnitCost = decimalValue(body.unitCost, 2, MAX_COST, 'Purchase unit cost');
            if (parsedUnitCost.error) return parsedUnitCost;
            unitCost = parsedUnitCost.value;
            totalCost = calculateReceiptTotalCost(parsedQuantity.value, unitCost);
            if (totalCost > MAX_COST) {
                return { error: 'Calculated purchase total cost exceeds the supported range.' };
            }
        }
    }
    if (typeof body.reason !== 'string' || !body.reason.trim() || body.reason.trim().length > 255) {
        return { error: 'Provide a reason of at most 255 characters.' };
    }
    return {
        value: {
            type: body.type,
            quantity: parsedQuantity.value,
            ...(body.type === 'in' ? { unitCost, totalCost } : {}),
            reason: body.reason.trim(),
        },
    };
};

