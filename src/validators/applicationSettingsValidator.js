const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_PAYMENT_METHODS = ['cash', 'card', 'upi'];

const rejectUnknownFields = (value, allowed, label) => {
    const unknownField = Object.keys(value).find((field) => !allowed.has(field));
    return unknownField ? { error: `Unsupported ${label} field: ${unknownField}.` } : null;
};

const decimal = (value, max, field) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) {
        return { error: `${field} must be a number from 0 to ${max}.` };
    }
    const rounded = Math.round(value * 100) / 100;
    if (Math.abs(value - rounded) > Number.EPSILON * Math.max(1, Math.abs(value)) * 8) {
        return { error: `${field} must have at most 2 decimal places.` };
    }
    return { value: rounded };
};

const booleanField = (value, field) => typeof value === 'boolean'
    ? { value }
    : { error: `${field} must be a boolean.` };

export const DEFAULT_APPLICATION_SETTINGS = {
    billing: {
        invoicePrefix: 'POS',
        tax: { enabled: false, rate: 0 },
        packingCharge: { enabled: false, amount: 0 },
        additionalCharges: [],
    },
    payments: {
        enabledMethods: { cash: true, card: true, upi: true },
        allowSplit: true,
    },
    regional: {
        dateFormat: 'DD/MM/YYYY',
        timeFormat: '12h',
        timeZone: 'Asia/Kolkata',
    },
    profitSharing: {
        maxAllocationPercentage: 20,
    },
};

