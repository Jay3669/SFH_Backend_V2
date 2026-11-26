import dotenv from 'dotenv';
import { resolveDatabaseSettings } from './databaseSettings.js';

dotenv.config();

const databaseSettings = resolveDatabaseSettings();

const config = {
    database: {
        schema: databaseSettings.schema,
    },
    app: {
        port: Number(process.env.PORT) || 5000,
        env: process.env.NODE_ENV || 'development',
    },
};

export default config;