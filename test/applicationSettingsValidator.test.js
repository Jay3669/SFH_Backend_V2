import test from 'node:test';
import assert from 'node:assert/strict';
import {
    DEFAULT_APPLICATION_SETTINGS,
    validateApplicationSettingsInput,
} from '../src/validators/applicationSettingsValidator.js';

const uuid = '3b241101-e2bb-4255-8caf-4136c566a962';

test('application settings validation normalizes the prefix and preserves configured charges', () => {
    const result = validateApplicationSettingsInput({
        ...DEFAULT_APPLICATION_SETTINGS,
        billing: {
            ...DEFAULT_APPLICATION_SETTINGS.billing,
            invoicePrefix: 'sfh-1',
            tax: { enabled: true, rate: 5 },
            additionalCharges: [{
                id: uuid,
                name: 'Service fee',
                enabled: true,
                calculationType: 'percentage',
                amount: 2.5,
            }],
        },
    });

    assert.equal(result.error, undefined);
    assert.equal(result.value.billing.invoicePrefix, 'SFH-1');
    assert.deepEqual(result.value.billing.additionalCharges[0], {
        id: uuid,
        name: 'Service fee',
        enabled: true,
        calculationType: 'percentage',
        amount: 2.5,
    });
});

test('application settings validation prevents disabling all tenders or splitting with fewer than two', () => {
    const noMethods = structuredClone(DEFAULT_APPLICATION_SETTINGS);
    noMethods.payments.enabledMethods = { cash: false, card: false, upi: false };
    assert.match(validateApplicationSettingsInput(noMethods).error, /At least one payment method/);

    const oneMethod = structuredClone(DEFAULT_APPLICATION_SETTINGS);
    oneMethod.payments.enabledMethods = { cash: true, card: false, upi: false };
    assert.match(validateApplicationSettingsInput(oneMethod).error, /Split payment requires/);
});

test('application settings validation rejects invalid zones and duplicate charge identifiers', () => {
    const invalidZone = structuredClone(DEFAULT_APPLICATION_SETTINGS);
    invalidZone.regional.timeZone = 'Mars/Olympus';
    assert.match(validateApplicationSettingsInput(invalidZone).error, /timeZone/);

    const duplicateCharges = structuredClone(DEFAULT_APPLICATION_SETTINGS);
    duplicateCharges.billing.additionalCharges = [
        { id: uuid, name: 'First', enabled: false, calculationType: 'fixed', amount: 1 },
        { id: uuid, name: 'Second', enabled: false, calculationType: 'fixed', amount: 2 },
    ];
    assert.match(validateApplicationSettingsInput(duplicateCharges).error, /ids must be unique/);
});
