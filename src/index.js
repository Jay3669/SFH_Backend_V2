import dotenv from 'dotenv';
import { createLogger } from './utils/logger.js';

dotenv.config();

const logger = createLogger('Server');
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
    logger.error('Server startup failed', { error: error.message });
    process.exitCode = 1;
});
