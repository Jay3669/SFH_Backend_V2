import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBranchInput } from '../src/validators/branchValidator.js';

test('branch creation requires a name and a valid code', () => {
    assert.deepEqual(validateBranchInput({ name: 'Downtown' }), {
        error: 'name and code are required.',
    });
    assert.match(
        validateBranchInput({ name: 'Downtown', code: 'Downtown #1' }).error,
        /code must contain only letters/,
    );
});

test('branch inputs trim fields and accept nullable contact information', () => {
    assert.deepEqual(validateBranchInput({
        name: '  Downtown  ',
        code: '  DT-01 ',
        address: ' ',
        phone: null,
        email: ' team@example.com ',
    }), {
        value: {
            name: 'Downtown',
            code: 'DT-01',
            address: null,
            phone: null,
            email: 'team@example.com',
        },
    });
});

test('branch updates require at least one supported field and enforce field limits', () => {
    assert.deepEqual(validateBranchInput({}, true), { value: {} });
    assert.match(
        validateBranchInput({ name: 'x'.repeat(121) }, true).error,
        /name must be 120 characters or fewer/,
    );
    assert.match(
        validateBranchInput({ location: 'North' }, true).error,
        /Unsupported branch field/,
    );
});
