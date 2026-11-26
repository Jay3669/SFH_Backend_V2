import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { QueryTypes } from 'sequelize';

const migrationsDirectory = fileURLToPath(new URL('../../migrations/', import.meta.url));
const schemaPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
const migrationFilePattern = /^(\d{3})_[A-Za-z0-9_-]+\.sql$/;
const migrationTable = (schema) => `"${schema}"."schema_migrations"`;
const advisoryLockName = 'sfh_schema_migrations';
const baselineRepairMigrations = [
    '006_recipe_production.sql',
    '007_menu_categories.sql',
    '015_cash_drawers.sql',
];

function assertValidSchema(schema) {
    if (!schemaPattern.test(schema)) {
        throw new Error('A valid PostgreSQL schema name is required to run migrations.');
    }
}

function getMigrationVersion(filename) {
    const match = filename.match(migrationFilePattern);
    if (!match) {
        throw new Error(`Migration filename "${filename}" must start with a three-digit version.`);
    }
    return Number(match[1]);
}

export function listMigrations(directory = migrationsDirectory) {
    const files = fs.readdirSync(directory).filter((filename) => filename.endsWith('.sql'));
    const migrations = files.map((filename) => ({
        filename,
        version: getMigrationVersion(filename),
        filepath: path.join(directory, filename),
    }));

    migrations.sort((left, right) => left.version - right.version);
    for (let index = 1; index < migrations.length; index += 1) {
        if (migrations[index - 1].version === migrations[index].version) {
            throw new Error(`Duplicate migration version ${migrations[index].version}.`);
        }
    }
    return migrations;
}

export function stripTransactionStatements(sql) {
    return sql
        .replace(/^\s*BEGIN\s*;\s*/i, '')
        .replace(/\s*COMMIT\s*;\s*$/i, '')
        .trim();
}

function getCreatedTableNames(sql) {
    const tables = new Set();
    const pattern = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_]*)\.)?"?([A-Za-z_][A-Za-z0-9_]*)"?/gi;
    for (const match of sql.matchAll(pattern)) {
        tables.add(match[1]);
    }
    return tables;
}

async function ensureMigrationTable(sequelize, schema) {
    assertValidSchema(schema);
    await sequelize.query(
        `CREATE TABLE IF NOT EXISTS ${migrationTable(schema)} (
            migration_name varchar(255) PRIMARY KEY,
            executed_at timestamptz NOT NULL DEFAULT now()
        )`,
    );
}

async function getAppliedMigrations(sequelize, schema, transaction) {
    const rows = await sequelize.query(
        `SELECT migration_name FROM ${migrationTable(schema)} ORDER BY migration_name`,
        { type: QueryTypes.SELECT, transaction },
    );
    return new Set(rows.map((row) => (Array.isArray(row) ? row[0] : row.migration_name)));
}

async function getExistingTables(sequelize, schema, transaction) {
    const rows = await sequelize.query(
        'SELECT table_name FROM information_schema.tables ' +
        'WHERE table_schema = $1 AND table_type = $2',
        {
            bind: [schema, 'BASE TABLE'],
            type: QueryTypes.SELECT,
            transaction,
        },
    );
    return new Set(rows.map((row) => (Array.isArray(row) ? row[0] : row.table_name)));
}

async function acquireMigrationLock(sequelize, schema, transaction) {
    await sequelize.query(
        'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
        {
            bind: [schema, advisoryLockName],
            transaction,
        },
    );
}

async function applyMigration(sequelize, schema, migration, transaction) {
    const sql = fs.readFileSync(migration.filepath, 'utf8')
        .replace(/\bpublic\b/g, schema);
    await sequelize.query(stripTransactionStatements(sql), { transaction });
    await sequelize.query(
        `INSERT INTO ${migrationTable(schema)} (migration_name) VALUES ($1)`,
        { bind: [migration.filename], transaction },
    );
}

export async function runPendingMigrations(
    sequelize,
    schema,
    directory = migrationsDirectory,
) {
    await ensureMigrationTable(sequelize, schema);
    const migrations = listMigrations(directory);
    const appliedAtStart = await getAppliedMigrations(sequelize, schema);
    if (appliedAtStart.size === 0 && migrations.length > 0) {
        throw new Error(
            `Migration history is empty for schema "${schema}". ` +
            'For an existing database, verify its migration level and run ' +
            '"npm run migrate:baseline -- <version>" once before starting.',
        );
    }

    const appliedNow = [];
    for (const migration of migrations) {
        const wasApplied = await sequelize.transaction(async (transaction) => {
            await acquireMigrationLock(sequelize, schema, transaction);
            const applied = await getAppliedMigrations(sequelize, schema, transaction);
            if (applied.has(migration.filename)) return false;
            await applyMigration(sequelize, schema, migration, transaction);
            return true;
        });
        if (wasApplied) appliedNow.push(migration.filename);
    }
    return appliedNow;
}

