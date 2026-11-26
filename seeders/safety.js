import dotenv from 'dotenv';
import { resolveDatabaseSettings } from '../src/config/databaseSettings.js';

dotenv.config();

const CONFIRMATION = 'I_CONFIRM_NON_PRODUCTION';

export function assertSafeTestDatabase() {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('Refusing to seed: NODE_ENV=production.');
    }
    if (process.env.SEED_TEST_DATA_CONFIRM !== CONFIRMATION) {
        throw new Error(`Set SEED_TEST_DATA_CONFIRM=${CONFIRMATION} only after confirming a disposable non-production database.`);
    }

    const databaseName = resolveDatabaseSettings().database || '';
    const allowedName = /(?:^|[_-])(DEV|DEVELOPMENT|TEST|TESTING|QA|T\d+)(?:$|[_-])/i.test(databaseName);
    if (!allowedName) {
        throw new Error(`Refusing to seed unsafe database "${databaseName}". Use a database name containing DEV, TEST, QA, or T<number>, or a disposable test database.`);
    }
}
