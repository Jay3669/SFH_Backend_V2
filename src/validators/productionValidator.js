const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const MAX_MENU_ITEM_PRICE = 9_999_999_999.99;
const MAX_MENU_ITEM_DISPLAY_ORDER = 2_147_483_647;
const isDateOnly = (value) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const decimal = (value, places, max, field, minimum = 0) => {
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

const stringField = (value, field, maximum, optional = false) => {
    if (optional && (value === undefined || value === null || value === '')) return { value: null };
    if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum) {
        return { error: `Provide a ${field} of at most ${maximum} characters.` };
    }
    return { value: value.trim() };
};

const rejectUnknownFields = (body, allowed, label) => {
    const unknownField = Object.keys(body).find((field) => !allowed.has(field));
    return unknownField ? { error: `Unsupported ${label} field: ${unknownField}.` } : null;
};

export const validateMenuItemInput = (body, partial = false) => {
    if (!isObject(body)) return { error: 'A JSON object is required.' };
    const allowed = new Set(['name', 'category', 'categoryId', 'price', 'displayOrder', 'isVegetarian', 'description', 'imageUrl', 'isActive']);
    const unknown = rejectUnknownFields(body, allowed, 'menu item');
    if (unknown) return unknown;
    if (partial && Object.keys(body).length === 0) return { error: 'Provide at least one menu item field.' };
    if (!partial && !Object.prototype.hasOwnProperty.call(body, 'category') &&
        !Object.prototype.hasOwnProperty.call(body, 'categoryId')) {
        return { error: 'Select a menu category.' };
    }
    if (Object.prototype.hasOwnProperty.call(body, 'category') &&
        Object.prototype.hasOwnProperty.call(body, 'categoryId')) {
        return { error: 'Provide category or categoryId, not both.' };
    }

    const value = {};
    for (const [field, maximum] of [['name', 120]]) {
        if (partial && !Object.prototype.hasOwnProperty.call(body, field)) continue;
        const parsed = stringField(body[field], field, maximum);
        if (parsed.error) return parsed;
        value[field] = parsed.value;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'category')) {
        const parsed = stringField(body.category, 'category', 80);
        if (parsed.error) return parsed;
        value.category = parsed.value;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'categoryId')) {
        if (typeof body.categoryId !== 'string' || !UUID_PATTERN.test(body.categoryId)) {
            return { error: 'Select a valid menu category.' };
        }
        value.categoryId = body.categoryId;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'price')) {
        const parsed = decimal(body.price, 2, MAX_MENU_ITEM_PRICE, 'price');
        if (parsed.error) return parsed;
        value.price = parsed.value;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'displayOrder')) {
        if (!Number.isInteger(body.displayOrder) ||
            body.displayOrder < 0 ||
            body.displayOrder > MAX_MENU_ITEM_DISPLAY_ORDER) {
            return { error: `displayOrder must be an integer from 0 to ${MAX_MENU_ITEM_DISPLAY_ORDER}.` };
        }
        value.displayOrder = body.displayOrder;
    }
    for (const field of ['description', 'imageUrl']) {
        if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
        if (body[field] !== null && (typeof body[field] !== 'string' || body[field].length > (field === 'imageUrl' ? 2048 : 2000))) {
            return { error: `${field} must be at most ${field === 'imageUrl' ? 2048 : 2000} characters.` };
        }
        value[field] = typeof body[field] === 'string' ? body[field].trim() || null : null;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'isVegetarian')) {
        if (typeof body.isVegetarian !== 'boolean') return { error: 'isVegetarian must be a boolean.' };
        value.isVegetarian = body.isVegetarian;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'isActive')) {
        if (typeof body.isActive !== 'boolean') return { error: 'isActive must be a boolean.' };
        value.isActive = body.isActive;
    }
    return { value };
};

