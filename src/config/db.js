import dotenv from 'dotenv';
import { QueryTypes, Sequelize } from 'sequelize';
import { logger } from '../utils/logger.js';
import { resolveDatabaseSettings } from './databaseSettings.js';

dotenv.config();

const settings = resolveDatabaseSettings();
const {
    databaseUrl,
    database,
    schema,
    username,
    password,
    host,
    port,
    sslEnabled,
} = settings;
export { schema };

if (!databaseUrl && (!database || !username || !password || !host)) {
    throw new Error(`Configure the database URL or host, name, user, and password for the "${settings.profile}" database profile.`);
}

if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) {
    throw new Error(`The schema for the "${settings.profile}" database profile must be a valid PostgreSQL identifier.`);
}

if (!databaseUrl && (!Number.isInteger(port) || port < 1 || port > 65535)) {
    throw new Error(`The port for the "${settings.profile}" database profile must be a valid TCP port.`);
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