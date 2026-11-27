const branchFieldLimits = Object.freeze({
    name: 120,
    code: 20,
    address: 500,
    phone: 30,
    email: 254,
});

export function validateBranchInput(input, partial = false) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return { error: 'A branch object is required.' };
    }

    const allowed = Object.keys(branchFieldLimits);
    const unsupported = Object.keys(input).find((key) => !allowed.includes(key));
    if (unsupported) return { error: `Unsupported branch field: ${unsupported}.` };

    const value = {};
    for (const key of allowed) {
        if (input[key] === undefined) continue;
        if (key === 'name' || key === 'code') {
            if (typeof input[key] !== 'string' || !input[key].trim()) {
                return { error: `${key} is required and must be a non-empty string.` };
            }
            value[key] = input[key].trim();
        } else if (input[key] === null || input[key] === '') {
            value[key] = null;
        } else if (typeof input[key] === 'string') {
            value[key] = input[key].trim() || null;
        } else {
            return { error: `${key} must be a string.` };
        }

        if (typeof value[key] === 'string' && value[key].length > branchFieldLimits[key]) {
            return { error: `${key} must be ${branchFieldLimits[key]} characters or fewer.` };
        }
    }

    if (!partial && (!value.name || !value.code)) {
        return { error: 'name and code are required.' };
    }
    if (value.code && !/^[A-Za-z0-9_-]+$/.test(value.code)) {
        return { error: 'code must contain only letters, numbers, underscores, or hyphens.' };
    }
    if (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) {
        return { error: 'email must be a valid email address.' };
    }

    return { value };
}