export const validateRecipeVersionInput = (body, includeMenuItem = false) => {
    if (!isObject(body)) return { error: 'A JSON object is required.' };
    const allowed = new Set([
        'baseProductionQuantity', 'baseProductionUnit', 'expectedPlateCount', 'servingSize',
        'servingUnit', 'preparationInstructions', 'cookingTimeMinutes', 'wastagePercentage',
        'ingredients', ...(includeMenuItem ? ['menuItemId', 'name'] : []),
    ]);
    const unknown = rejectUnknownFields(body, allowed, 'recipe');
    if (unknown) return unknown;

    const value = {};
    if (includeMenuItem) {
        if (typeof body.menuItemId !== 'string' || !UUID_PATTERN.test(body.menuItemId)) {
            return { error: 'Select a valid menu item.' };
        }
        const name = stringField(body.name, 'recipe name', 120);
        if (name.error) return name;
        value.menuItemId = body.menuItemId;
        value.name = name.value;
    }

    for (const [field, maximum, minimum] of [
        ['baseProductionQuantity', 99_999_999_999.999, 0.001],
        ['expectedPlateCount', 99_999_999_999.999, 0.001],
    ]) {
        const parsed = decimal(body[field], 3, maximum, field, minimum);
        if (parsed.error) return parsed;
        value[field] = parsed.value;
    }
    const unit = stringField(body.baseProductionUnit, 'base production unit', 24);
    if (unit.error) return unit;
    value.baseProductionUnit = unit.value;

    if (body.servingSize !== undefined && body.servingSize !== null) {
        const parsed = decimal(body.servingSize, 3, 99_999_999_999.999, 'servingSize', 0.001);
        if (parsed.error) return parsed;
        value.servingSize = parsed.value;
    } else {
        value.servingSize = null;
    }
    if (body.servingUnit !== undefined && body.servingUnit !== null && body.servingUnit !== '') {
        const parsed = stringField(body.servingUnit, 'serving unit', 24);
        if (parsed.error) return parsed;
        value.servingUnit = parsed.value;
    } else {
        value.servingUnit = null;
    }

    if (body.preparationInstructions !== undefined && body.preparationInstructions !== null &&
        (typeof body.preparationInstructions !== 'string' || body.preparationInstructions.length > 10_000)) {
        return { error: 'preparationInstructions must be at most 10000 characters.' };
    }
    value.preparationInstructions = body.preparationInstructions?.trim() || null;

    if (body.cookingTimeMinutes !== undefined && body.cookingTimeMinutes !== null) {
        if (!Number.isInteger(body.cookingTimeMinutes) || body.cookingTimeMinutes < 0 || body.cookingTimeMinutes > 100_000) {
            return { error: 'cookingTimeMinutes must be a non-negative integer.' };
        }
        value.cookingTimeMinutes = body.cookingTimeMinutes;
    } else {
        value.cookingTimeMinutes = null;
    }
    const wastage = decimal(body.wastagePercentage ?? 0, 2, 100, 'wastagePercentage');
    if (wastage.error) return wastage;
    value.wastagePercentage = wastage.value;

    if (!Array.isArray(body.ingredients) || body.ingredients.length < 1 || body.ingredients.length > 100) {
        return { error: 'A recipe must contain from 1 to 100 ingredients.' };
    }
    const seenStockItems = new Set();
    value.ingredients = [];
    for (const ingredient of body.ingredients) {
        if (!isObject(ingredient)) return { error: 'Each recipe ingredient must be an object.' };
        const ingredientUnknown = rejectUnknownFields(
            ingredient,
            new Set(['stockItemId', 'quantity', 'unit', 'preparationNotes', 'wastagePercentage']),
            'recipe ingredient',
        );
        if (ingredientUnknown) return ingredientUnknown;
        if (typeof ingredient.stockItemId !== 'string' || !UUID_PATTERN.test(ingredient.stockItemId)) {
            return { error: 'Each ingredient must reference a valid stock item.' };
        }
        if (seenStockItems.has(ingredient.stockItemId)) {
            return { error: 'A stock item can only appear once in a recipe version.' };
        }
        seenStockItems.add(ingredient.stockItemId);
        const quantity = decimal(ingredient.quantity, 3, 99_999_999_999.999, 'Ingredient quantity', 0.001);
        if (quantity.error) return quantity;
        const ingredientUnit = stringField(ingredient.unit, 'ingredient unit', 24);
        if (ingredientUnit.error) return ingredientUnit;
        const notes = ingredient.preparationNotes;
        if (notes !== undefined && notes !== null &&
            (typeof notes !== 'string' || notes.length > 255)) {
            return { error: 'Ingredient preparation notes must be at most 255 characters.' };
        }
        const ingredientWastage = decimal(ingredient.wastagePercentage ?? 0, 2, 100, 'ingredient wastagePercentage');
        if (ingredientWastage.error) return ingredientWastage;
        value.ingredients.push({
            stockItemId: ingredient.stockItemId,
            quantity: quantity.value,
            unit: ingredientUnit.value,
            preparationNotes: typeof notes === 'string' ? notes.trim() || null : null,
            wastagePercentage: ingredientWastage.value,
        });
    }
    return { value };
};

