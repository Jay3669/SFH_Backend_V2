import express from 'express';
import cors from 'cors';
import { INTERNAL_SERVER_ERROR, NOT_FOUND } from './function/response.js';
import { createLogger } from './utils/logger.js';
import { shouldSyncDatabase } from './config/databaseSettings.js';
import authRoutes from './routes/authRoutes.js';
import stockRoutes from './routes/stockRoutes.js';
import menuCategoryRoutes from './routes/menuCategoryRoutes.js';
import productionRoutes from './routes/productionRoutes.js';
import applicationSettingsRoutes from './routes/applicationSettingsRoutes.js';
import managementRoutes from './routes/managementRoutes.js';
import profitSharingRoutes from './routes/profitSharingRoutes.js';
import branchRoutes from './routes/branchRoutes.js';

const logger = createLogger('Application');
const app = express();

app.disable('x-powered-by');
if (process.env.ENABLE_CORS === 'true') {
    const allowedOrigins = (process.env.FRONTEND_URL || '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
    if (allowedOrigins.length === 0) {
        throw new Error('FRONTEND_URL must be set when ENABLE_CORS is true.');
    }
    app.use(cors({ origin: allowedOrigins, credentials: true }));
}
app.use(express.json({ limit: '16kb' }));

app.use('/api', branchRoutes, authRoutes, stockRoutes, menuCategoryRoutes, productionRoutes, applicationSettingsRoutes, managementRoutes, profitSharingRoutes);
app.use((req, res) => res.status(404).json(NOT_FOUND('Route not found.')));
app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
        return res.status(400).json({ statusCode: 400, status: 'BAD_REQUEST', message: 'Invalid JSON body.' });
    }
    if (error.name === 'SequelizeUniqueConstraintError') {
        return res.status(409).json({
            statusCode: 409,
            status: 'CONFLICT',
            message: 'A record with these values already exists.',
        });
    }
    if (error.name === 'SequelizeValidationError') {
        return res.status(400).json({
            statusCode: 400,
            status: 'BAD_REQUEST',
            message: 'The request contains invalid values.',
        });
    }
    const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    const sql = error.sql || error.original?.sql || error.parent?.sql;
    const localSql = shouldSyncDatabase()
        && typeof sql === 'string'
        ? { sql, errorType: error.name }
        : {};
    logger.error('Request failed', {
        error: error.message,
        path: req.path,
        statusCode,
        ...localSql,
    });
    if (statusCode < 500 || statusCode === 503) {
        return res.status(statusCode).json({
            statusCode,
            status: error.code || 'REQUEST_ERROR',
            message: error.message,
        });
    }
    return res.status(500).json(INTERNAL_SERVER_ERROR());
});

export default app;
