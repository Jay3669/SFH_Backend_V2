import { QueryTypes } from 'sequelize';

const codeSequences = [
    {
        table: 'stock_categories',
        sequence: 'stock_category_code_seq',
        migrationCommand: 'npm run migrate:021',
    },
    {
        table: 'stock_items',
        sequence: 'stock_item_code_seq',
        migrationCommand: 'npm run migrate:022',
    },
    {
        table: 'menu_categories',
        sequence: 'menu_category_code_seq',
        migrationCommand: 'npm run migrate:024',
    },
    {
        table: 'menu_items',
        sequence: 'menu_item_code_seq',
        migrationCommand: 'npm run migrate:024',
    },
];

export async function ensureCodeSequences(database, schema) {
    const checks = codeSequences.map(({ table, sequence }) => ({
        table,
        sequence,
    }));
    const bind = checks.flatMap(({ table, sequence }) => [
        `${schema}.${table}`,
        `${schema}.${sequence}`,
    ]);
    const selectExpressions = checks.flatMap(({ table, sequence }, index) => [
        `to_regclass($${index * 2 + 1}) IS NOT NULL AS table_${index}_exists`,
        `to_regclass($${index * 2 + 2}) IS NOT NULL AS sequence_${index}_exists`,
    ]);

    const [state] = await database.sequelize.query(
        `SELECT ${selectExpressions.join(', ')}`,
        { bind, type: QueryTypes.SELECT },
    );

    for (const [index, sequence] of codeSequences.entries()) {
        if (state[`sequence_${index}_exists`]) continue;
        if (state[`table_${index}_exists`]) {
            throw new Error(
                `Missing ${schema}.${sequence.sequence}; run ${sequence.migrationCommand} ` +
                `with DB_SCHEMA=${schema} before starting.`,
            );
        }
        await database.sequelize.query(
            `CREATE SEQUENCE "${schema}"."${sequence.sequence}" AS bigint`,
        );
    }
}
