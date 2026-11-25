const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[\d\s().-]+$/;

export const isValidPasswordLength = (password) => {
    if (typeof password !== 'string') return false;
    const length = Array.from(password).length;
    return length >= 6 && length <= 18;
};

export const normalizeEmail = (email) => email.trim().toLowerCase();

export const normalizePhone = (phoneNumber) =>
    phoneNumber.replace(/\D/g, '');

const isValidPhone = (phoneNumber) => {
    if (!PHONE_PATTERN.test(phoneNumber)) return false;
    const digits = normalizePhone(phoneNumber);
    return digits.length >= 7 && digits.length <= 15;
};

const validateCredentials = (body) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return { error: 'A JSON object is required.' };
    }

    const { firstName, lastName, email, password, phoneNumber } = body;
    if (typeof firstName !== 'string' || !firstName.trim() || firstName.trim().length > 120) {
        return { error: 'Provide a firstName of at most 120 characters.' };
    }
    if (typeof lastName !== 'string' || !lastName.trim() || lastName.trim().length > 120) {
        return { error: 'Provide a lastName of at most 120 characters.' };
    }
    if (!isValidPasswordLength(password)) {
        return { error: 'Password must be 6-18 characters.' };
    }

    const normalizedEmail = typeof email === 'string' ? email.trim() : email;
    const normalizedPhone = typeof phoneNumber === 'string' ? phoneNumber.trim() : phoneNumber;
    if (email !== undefined && email !== null && typeof email !== 'string') {
        return { error: 'Email must be a valid email address.' };
    }
    if (normalizedEmail && (normalizedEmail.length > 254 || !EMAIL_PATTERN.test(normalizedEmail))) {
        return { error: 'Email must be a valid email address.' };
    }
    if (phoneNumber !== undefined && phoneNumber !== null && typeof phoneNumber !== 'string') {
        return { error: 'Phone number must be valid.' };
    }
    if (normalizedPhone && (normalizedPhone.length > 30 || !isValidPhone(normalizedPhone))) {
        return { error: 'Phone number must contain 7-15 digits.' };
    }
    if (!normalizedEmail && !normalizedPhone) {
        return { error: 'Provide an email address or phone number.' };
    }

    return {
        value: {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: normalizedEmail ? normalizeEmail(normalizedEmail) : null,
            password,
            phoneNumber: normalizedPhone ? normalizePhone(normalizedPhone) : null,
        },
    };
};

export const validateCustomerRegistration = (body) => {
    if (body && Object.prototype.hasOwnProperty.call(body, 'role') && body.role !== 'customer') {
        return { error: 'Customer registration does not accept a role other than customer.' };
    }
    const credentials = validateCredentials(body);
    if (credentials.error) return credentials;
    return { value: { ...credentials.value, role: 'customer' } };
};

export const validatePrivilegedRegistration = (body, allowedRoles) => {
    const credentials = validateCredentials(body);
    if (credentials.error) return credentials;
    if (!allowedRoles.includes(body.role)) {
        return { error: `Role must be one of: ${allowedRoles.join(', ')}.` };
    }
    return {
        value: {
            ...credentials.value,
            role: body.role,
        },
    };
};

export const validateLogin = (body) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return { error: 'A JSON object is required.' };
    }

    const identifier = body.identifier ?? body.email ?? body.phoneNumber;
    if (typeof identifier !== 'string' || !identifier.trim()) {
        return { error: 'Provide an email address or phone number.' };
    }
    if (typeof body.password !== 'string' || !body.password ||
        Buffer.byteLength(body.password, 'utf8') > 72) {
        return { error: 'Provide a valid password.' };
    }

    const normalized = identifier.includes('@')
        ? normalizeEmail(identifier)
        : normalizePhone(identifier);
    if (identifier.includes('@') && (normalized.length > 254 || !EMAIL_PATTERN.test(normalized))) {
        return { error: 'Email must be a valid email address.' };
    }
    if (!identifier.includes('@') && (identifier.trim().length > 30 || !isValidPhone(identifier.trim()))) {
        return { error: 'Phone number must contain 7-15 digits.' };
    }
    return { value: { identifier: normalized, password: body.password } };
};
