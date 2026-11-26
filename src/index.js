import dotenv from 'dotenv';
import { QueryTypes } from 'sequelize';
import { createLogger } from './utils/logger.js';
import { shouldSyncDatabase } from './config/databaseSettings.js';

dotenv.config();

const logger = createLogger('Server');
const ensureStockCodeSequences = async (database, schema) => {
    const [state] = await database.sequelize.query(
        `SELECT
            to_regclass($1) IS NOT NULL AS category_table_exists,
            to_regclass($2) IS NOT NULL AS category_sequence_exists,
            to_regclass($3) IS NOT NULL AS item_table_exists,
            to_regclass($4) IS NOT NULL AS item_sequence_exists`,
        {
            bind: [
                `${schema}.stock_categories`,
                `${schema}.stock_category_code_seq`,
                `${schema}.stock_items`,
                `${schema}.stock_item_code_seq`,
            ],
            type: QueryTypes.SELECT,
        },
    );
    const requiredSequences = [
        {
            tableExists: state.category_table_exists,
            sequenceExists: state.category_sequence_exists,
            name: 'stock_category_code_seq',
            migrationCommand: 'npm run migrate:021',
        },
        {
            tableExists: state.item_table_exists,
            sequenceExists: state.item_sequence_exists,
            name: 'stock_item_code_seq',
            migrationCommand: 'npm run migrate:022',
        },
    ];

    for (const sequence of requiredSequences) {
        if (sequence.sequenceExists) continue;
        if (sequence.tableExists) {
            throw new Error(
                `Missing ${schema}.${sequence.name}; run ${sequence.migrationCommand} with DB_SCHEMA=${schema} before starting.`,
            );
        }
        await database.sequelize.query(
            `CREATE SEQUENCE "${schema}"."${sequence.name}" AS bigint`,
        );
    }
};

const getStartupErrorDetails = (error) => {
    const details = [];
    const visited = new Set();
    let current = error;

    while (current && typeof current === 'object' && !visited.has(current) && details.length < 5) {
        visited.add(current);
        details.push({
            name: current.name || 'Error',
            message: current.message || '(empty error message)',
            ...(current.code ? { code: current.code } : {}),
        });
        current = current.cause || current.original || current.parent;
    }

    if (details.length === 0) {
        details.push({ name: typeof error, message: String(error) });
    }
    return details;
};

const startServer = async () => {
    const jwtSecret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
    if (!jwtSecret || jwtSecret.length < 32) {
        throw new Error('JWT_ACCESS_SECRET must be configured with at least 32 characters.');
    }

    const [{ default: app }, { default: database, schema }] = await Promise.all([
        import('./app.js'),
        import('./config/database.js'),
    ]);

    const { initializeAssociations } = await import('./models/index.js');
    initializeAssociations();
    await database.connect();
    logger.info('Checking stock code sequences.');
    await ensureStockCodeSequences(database, schema);
    if (shouldSyncDatabase()) {
        logger.info('Synchronizing local database models.');
        await database.sync();
    } else {
        logger.info('Skipping Sequelize sync; apply database migrations before production startup.');
    }
    const { ensureAuthenticationSeedData } = await import('./services/authService.js');
    logger.info('Ensuring authentication roles and permissions.');
    await ensureAuthenticationSeedData();

    const port = Number(process.env.PORT) || 5000;
    app.listen(port, () => logger.info(`API listening on port ${port}.`));
};

startServer().catch((error) => {
    logger.error('Server startup failed', { errors: getStartupErrorDetails(error) });
    process.exitCode = 1;
});