export const validateProductionInput = (body, preview = false) => {
    if (!isObject(body)) return { error: 'A JSON object is required.' };
    const allowed = new Set([
        'recipeId', 'quantity', 'unit', 'productionDate', 'actualPlateCount', 'notes',
        'additionalCosts', ...(preview ? [] : ['idempotencyKey']),
    ]);
    const unknown = rejectUnknownFields(body, allowed, 'production');
    if (unknown) return unknown;
    if (typeof body.recipeId !== 'string' || !UUID_PATTERN.test(body.recipeId)) {
        return { error: 'Select a valid recipe.' };
    }
    const quantity = decimal(body.quantity, 3, 99_999_999_999.999, 'quantity', 0.001);
    if (quantity.error) return quantity;
    const unit = body.unit === undefined ? undefined : stringField(body.unit, 'production unit', 24);
    if (unit?.error) return unit;
    const productionDate = body.productionDate === undefined
        ? new Date().toISOString().slice(0, 10)
        : body.productionDate;
    if (!isDateOnly(productionDate)) {
        return { error: 'productionDate must be a valid YYYY-MM-DD date.' };
    }
    if (!preview && (typeof body.idempotencyKey !== 'string' ||
        body.idempotencyKey.trim().length < 8 || body.idempotencyKey.trim().length > 100)) {
        return { error: 'Provide an idempotencyKey between 8 and 100 characters.' };
    }
    let actualPlateCount = null;
    if (body.actualPlateCount !== undefined && body.actualPlateCount !== null) {
        const parsed = decimal(body.actualPlateCount, 3, 99_999_999_999.999, 'actualPlateCount');
        if (parsed.error) return parsed;
        actualPlateCount = parsed.value;
    }
    if (body.notes !== undefined && body.notes !== null &&
        (typeof body.notes !== 'string' || body.notes.length > 1000)) {
        return { error: 'notes must be at most 1000 characters.' };
    }
    if (body.additionalCosts !== undefined &&
        (!Array.isArray(body.additionalCosts) || body.additionalCosts.length > 20)) {
        return { error: 'additionalCosts must contain at most 20 entries.' };
    }
    const additionalCosts = [];
    for (const cost of body.additionalCosts || []) {
        if (!isObject(cost)) return { error: 'Each additional cost must be an object.' };
        const costUnknown = rejectUnknownFields(cost, new Set(['name', 'amount']), 'additional cost');
        if (costUnknown) return costUnknown;
        const name = stringField(cost.name, 'additional cost name', 80);
        if (name.error) return name;
        const amount = decimal(cost.amount, 2, 999_999_999_999.99, 'additional cost amount');
        if (amount.error) return amount;
        additionalCosts.push({ name: name.value, amount: amount.value });
    }
    return {
        value: {
            recipeId: body.recipeId,
            quantity: quantity.value,
            unit: unit?.value,
            productionDate,
            actualPlateCount,
            notes: typeof body.notes === 'string' ? body.notes.trim() || null : null,
            additionalCosts,
            ...(preview ? {} : { idempotencyKey: body.idempotencyKey.trim() }),
        },
    };
};

