import test from 'node:test';
import assert from 'node:assert/strict';
import {
    resolveDatabaseSettings,
    shouldSyncDatabase,
} from '../src/config/databaseSettings.js';

test('resolves the selected local database profile', () => {
    const settings = resolveDatabaseSettings({
        DB_ENV: 'local',
        LOCAL_DB_HOST: 'localhost',
        LOCAL_DB_PORT: '5432',
        LOCAL_DB_NAME: 'local_db',
        LOCAL_DB_SCHEMA: 'public',
        LOCAL_DB_USER: 'postgres',
        LOCAL_DB_PASSWORD: 'local-password',
        LOCAL_DB_SSL: 'false',
        PRODUCTION_DB_HOST: 'production.example',
        PRODUCTION_DB_NAME: 'production_db',
    });

    assert.equal(settings.profile, 'local');
    assert.equal(settings.host, 'localhost');
    assert.equal(settings.database, 'local_db');
    assert.equal(settings.schema, 'public');
    assert.equal(settings.port, 5432);
    assert.equal(settings.sslEnabled, false);
});

test('resolves the selected production database profile', () => {
    const settings = resolveDatabaseSettings({
        DB_ENV: 'production',
        PRODUCTION_DB_HOST: 'production.example',
        PRODUCTION_DB_PORT: '5432',
        PRODUCTION_DB_NAME: 'production_db',
        PRODUCTION_DB_SCHEMA: 'sfh',
        PRODUCTION_DB_USER: 'production_user',
        PRODUCTION_DB_PASSWORD: 'production-password',
        PRODUCTION_DB_SSL: 'true',
        LOCAL_DB_HOST: 'localhost',
    });

    assert.equal(settings.profile, 'production');
    assert.equal(settings.host, 'production.example');
    assert.equal(settings.database, 'production_db');
    assert.equal(settings.schema, 'sfh');
    assert.equal(settings.port, 5432);
    assert.equal(settings.sslEnabled, true);
});

test('supports existing single-profile database variables', () => {
    const settings = resolveDatabaseSettings({
        DB_HOST: 'legacy.example',
        DB_NAME: 'legacy_db',
        DB_USER: 'legacy_user',
        DB_PASSWORD: 'legacy-password',
        DB_SCHEMA: 'legacy_schema',
        DATABASE_URL: 'postgres://legacy.example/legacy_db',
    });

    assert.equal(settings.profile, 'default');
    assert.equal(settings.host, 'legacy.example');
    assert.equal(settings.database, 'legacy_db');
    assert.equal(settings.schema, 'legacy_schema');
    assert.equal(settings.databaseUrl, 'postgres://legacy.example/legacy_db');
});

test('rejects invalid database profile names', () => {
    assert.throws(
        () => resolveDatabaseSettings({ DB_ENV: 'staging' }),
        /DB_ENV must be either "local" or "production"/,
    );
});

test('skips automatic Sequelize sync for production profiles and environments', () => {
    assert.equal(shouldSyncDatabase({ DB_ENV: 'production', NODE_ENV: 'development' }), false);
    assert.equal(shouldSyncDatabase({ DB_ENV: 'local', NODE_ENV: 'production' }), false);
    assert.equal(shouldSyncDatabase({ DB_ENV: 'local', NODE_ENV: 'development' }), true);
});