export const validateApplicationSettingsInput = (body) => {
    if (!isObject(body)) return { error: 'A JSON object is required.' };
    const rootUnknown = rejectUnknownFields(body, new Set(['billing', 'payments', 'regional', 'profitSharing']), 'settings');
    if (rootUnknown) return rootUnknown;

    const billing = body.billing;
    if (!isObject(billing)) return { error: 'billing settings are required.' };
    const billingUnknown = rejectUnknownFields(
        billing,
        new Set(['invoicePrefix', 'tax', 'packingCharge', 'additionalCharges']),
        'billing settings',
    );
    if (billingUnknown) return billingUnknown;
    if (typeof billing.invoicePrefix !== 'string' ||
        !/^[a-z0-9][a-z0-9-]{0,11}$/i.test(billing.invoicePrefix.trim())) {
        return { error: 'invoicePrefix must contain 1 to 12 letters, numbers, or hyphens.' };
    }

    const tax = billing.tax;
    if (!isObject(tax) || Object.keys(tax).some((field) => !['enabled', 'rate'].includes(field))) {
        return { error: 'tax must contain only enabled and rate.' };
    }
    const taxEnabled = booleanField(tax.enabled, 'tax.enabled');
    if (taxEnabled.error) return taxEnabled;
    const taxRate = decimal(tax.rate, 100, 'tax.rate');
    if (taxRate.error) return taxRate;

    const packing = billing.packingCharge;
    if (!isObject(packing) || Object.keys(packing).some((field) => !['enabled', 'amount'].includes(field))) {
        return { error: 'packingCharge must contain only enabled and amount.' };
    }
    const packingEnabled = booleanField(packing.enabled, 'packingCharge.enabled');
    if (packingEnabled.error) return packingEnabled;
    const packingAmount = decimal(packing.amount, 999_999_999_999.99, 'packingCharge.amount');
    if (packingAmount.error) return packingAmount;

    if (!Array.isArray(billing.additionalCharges) || billing.additionalCharges.length > 10) {
        return { error: 'additionalCharges must contain no more than 10 charges.' };
    }
    const chargeIds = new Set();
    const additionalCharges = [];
    for (const charge of billing.additionalCharges) {
        if (!isObject(charge)) return { error: 'Each additional charge must be an object.' };
        const chargeUnknown = rejectUnknownFields(
            charge,
            new Set(['id', 'name', 'enabled', 'calculationType', 'amount']),
            'additional charge',
        );
        if (chargeUnknown) return chargeUnknown;
        if (typeof charge.id !== 'string' || !UUID_PATTERN.test(charge.id)) {
            return { error: 'Each additional charge requires a valid id.' };
        }
        if (chargeIds.has(charge.id)) return { error: 'Additional charge ids must be unique.' };
        chargeIds.add(charge.id);
        if (typeof charge.name !== 'string' || !charge.name.trim() || charge.name.trim().length > 40) {
            return { error: 'Each additional charge requires a name of at most 40 characters.' };
        }
        const enabled = booleanField(charge.enabled, 'additionalCharge.enabled');
        if (enabled.error) return enabled;
        if (!['fixed', 'percentage'].includes(charge.calculationType)) {
            return { error: 'additionalCharge.calculationType must be fixed or percentage.' };
        }
        const amount = decimal(
            charge.amount,
            charge.calculationType === 'percentage' ? 100 : 999_999_999_999.99,
            'additionalCharge.amount',
        );
        if (amount.error) return amount;
        additionalCharges.push({
            id: charge.id,
            name: charge.name.trim(),
            enabled: enabled.value,
            calculationType: charge.calculationType,
            amount: amount.value,
        });
    }

    const payments = body.payments;
    if (!isObject(payments) ||
        Object.keys(payments).some((field) => !['enabledMethods', 'allowSplit'].includes(field))) {
        return { error: 'payments must contain enabledMethods and allowSplit.' };
    }
    if (!isObject(payments.enabledMethods) ||
        Object.keys(payments.enabledMethods).some((method) => !DEFAULT_PAYMENT_METHODS.includes(method))) {
        return { error: 'enabledMethods must contain only cash, card, and upi.' };
    }
    const enabledMethods = {};
    for (const method of DEFAULT_PAYMENT_METHODS) {
        const enabled = booleanField(payments.enabledMethods[method], `enabledMethods.${method}`);
        if (enabled.error) return enabled;
        enabledMethods[method] = enabled.value;
    }
    const enabledCount = Object.values(enabledMethods).filter(Boolean).length;
    if (enabledCount === 0) return { error: 'At least one payment method must be enabled.' };
    const allowSplit = booleanField(payments.allowSplit, 'allowSplit');
    if (allowSplit.error) return allowSplit;
    if (allowSplit.value && enabledCount < 2) {
        return { error: 'Split payment requires at least two enabled payment methods.' };
    }

    const regional = body.regional;
    if (!isObject(regional) ||
        Object.keys(regional).some((field) => !['dateFormat', 'timeFormat', 'timeZone'].includes(field))) {
        return { error: 'regional must contain dateFormat, timeFormat, and timeZone.' };
    }
    if (!['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'].includes(regional.dateFormat)) {
        return { error: 'dateFormat must be DD/MM/YYYY, MM/DD/YYYY, or YYYY-MM-DD.' };
    }
    if (!['12h', '24h'].includes(regional.timeFormat)) {
        return { error: 'timeFormat must be 12h or 24h.' };
    }
    if (typeof regional.timeZone !== 'string' || regional.timeZone.length > 64) {
        return { error: 'timeZone must be a valid time-zone identifier.' };
    }
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: regional.timeZone });
    } catch {
        return { error: 'timeZone must be a valid time-zone identifier.' };
    }

    const profitSharing = body.profitSharing ?? DEFAULT_APPLICATION_SETTINGS.profitSharing;
    if (!isObject(profitSharing) ||
        Object.keys(profitSharing).some((field) => !['maxAllocationPercentage'].includes(field))) {
        return { error: 'profitSharing must contain only maxAllocationPercentage.' };
    }
    const limit = decimal(
        profitSharing.maxAllocationPercentage,
        100,
        'profitSharing.maxAllocationPercentage',
    );
    if (limit.error) return limit;

    return {
        value: {
            billing: {
                invoicePrefix: billing.invoicePrefix.trim().toUpperCase(),
                tax: { enabled: taxEnabled.value, rate: taxRate.value },
                packingCharge: { enabled: packingEnabled.value, amount: packingAmount.value },
                additionalCharges,
            },
            payments: { enabledMethods, allowSplit: allowSplit.value },
            regional: {
                dateFormat: regional.dateFormat,
                timeFormat: regional.timeFormat,
                timeZone: regional.timeZone,
            },
            profitSharing: {
                maxAllocationPercentage: limit.value,
            },
        },
    };
};
