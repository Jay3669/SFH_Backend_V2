import test from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeEmail,
    normalizePhone,
    validateCustomerRegistration,
    validateLogin,
    validatePrivilegedRegistration,
} from '../src/validators/registrationValidator.js';

const USER_ROLES = {
    ADMIN: 'admin',
    CUSTOMER: 'customer',
    EMPLOYEE: 'employee',
};
const STAFF_ROLES = ['manager', 'cashier', 'employee'];

test('requires first and last names and normalizes a phone-only registration', () => {
    const result = validateCustomerRegistration({
        firstName: ' Taylor ',
        lastName: ' Customer ',
        phoneNumber: '+1 (415) 555-0123',
        password: 'a-secure-password',
    });

    assert.deepEqual(result.value, {
        firstName: 'Taylor',
        lastName: 'Customer',
        email: null,
        password: 'a-secure-password',
        phoneNumber: '14155550123',
        role: USER_ROLES.CUSTOMER,
    });
    assert.match(
        validateCustomerRegistration({
            firstName: 'Taylor',
            email: 'person@example.com',
            password: 'a-secure-password',
        }).error,
        /lastName/,
    );
});

test('accepts email-only registration and normalizes email casing', () => {
    const result = validateCustomerRegistration({
        firstName: 'Taylor',
        lastName: 'Customer',
        email: ' Person@Example.com ',
        password: 'a-secure-password',
    });

    assert.equal(result.value.email, 'person@example.com');
    assert.equal(result.value.phoneNumber, null);
    assert.equal(normalizeEmail(' USER@EXAMPLE.COM '), 'user@example.com');
});

test('requires registration passwords to contain 6-18 characters', () => {
    const registration = {
        firstName: 'Taylor',
        lastName: 'Customer',
        email: 'customer@example.com',
    };

    assert.ok(validateCustomerRegistration({ ...registration, password: '12345' }).error);
    assert.equal(
        validateCustomerRegistration({ ...registration, password: '123456' }).error,
        undefined,
    );
    assert.equal(
        validateCustomerRegistration({ ...registration, password: '123456789012345678' }).error,
        undefined,
    );
    assert.ok(
        validateCustomerRegistration({ ...registration, password: '1234567890123456789' }).error,
    );
});

test('accepts an explicit customer role and rejects other public roles', () => {
    const accepted = validateCustomerRegistration({
        firstName: 'Taylor',
        lastName: 'Customer',
        email: 'customer@example.com',
        password: 'a-secure-password',
        role: 'customer',
    });
    assert.equal(accepted.error, undefined);
    assert.equal(accepted.value.role, USER_ROLES.CUSTOMER);
    assert.match(
        validateCustomerRegistration({
            firstName: 'Taylor',
            lastName: 'Customer',
            email: 'customer@example.com',
            password: 'a-secure-password',
            role: 'manager',
        }).error,
        /does not accept a role/i,
    );
});

test('validates and normalizes login by email or phone', () => {
    assert.equal(
        validateLogin({ identifier: ' Person@Example.com ', password: 'secret' }).value.identifier,
        'person@example.com',
    );
    assert.equal(
        validateLogin({ phoneNumber: '+1 (415) 555-0123', password: 'secret' }).value.identifier,
        '14155550123',
    );
    assert.ok(validateLogin({ identifier: 'not-an-email', password: 'secret' }).error);
});

test('rejects invalid contacts and customer role assignment', () => {
    assert.match(
        validateCustomerRegistration({
            firstName: 'Taylor',
            lastName: 'Customer',
            email: '',
            phoneNumber: '123',
            password: 'a-secure-password',
        }).error,
        /Phone number/,
    );
    assert.match(
        validateCustomerRegistration({
            firstName: 'Taylor',
            lastName: 'Customer',
            email: 'person@example.com',
            password: 'a-secure-password',
            role: USER_ROLES.ADMIN,
        }).error,
        /does not accept a role/,
    );
});

test('validates privileged role assignments', () => {
    const registration = {
        firstName: 'Morgan',
        lastName: 'Staff',
        email: 'staff@example.com',
        password: 'a-secure-password',
        role: USER_ROLES.EMPLOYEE,
    };

    assert.equal(
        validatePrivilegedRegistration(registration, STAFF_ROLES).value.role,
        USER_ROLES.EMPLOYEE,
    );
    assert.match(
        validatePrivilegedRegistration(
            { ...registration, role: USER_ROLES.CUSTOMER },
            [USER_ROLES.ADMIN, ...STAFF_ROLES],
        ).error,
        /Role must be one of/,
    );
    assert.equal(normalizePhone('+1 (415) 555-0123'), '14155550123');
});