export const validateYieldInput = (body) => {
    if (!isObject(body) || Object.keys(body).some((field) => field !== 'actualPlateCount') ||
        !Object.prototype.hasOwnProperty.call(body, 'actualPlateCount')) {
        return { error: 'Provide only actualPlateCount.' };
    }
    const actualPlateCount = decimal(body.actualPlateCount, 3, 99_999_999_999.999, 'actualPlateCount');
    return actualPlateCount.error ? actualPlateCount : { value: { actualPlateCount: actualPlateCount.value } };
};

export const validateCancellationInput = (body) => {
    if (!isObject(body)) return { error: 'A JSON object is required.' };
    const unknown = rejectUnknownFields(body, new Set(['reason', 'notes', 'recoveries']), 'cancellation');
    if (unknown) return unknown;
    const reason = stringField(body.reason, 'cancellation reason', 255);
    if (reason.error) return reason;
    if (body.notes !== undefined && body.notes !== null &&
        (typeof body.notes !== 'string' || body.notes.length > 1000)) {
        return { error: 'notes must be at most 1000 characters.' };
    }
    if (body.recoveries !== undefined &&
        (!Array.isArray(body.recoveries) || body.recoveries.length > 100)) {
        return { error: 'recoveries must contain at most 100 entries.' };
    }
    const seenIngredients = new Set();
    const recoveries = [];
    for (const recovery of body.recoveries || []) {
        if (!isObject(recovery) ||
            Object.keys(recovery).some((field) => !['productionIngredientId', 'quantityRecovered'].includes(field)) ||
            typeof recovery.productionIngredientId !== 'string' || !UUID_PATTERN.test(recovery.productionIngredientId)) {
            return { error: 'Each recovery requires a valid productionIngredientId and quantityRecovered.' };
        }
        if (seenIngredients.has(recovery.productionIngredientId)) {
            return { error: 'A production ingredient can only be recovered once per cancellation.' };
        }
        seenIngredients.add(recovery.productionIngredientId);
        const quantity = decimal(recovery.quantityRecovered, 3, 99_999_999_999.999, 'quantityRecovered', 0.001);
        if (quantity.error) return quantity;
        recoveries.push({
            productionIngredientId: recovery.productionIngredientId,
            quantityRecovered: quantity.value,
        });
    }
    return {
        value: {
            reason: reason.value,
            notes: typeof body.notes === 'string' ? body.notes.trim() || null : null,
            recoveries,
        },
    };
};

