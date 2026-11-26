import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    baselineMigrations,
    listMigrations,
    runPendingMigrations,
    stripTransactionStatements,
} from '../src/services/migrationRunner.js';

test('lists numbered migrations in version order', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sfh-migrations-'));
    try {
        fs.writeFileSync(path.join(directory, '002_second.sql'), 'SELECT 2;');
        fs.writeFileSync(path.join(directory, '001_first.sql'), 'SELECT 1;');
        fs.writeFileSync(path.join(directory, 'README.txt'), 'not a migration');

        assert.deepEqual(
            listMigrations(directory).map((migration) => migration.filename),
            ['001_first.sql', '002_second.sql'],
        );
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('rejects duplicate migration versions', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sfh-migrations-'));
    try {
        fs.writeFileSync(path.join(directory, '001_first.sql'), 'SELECT 1;');
        fs.writeFileSync(path.join(directory, '001_duplicate.sql'), 'SELECT 2;');

        assert.throws(() => listMigrations(directory), /Duplicate migration version 1/);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('removes file transaction wrappers for runner-managed transactions', () => {
    assert.equal(
        stripTransactionStatements('BEGIN;\nSELECT 1;\nCOMMIT;'),
        'SELECT 1;',
    );
    assert.equal(stripTransactionStatements('SELECT 1;'), 'SELECT 1;');
});

test('applies only unrecorded migrations in order and skips them on later runs', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sfh-migrations-'));
    const applied = new Set(['001_first.sql']);
    const executedSql = [];
    try {
        fs.writeFileSync(path.join(directory, '001_first.sql'), 'BEGIN;\nSELECT 1;\nCOMMIT;');
        fs.writeFileSync(path.join(directory, '002_second.sql'), 'BEGIN;\nSELECT 2;\nCOMMIT;');
        const sequelize = {
            query: async (sql, options = {}) => {
                if (sql.startsWith('SELECT migration_name')) {
                    return [...applied].map((name) => [name]);
                }
                if (sql.startsWith('INSERT INTO')) {
                    applied.add(options.bind[0]);
                    return [];
                }
                if (sql.startsWith('CREATE TABLE IF NOT EXISTS') || sql.startsWith('SELECT pg_advisory_xact_lock')) {
                    return [];
                }
                executedSql.push(sql);
                return [];
            },
            transaction: async (callback) => callback({}),
        };

        assert.deepEqual(await runPendingMigrations(sequelize, 'test_schema', directory), ['002_second.sql']);
        assert.deepEqual(executedSql, ['SELECT 2;']);
        assert.deepEqual(await runPendingMigrations(sequelize, 'test_schema', directory), []);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('does not execute historical migrations without an explicit baseline', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sfh-migrations-'));
    let migrationExecuted = false;
    try {
        fs.writeFileSync(path.join(directory, '001_first.sql'), 'SELECT 1;');
        const sequelize = {
            query: async (sql) => {
                if (sql.startsWith('SELECT migration_name')) return [];
                if (sql.startsWith('CREATE TABLE IF NOT EXISTS') || sql.startsWith('SELECT pg_advisory_xact_lock')) return [];
                migrationExecuted = true;
                return [];
            },
            transaction: async (callback) => callback({}),
        };

        await assert.rejects(
            runPendingMigrations(sequelize, 'test_schema', directory),
            /Migration history is empty/,
        );
        assert.equal(migrationExecuted, false);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('repairs missing menu tables before baselining an existing schema', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sfh-migrations-'));
    const applied = new Set();
    const existingTables = new Set(['users', 'cash_drawers']);
    const executedSql = [];
    try {
        fs.writeFileSync(path.join(directory, '001_users.sql'), 'SELECT 1;');
        fs.writeFileSync(
            path.join(directory, '006_recipe_production.sql'),
            'BEGIN;\nCREATE TABLE IF NOT EXISTS "public"."menu_items" (id integer);\nCOMMIT;',
        );
        fs.writeFileSync(
            path.join(directory, '007_menu_categories.sql'),
            'BEGIN;\nCREATE TABLE IF NOT EXISTS "public"."menu_categories" (id integer);\nCOMMIT;',
        );
        fs.writeFileSync(
            path.join(directory, '015_cash_drawers.sql'),
            'BEGIN;\nCREATE TABLE IF NOT EXISTS "public"."cash_drawers" (id integer);\nCOMMIT;',
        );
        fs.writeFileSync(path.join(directory, '023_stock_category_ordering.sql'), 'SELECT 1;');
        const sequelize = {
            query: async (sql, options = {}) => {
                if (sql.startsWith('SELECT migration_name')) {
                    return [...applied].map((name) => [name]);
                }
                if (sql.startsWith('SELECT table_name FROM information_schema.tables')) {
                    return [...existingTables].map((name) => [name]);
                }
                if (sql.startsWith('INSERT INTO')) {
                    applied.add(options.bind[0]);
                    return [];
                }
                if (sql.startsWith('CREATE TABLE IF NOT EXISTS')) {
                    if (sql.includes('"test_schema"."menu_items"')) existingTables.add('menu_items');
                    if (sql.includes('"test_schema"."menu_categories"')) existingTables.add('menu_categories');
                    if (sql.includes('"test_schema"."menu_items"') || sql.includes('"test_schema"."menu_categories"')) {
                        executedSql.push(sql);
                    }
                    return [];
                }
                if (sql.startsWith('SELECT pg_advisory_xact_lock')) {
                    return [];
                }
                executedSql.push(sql);
                return [];
            },
            transaction: async (callback) => callback({}),
        };

        await baselineMigrations(sequelize, 'test_schema', '023', directory);
        assert.deepEqual([...existingTables].filter((table) => ['menu_items', 'menu_categories'].includes(table)).sort(), [
            'menu_categories',
            'menu_items',
        ]);
        assert.deepEqual(executedSql, [
            'CREATE TABLE IF NOT EXISTS "test_schema"."menu_items" (id integer);',
            'CREATE TABLE IF NOT EXISTS "test_schema"."menu_categories" (id integer);',
        ]);
        assert.deepEqual([...applied].sort(), [
            '001_users.sql',
            '006_recipe_production.sql',
            '007_menu_categories.sql',
            '015_cash_drawers.sql',
            '023_stock_category_ordering.sql',
        ]);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
