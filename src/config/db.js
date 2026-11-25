import dotenv from 'dotenv';
import { QueryTypes, Sequelize } from 'sequelize';
import { logger } from '../utils/logger.js';

dotenv.config();

const databaseUrl = process.env.DATABASE_URL;
const database = process.env.DB_NAME;
export const schema = process.env.DB_SCHEMA || 'public';
const username = process.env.DB_USER;
const password = process.env.DB_PASSWORD;
const host = process.env.DB_HOST;
const port = process.env.DB_PORT === undefined ? 5432 : Number(process.env.DB_PORT);
const sslEnabled = process.env.DB_SSL === 'true';

if (!databaseUrl && (!database || !username || !password || !host)) {
    throw new Error('Set DATABASE_URL or configure DB_HOST, DB_NAME, DB_USER, and DB_PASSWORD.');
}

if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) {
    throw new Error('DB_SCHEMA must be a valid PostgreSQL schema identifier.');
}

if (!databaseUrl && (!Number.isInteger(port) || port < 1 || port > 65535)) {
    throw new Error('DB_PORT must be a valid TCP port.');
}

const sequelizeOptions = {
    dialect: 'postgres',
    timezone: 'Asia/Kolkata',
    logging: false,
    dialectOptions: {
        options: `-c search_path=${schema}`,
        ...(sslEnabled ? { ssl: true } : {}),
    },
};

export const sequelize = databaseUrl
    ? new Sequelize(databaseUrl, sequelizeOptions)
    : new Sequelize(database, username, password, { ...sequelizeOptions, host, port });

export async function connectDatabase() {
    await sequelize.authenticate();

    const schemas = await sequelize.query(
        'SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1',
        {
            bind: [schema],
            type: QueryTypes.SELECT,
        },
    );

    if (schemas.length === 0) {
        throw new Error(`PostgreSQL schema "${schema}" does not exist in database "${database}".`);
    }

    logger.info('Connected to PostgreSQL', { database, schema });
}

export default {
    sequelize,
    connect: connectDatabase,
};