export async function applySingleMigration(
    sequelize,
    schema,
    filename,
    directory = migrationsDirectory,
) {
    await ensureMigrationTable(sequelize, schema);
    const safeFilename = path.basename(filename);
    const migration = listMigrations(directory)
        .find((candidate) => candidate.filename === safeFilename);
    if (!migration) {
        throw new Error(`Unknown migration "${safeFilename}".`);
    }

    const appliedAtStart = await getAppliedMigrations(sequelize, schema);
    if (appliedAtStart.size === 0) {
        throw new Error(
            `Migration history is empty for schema "${schema}". ` +
            'Baseline the existing database before running individual migrations.',
        );
    }

    return sequelize.transaction(async (transaction) => {
        await acquireMigrationLock(sequelize, schema, transaction);
        const applied = await getAppliedMigrations(sequelize, schema, transaction);
        if (applied.has(migration.filename)) return false;
        await applyMigration(sequelize, schema, migration, transaction);
        return true;
    });
}

export async function baselineMigrations(
    sequelize,
    schema,
    targetVersion,
    directory = migrationsDirectory,
) {
    await ensureMigrationTable(sequelize, schema);
    const migrations = listMigrations(directory);
    const version = Number(targetVersion);
    const target = migrations.find((migration) => migration.version === version);
    if (!Number.isInteger(version) || !target) {
        throw new Error(`Unknown migration baseline "${targetVersion}".`);
    }

    await sequelize.transaction(async (transaction) => {
        await acquireMigrationLock(sequelize, schema, transaction);
        const applied = await getAppliedMigrations(sequelize, schema, transaction);
        if (applied.size > 0) {
            throw new Error(`Schema "${schema}" already has migration history; it cannot be baselined.`);
        }

        const baseline = migrations.filter((migration) => migration.version <= version);
        const expectedTables = new Set(['users']);
        for (const migration of baseline) {
            const sql = fs.readFileSync(migration.filepath, 'utf8');
            for (const table of getCreatedTableNames(sql)) expectedTables.add(table);
        }

        const existingTables = await getExistingTables(sequelize, schema, transaction);
        const missingTables = [...expectedTables].filter((table) => !existingTables.has(table));
        if (missingTables.length > 0) {
            const repairCandidates = baselineRepairMigrations
                .map((filename) => baseline.find((migration) => migration.filename === filename))
                .filter(Boolean);
            const repairableTables = new Set();
            const tablesByRepair = new Map();
            for (const migration of repairCandidates) {
                const sql = fs.readFileSync(migration.filepath, 'utf8');
                const tables = getCreatedTableNames(sql);
                tablesByRepair.set(migration.filename, tables);
                for (const table of tables) repairableTables.add(table);
            }

            const unsupportedMissingTables = missingTables.filter((table) => !repairableTables.has(table));
            if (unsupportedMissingTables.length > 0) {
                throw new Error(
                    `Cannot baseline schema "${schema}" through ${target.filename}; ` +
                    `required tables are missing: ${unsupportedMissingTables.sort().join(', ')}.`,
                );
            }

            const missingSet = new Set(missingTables);
            const menuTablesMissing = missingSet.has('menu_items') || missingSet.has('menu_categories');
            const repairNames = new Set();
            if (menuTablesMissing) {
                repairNames.add('006_recipe_production.sql');
                repairNames.add('007_menu_categories.sql');
            } else if (missingTables.some((table) => tablesByRepair.get('006_recipe_production.sql')?.has(table))) {
                repairNames.add('006_recipe_production.sql');
            }
            if (missingSet.has('cash_drawers')) repairNames.add('015_cash_drawers.sql');

            for (const migration of repairCandidates) {
                if (!repairNames.has(migration.filename)) continue;
                await applyMigration(sequelize, schema, migration, transaction);
            }

            const repairedTables = await getExistingTables(sequelize, schema, transaction);
            const stillMissing = [...expectedTables].filter((table) => !repairedTables.has(table));
            if (stillMissing.length > 0) {
                throw new Error(
                    `Cannot baseline schema "${schema}" through ${target.filename}; ` +
                    `required tables are missing: ${stillMissing.sort().join(', ')}.`,
                );
            }
        }

        for (const migration of baseline) {
            await sequelize.query(
                `INSERT INTO ${migrationTable(schema)} (migration_name) VALUES ($1) ` +
                'ON CONFLICT (migration_name) DO NOTHING',
                { bind: [migration.filename], transaction },
            );
        }
    });
}
