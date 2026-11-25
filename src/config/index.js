import dotenv from 'dotenv';

dotenv.config();

const config = {
    database: {
        schema: process.env.DB_SCHEMA || 'public',
    },
    app: {
        port: Number(process.env.PORT) || 5000,
        env: process.env.NODE_ENV || 'development',
    },
};

export default config;