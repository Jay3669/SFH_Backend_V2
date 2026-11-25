import dotenv from 'dotenv';
import { createLogger } from './utils/logger.js';

dotenv.config();

const logger = createLogger('Server');
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

    const [{ default: app }, { default: database }] = await Promise.all([
        import('./app.js'),
        import('./config/database.js'),
    ]);

    const { initializeAssociations } = await import('./models/index.js');
    initializeAssociations();
    await database.connect();
    await database.sync();
    const { ensureAuthenticationSeedData } = await import('./services/authService.js');
    await ensureAuthenticationSeedData();

    const port = Number(process.env.PORT) || 5000;
    app.listen(port, () => logger.info(`API listening on port ${port}.`));
};

startServer().catch((error) => {
    logger.error('Server startup failed', { errors: getStartupErrorDetails(error) });
    process.exitCode = 1;
});
