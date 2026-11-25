import database from '../config/db.js';
import ApplicationSettings from '../models/applicationSettings.model.js';
import { validateApplicationSettingsInput } from '../validators/applicationSettingsValidator.js';

export class ApplicationSettingsError extends Error {
    constructor(statusCode, message, code = 'SETTINGS_ERROR') {
        super(message);
        this.name = 'ApplicationSettingsError';
        this.statusCode = statusCode;
        this.code = code;
    }
}

export const getApplicationSettingsRecord = async (options = {}) => {
    const record = await ApplicationSettings.findByPk(1, options);
    if (!record) {
        throw new ApplicationSettingsError(
            503,
            'Application settings are not initialized. Apply migration 011 before serving requests.',
            'SETTINGS_NOT_INITIALIZED',
        );
    }
    return record;
};

export const getApplicationSettings = async () => {
    const record = await getApplicationSettingsRecord();
    return {
        settings: record.settings,
        nextInvoiceNumber: String(record.nextInvoiceNumber),
        settingsUpdatedAt: record.updatedAt.toISOString(),
    };
};

export const updateApplicationSettings = async (body, actorUserId) => {
    const result = validateApplicationSettingsInput(body);
    if (result.error) {
        throw new ApplicationSettingsError(400, result.error, 'VALIDATION_ERROR');
    }

    return database.sequelize.transaction(async (transaction) => {
        const record = await getApplicationSettingsRecord({
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        await record.update(
            { settings: result.value, updatedBy: actorUserId },
            { transaction },
        );
        return {
            settings: record.settings,
            nextInvoiceNumber: String(record.nextInvoiceNumber),
            settingsUpdatedAt: record.updatedAt.toISOString(),
        };
    });
};
