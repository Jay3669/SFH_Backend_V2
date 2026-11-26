import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { UniqueConstraintError } from 'sequelize';
import database from '../config/database.js';
import { shouldSyncDatabase } from '../config/databaseSettings.js';
import User, { USER_ROLES } from '../models/user.model.js';
import { createLogger } from '../utils/logger.js';
import { isValidPasswordLength } from '../validators/registrationValidator.js';

dotenv.config();

const logger = createLogger('AdminSeed');
const seedAdmin = async () => {
    const {
        ADMIN_FIRST_NAME,
        ADMIN_LAST_NAME,
        ADMIN_NAME,
        ADMIN_EMAIL,
        ADMIN_PASSWORD,
    } = process.env;
    const legacyNameParts = ADMIN_NAME?.trim().split(/\s+/) || [];
    const firstName = ADMIN_FIRST_NAME?.trim() || legacyNameParts.shift();
    const lastName = ADMIN_LAST_NAME?.trim() || legacyNameParts.join(' ');
    const jwtSecret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
    if (!jwtSecret || jwtSecret.length < 32) {
        throw new Error('JWT_ACCESS_SECRET must be configured with at least 32 characters.');
    }
    if (!firstName || firstName.length > 120 || !lastName || lastName.length > 120 ||
        !ADMIN_EMAIL?.trim() || !isValidPasswordLength(ADMIN_PASSWORD)) {
        throw new Error(
            'Set ADMIN_FIRST_NAME, ADMIN_LAST_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD (6-18 characters).',
        );
    }

    await database.connect();
    if (shouldSyncDatabase()) {
        await database.sync();
    }
    const email = ADMIN_EMAIL.trim().toLowerCase();
    const existing = await User.findOne({ where: { email } });
    if (existing) {
        if (existing.role !== USER_ROLES.ADMIN) {
            throw new Error('ADMIN_EMAIL already belongs to a non-admin account.');
        }
        logger.info('Admin account already exists; no changes made.');
        return;
    }

    await User.create({
        firstName,
        lastName,
        email,
        passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12),
        role: USER_ROLES.ADMIN,
    });
    logger.info('Initial admin account created.');
};

seedAdmin()
    .catch((error) => {
        if (error instanceof UniqueConstraintError) {
            logger.error('Admin account could not be created because the email is already in use.');
        } else {
            logger.error('Admin seed failed', { error: error.message });
        }
        process.exitCode = 1;
    })
    .finally(async () => {
        await database.sequelize.close();
    });
