import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

const LOG_LEVELS = {
    ERROR: 'ERROR',
    WARN: 'WARN',
    INFO: 'INFO',
    DEBUG: 'DEBUG',
};

const LOG_LEVEL_ORDER = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3,
};

const LOG_COLORS = {
    ERROR: '\x1b[31m', // Red
    WARN: '\x1b[33m', // Yellow
    INFO: '\x1b[36m', // Cyan
    DEBUG: '\x1b[35m', // Magenta
    RESET: '\x1b[0m', // Reset
};

const currentLogLevel = process.env.LOG_LEVEL?.toUpperCase() || 'DEBUG';

class Logger {
    constructor(moduleName) {
        this.moduleName = moduleName;
        this.logFile = path.join(logsDir, 'app.log');
        this.errorLogFile = path.join(logsDir, 'error.log');
    }

    shouldLog(level) {
        return LOG_LEVEL_ORDER[level] <= LOG_LEVEL_ORDER[currentLogLevel];
    }

    formatMessage(level, message, data = {}) {
        const timestamp = new Date().toISOString();
        const safeData = this.maskSensitive(data);
        const dataStr = Object.keys(safeData).length > 0 ? JSON.stringify(safeData, null, 2) : '';
        return `[${timestamp}] [${level}] [${this.moduleName}] ${message}${dataStr ? '\n' + dataStr : ''}`;
    }

    writeToFile(filePath, message) {
        try {
            fs.appendFileSync(filePath, message + '\n' + '='.repeat(80) + '\n');
        } catch (error) {
            console.error('Failed to write to log file:', error);
        }
    }

    log(level, message, data = {}) {
        if (!this.shouldLog(level)) return;
        const formattedMessage = this.formatMessage(level, message, data);

        if (level === LOG_LEVELS.ERROR) {
            console.error(`${LOG_COLORS.ERROR}${formattedMessage}${LOG_COLORS.RESET}`);
            this.writeToFile(this.errorLogFile, formattedMessage);
            this.writeToFile(this.logFile, formattedMessage);
        } else if (level === LOG_LEVELS.WARN) {
            console.warn(`${LOG_COLORS.WARN}${formattedMessage}${LOG_COLORS.RESET}`);
            this.writeToFile(this.logFile, formattedMessage);
        } else if (level === LOG_LEVELS.INFO) {
            console.log(`${LOG_COLORS.INFO}${formattedMessage}${LOG_COLORS.RESET}`);
            this.writeToFile(this.logFile, formattedMessage);
        } else if (level === LOG_LEVELS.DEBUG) {
            console.debug(`${LOG_COLORS.DEBUG}${formattedMessage}${LOG_COLORS.RESET}`);
            this.writeToFile(this.logFile, formattedMessage);
        }
    }

    error(message, data = {}) {
        this.log(LOG_LEVELS.ERROR, message, data);
    }

    warn(message, data = {}) {
        this.log(LOG_LEVELS.WARN, message, data);
    }

    info(message, data = {}) {
        this.log(LOG_LEVELS.INFO, message, data);
    }

    debug(message, data = {}) {
        this.log(LOG_LEVELS.DEBUG, message, data);
    }

    maskSensitive(data, keys = ['password', 'token', 'accessToken', 'refreshToken', 'email']) {
        if (!data || typeof data !== 'object') return data;

        const masked = { ...data };
        keys.forEach((key) => {
            if (Object.prototype.hasOwnProperty.call(masked, key) && masked[key] != null) {
                masked[key] = '***MASKED***';
            }
        });
        return masked;
    }
}

export const createLogger = (moduleName) => {
    return new Logger(moduleName);
};

export const logger = createLogger('Database');

export default Logger;