export const validateProductionSaleInput = (body) => {
    if (!isObject(body)) return { error: 'A JSON object is required.' };
    const unknown = rejectUnknownFields(body, new Set([
        'productionDate', 'idempotencyKey', 'paymentMethod', 'items',
        'discountAmount', 'taxRate', 'packingCharge', 'paymentBreakdown', 'settingsUpdatedAt', 'customerId',
    ]), 'sale');
    if (unknown) return unknown;
    if (body.customerId !== undefined && body.customerId !== null &&
        (typeof body.customerId !== 'string' || !UUID_PATTERN.test(body.customerId))) {
        return { error: 'customerId must be a valid UUID.' };
    }
    if (!isDateOnly(body.productionDate)) {
        return { error: 'productionDate must be a valid YYYY-MM-DD date.' };
    }
    if (typeof body.idempotencyKey !== 'string' ||
        body.idempotencyKey.trim().length < 8 || body.idempotencyKey.trim().length > 100) {
        return { error: 'Provide an idempotencyKey between 8 and 100 characters.' };
    }
    if (!['cash', 'upi', 'card', 'split'].includes(body.paymentMethod)) {
        return { error: 'paymentMethod must be cash, upi, card, or split.' };
    }
    if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 50) {
        return { error: 'A sale must contain from 1 to 50 menu items.' };
    }
    const itemIds = new Set();
    const items = [];
    for (const item of body.items) {
        if (!isObject(item) ||
            Object.keys(item).some((field) => !['menuItemId', 'quantity'].includes(field)) ||
            typeof item.menuItemId !== 'string' || !UUID_PATTERN.test(item.menuItemId) ||
            !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 1000) {
            return { error: 'Each sale item requires a valid menuItemId and a whole-number quantity from 1 to 1000.' };
        }
        if (itemIds.has(item.menuItemId)) {
            return { error: 'A menu item can only appear once in a sale.' };
        }
        itemIds.add(item.menuItemId);
        items.push({ menuItemId: item.menuItemId, quantity: item.quantity });
    }
    const discountAmount = decimal(
        body.discountAmount ?? 0,
        2,
        999_999_999_999.99,
        'discountAmount',
    );
    if (discountAmount.error) return discountAmount;
    const value = {
        productionDate: body.productionDate,
        idempotencyKey: body.idempotencyKey.trim(),
        paymentMethod: body.paymentMethod,
        items,
        discountAmount: discountAmount.value,
    };
    if (body.customerId !== undefined && body.customerId !== null) {
        value.customerId = body.customerId;
    }
    if (body.settingsUpdatedAt !== undefined) {
        if (typeof body.settingsUpdatedAt !== 'string' ||
            Number.isNaN(Date.parse(body.settingsUpdatedAt))) {
            return { error: 'settingsUpdatedAt must be a valid ISO date-time.' };
        }
        value.settingsUpdatedAt = body.settingsUpdatedAt;
    }
    if (body.taxRate !== undefined) {
        const taxRate = decimal(body.taxRate, 2, 100, 'taxRate');
        if (taxRate.error) return taxRate;
        value.taxRate = taxRate.value;
    }
    if (body.packingCharge !== undefined) {
        const packingCharge = decimal(body.packingCharge, 2, 999_999_999_999.99, 'packingCharge');
        if (packingCharge.error) return packingCharge;
        value.packingCharge = packingCharge.value;
    }
    if (body.paymentMethod === 'split') {
        if (!isObject(body.paymentBreakdown) ||
            Object.keys(body.paymentBreakdown).length !== 2 ||
            Object.keys(body.paymentBreakdown).some((method) => !['cash', 'upi', 'card'].includes(method))) {
            return { error: 'A split payment requires exactly two distinct cash, upi, or card tenders.' };
        }
        const paymentBreakdown = {};
        for (const [method, amount] of Object.entries(body.paymentBreakdown)) {
            const parsed = decimal(amount, 2, 999_999_999_999.99, `paymentBreakdown.${method}`, 0.01);
            if (parsed.error) return parsed;
            paymentBreakdown[method] = parsed.value;
        }
        value.paymentBreakdown = paymentBreakdown;
    } else if (body.paymentBreakdown !== undefined) {
        return { error: 'paymentBreakdown is only allowed when paymentMethod is split.' };
    }
    return { value };
};

export const validateProductionDayInput = (body) => {
    if (!isObject(body) || Object.keys(body).some((field) => field !== 'productionDate') ||
        !isDateOnly(body.productionDate)) {
        return { error: 'Provide only a valid productionDate using YYYY-MM-DD.' };
    }
    return { value: { productionDate: body.productionDate } };
};

export const validateOperatingExpenseInput = (body) => {
    if (!isObject(body)) return { error: 'A JSON object is required.' };
    const unknown = rejectUnknownFields(body, new Set(['expenseDate', 'category', 'description', 'amount']), 'expense');
    if (unknown) return unknown;
    if (!isDateOnly(body.expenseDate)) {
        return { error: 'expenseDate must be a valid YYYY-MM-DD date.' };
    }
    const category = stringField(body.category, 'expense category', 60);
    if (category.error) return category;
    const description = stringField(body.description, 'expense description', 255);
    if (description.error) return description;
    const amount = decimal(body.amount, 2, 999_999_999_999.99, 'amount', 0.01);
    if (amount.error) return amount;
    return {
        value: {
            expenseDate: body.expenseDate,
            category: category.value,
            description: description.value,
            amount: amount.value,
        },
    };
};
