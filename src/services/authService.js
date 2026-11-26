import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Op } from 'sequelize';
import database from '../config/database.js';
import User, { USER_ROLES } from '../models/user.model.js';
import {
    AuthAuditLog,
    AuthSession,
    Permission,
    PasswordResetToken,
    Role,
    RolePermission,
    UserPermission,
    VerificationToken,
} from '../models/auth.model.js';
import { createLogger } from '../utils/logger.js';
import { getAccessTokenExpiresIn, signAccessToken } from '../config/jwt.js';
import { sendAuthEmail, isEmailDeliveryConfigured } from './authDeliveryService.js';
import { registerUser as createRegisteredUser } from './userRegistrationService.js';
import {
    isValidPasswordLength,
    normalizePhone,
} from '../validators/registrationValidator.js';

const logger = createLogger('AuthService');
const configuredRefreshDays = process.env.JWT_REFRESH_DAYS;
const REFRESH_DAYS = configuredRefreshDays === undefined ? 30 : Number(configuredRefreshDays);
if (!Number.isInteger(REFRESH_DAYS) || REFRESH_DAYS < 1 || REFRESH_DAYS > 365) {
    throw new Error('JWT_REFRESH_DAYS must be an integer from 1 to 365.');
}
const RESET_TTL_MINUTES = 10;
const VERIFY_TTL_HOURS = 24;
const PASSWORD_ROUNDS = 12;
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(crypto.randomUUID(), PASSWORD_ROUNDS);

export class AuthError extends Error {
    constructor(statusCode, message, code = 'AUTH_ERROR') {
        super(message);
        this.name = 'AuthError';
        this.statusCode = statusCode;
        this.code = code;
    }
}

const accessSecret = () => {
    const secret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
        throw new AuthError(500, 'Authentication is not configured.', 'AUTH_CONFIGURATION_ERROR');
    }
    return secret;
};

const refreshSecret = () => {
    const secret = process.env.JWT_REFRESH_SECRET;
    if (secret && secret.length < 32) {
        throw new AuthError(500, 'JWT_REFRESH_SECRET must contain at least 32 characters.', 'AUTH_CONFIGURATION_ERROR');
    }
    return secret ||
        crypto.createHmac('sha256', accessSecret()).update('sfh-refresh-token-signing').digest('hex');
};

const hashToken = (token, secret = accessSecret()) =>
    crypto.createHmac('sha256', secret).update(token).digest('hex');
const hashesMatch = (left, right) => left?.length === right.length &&
    crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));

export const getRolePermissions = async (role, userId = null) => {
    const roleRecord = await Role.findByPk(role, { attributes: ['id'] });
    if (!roleRecord) {
        throw new AuthError(503, 'Role permissions are unavailable. Apply the authentication migration.');
    }
    const assignments = await RolePermission.findAll({
        where: { roleId: role },
        attributes: ['permissionId'],
    });
    const permissions = new Set(assignments.map((assignment) => assignment.permissionId));
    if (userId) {
        const overrides = await UserPermission.findAll({
            where: { userId },
            attributes: ['permissionId', 'granted'],
        });
        overrides.forEach((override) => {
            if (override.granted) permissions.add(override.permissionId);
            else permissions.delete(override.permissionId);
        });
    }
    return [...permissions];
};

const audit = async ({
    actorUserId = null,
    action,
    subjectUserId = null,
    ipAddress = null,
    details = {},
    transaction,
}) =>
    AuthAuditLog.create({
        id: crypto.randomUUID(),
        actorUserId,
        action,
        subjectUserId,
        ipAddress,
        details,
    }, { transaction });

const accountIsActive = (user) => user && user.isActive && user.status === 'active';

const toPublicUser = (user, permissions) => ({
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phoneNumber: user.phoneNumber,
    role: user.role,
    status: user.status,
    emailVerified: Boolean(user.emailVerifiedAt || user.isVerified),
    phoneVerified: Boolean(user.phoneVerifiedAt),
    permissions,
});

const createTokenPair = (user, sessionId) => {
    const expiresIn = getAccessTokenExpiresIn();
    const accessToken = signAccessToken(
        { id: user.id, role: user.role, sid: sessionId, tokenType: 'access' },
        accessSecret(),
        expiresIn,
    );
    const refreshToken = jwt.sign(
        { id: user.id, role: user.role, sid: sessionId, tokenType: 'refresh' },
        refreshSecret(),
        { expiresIn: `${REFRESH_DAYS}d`, issuer: 'sfh-api', audience: 'sfh-client' },
    );
    return { accessToken, refreshToken, expiresIn };
};

export const registerAccount = async ({ input, actor, ipAddress }) => {
    const role = input.role || USER_ROLES.CUSTOMER;
    if (!Object.values(USER_ROLES).includes(role)) {
        throw new AuthError(400, 'Role is not supported.', 'VALIDATION_ERROR');
    }
    if (role !== USER_ROLES.CUSTOMER && actor?.role !== USER_ROLES.ADMIN) {
        throw new AuthError(actor ? 403 : 401, 'Only an admin can create privileged accounts.', 'FORBIDDEN');
    }

    const user = await createRegisteredUser({ ...input, role });
    await audit({ actorUserId: actor?.id, action: 'user.registered', subjectUserId: user.id, ipAddress, details: { role } });

    let verificationEmailSent = false;
    if (user.email) {
        try {
            await issueEmailVerification(user);
            verificationEmailSent = true;
        } catch (error) {
            logger.warn('Registration succeeded but verification email could not be sent', {
                userId: user.id,
                error: error.message,
            });
        }
    }

    return { user: toPublicUser(user, await getRolePermissions(user.role, user.id)), verificationEmailSent };
};

export const authenticateAccount = async ({ identifier, password, expectedRoles, ipAddress }) => {
    const contactField = identifier.includes('@') ? 'email' : 'phoneNumber';
    const where = contactField === 'email'
        ? { email: identifier }
        : database.sequelize.where(
            database.sequelize.fn('regexp_replace', database.sequelize.col('phoneNumber'), '[^0-9]', '', 'g'),
            identifier,
        );
    const user = await User.findOne({ where });
    const passwordMatches = await bcrypt.compare(password, user?.passwordHash || DUMMY_PASSWORD_HASH);
    if (!user || !passwordMatches || !accountIsActive(user) ||
        (expectedRoles && !expectedRoles.includes(user.role))) {
        await audit({
            action: 'auth.login_failed',
            subjectUserId: user?.id || null,
            ipAddress,
            details: { reason: user && !accountIsActive(user) ? 'inactive_account' : 'invalid_credentials' },
        });
        throw new AuthError(401, 'Invalid credentials or inactive account.', 'INVALID_CREDENTIALS');
    }

    const permissions = await getRolePermissions(user.role, user.id);
    const sessionId = crypto.randomUUID();
    const { accessToken, refreshToken, expiresIn } = createTokenPair(user, sessionId);
    await AuthSession.create({
        id: sessionId,
        userId: user.id,
        refreshTokenHash: hashToken(refreshToken, refreshSecret()),
        expiresAt: new Date(Date.now() + REFRESH_DAYS * 24 * 60 * 60 * 1000),
    });
    await audit({ actorUserId: user.id, action: 'auth.login_succeeded', subjectUserId: user.id, ipAddress });
    return {
        user: toPublicUser(user, permissions),
        tokens: { accessToken, refreshToken, tokenType: 'Bearer', expiresIn },
    };
};

export const refreshAccountTokens = async (token, ipAddress) => {
    if (!token) throw new AuthError(401, 'Refresh token is required.', 'UNAUTHORIZED');
    let claims;
    try {
        claims = jwt.verify(token, refreshSecret(), { issuer: 'sfh-api', audience: 'sfh-client' });
    } catch {
        throw new AuthError(401, 'Invalid or expired refresh token.', 'UNAUTHORIZED');
    }
    if (claims.tokenType !== 'refresh' || !claims.sid || !claims.id) {
        throw new AuthError(401, 'Invalid refresh token.', 'UNAUTHORIZED');
    }

    return database.sequelize.transaction(async (transaction) => {
        const session = await AuthSession.findOne({
            where: { id: claims.sid, userId: claims.id, revokedAt: null },
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        const user = await User.findByPk(claims.id, { transaction });
        if (!session || session.expiresAt <= new Date() || !accountIsActive(user) ||
            !hashesMatch(session?.refreshTokenHash, hashToken(token, refreshSecret()))) {
            throw new AuthError(401, 'Refresh session is no longer valid.', 'UNAUTHORIZED');
        }

        const pair = createTokenPair(user, session.id);
        session.refreshTokenHash = hashToken(pair.refreshToken, refreshSecret());
        await session.save({ transaction });
        await audit({
            actorUserId: user.id,
            action: 'auth.token_refreshed',
            subjectUserId: user.id,
            ipAddress,
            transaction,
        });
        return { ...pair, tokenType: 'Bearer' };
    });
};

export const revokeSession = async ({ sessionId, userId, ipAddress }) => {
    if (sessionId) {
        await AuthSession.update(
            { revokedAt: new Date() },
            { where: { id: sessionId, userId, revokedAt: null } },
        );
    }
    await audit({ actorUserId: userId, action: 'auth.logout', subjectUserId: userId, ipAddress });
};

export const revokeSessionByAccessToken = async ({ token, ipAddress }) => {
    if (typeof token !== 'string' || !token) return false;

    let claims;
    try {
        claims = jwt.verify(token, accessSecret(), {
            issuer: 'sfh-api',
            audience: 'sfh-client',
            ignoreExpiration: true,
        });
    } catch {
        return false;
    }
    if (claims.tokenType !== 'access' || !claims.sid || !claims.id) return false;

    return database.sequelize.transaction(async (transaction) => {
        const session = await AuthSession.findOne({
            where: { id: claims.sid, userId: claims.id, revokedAt: null },
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        if (!session) return false;
        await session.update({ revokedAt: new Date() }, { transaction });
        await audit({
            actorUserId: claims.id,
            action: 'auth.logout',
            subjectUserId: claims.id,
            ipAddress,
            transaction,
        });
        return true;
    });
};

export const revokeSessionByRefreshToken = async ({ token, ipAddress }) => {
    if (typeof token !== 'string' || !token) return;

    let claims;
    try {
        claims = jwt.verify(token, refreshSecret(), {
            issuer: 'sfh-api',
            audience: 'sfh-client',
            ignoreExpiration: true,
        });
    } catch {
        return;
    }
    if (claims.tokenType !== 'refresh' || !claims.sid || !claims.id) return;

    await database.sequelize.transaction(async (transaction) => {
        const session = await AuthSession.findOne({
            where: { id: claims.sid, userId: claims.id, revokedAt: null },
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
        if (!session || !hashesMatch(session.refreshTokenHash, hashToken(token, refreshSecret()))) return;
        await session.update({ revokedAt: new Date() }, { transaction });
        await audit({
            actorUserId: claims.id,
            action: 'auth.logout',
            subjectUserId: claims.id,
            ipAddress,
            transaction,
        });
    });
};

export const revokeAllSessions = async ({ userId, ipAddress }) => {
    await AuthSession.update(
        { revokedAt: new Date() },
        { where: { userId, revokedAt: null } },
    );
    await audit({ actorUserId: userId, action: 'auth.logout_all', subjectUserId: userId, ipAddress });
};

export const getCurrentAccount = async (user) => ({
    user: toPublicUser(user, await getRolePermissions(user.role, user.id)),
});

const verifyAddressEmail = (email) => {
    if (typeof email !== 'string' || email.trim().length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        throw new AuthError(400, 'Provide a valid email address.', 'VALIDATION_ERROR');
    }
    return email.trim().toLowerCase();
};

export const requestPasswordReset = async ({ email, ipAddress }) => {
    if (!isEmailDeliveryConfigured()) {
        throw new AuthError(503, 'Email delivery is not configured.', 'DELIVERY_UNAVAILABLE');
    }
    const normalizedEmail = verifyAddressEmail(email);
    const user = await User.findOne({ where: { email: normalizedEmail } });
    if (!user || !accountIsActive(user)) return;

    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const token = await PasswordResetToken.create({
        id: crypto.randomUUID(),
        userId: user.id,
        tokenHash: hashToken(code),
        expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000),
    });
    await PasswordResetToken.update(
        { consumedAt: new Date() },
        { where: { userId: user.id, consumedAt: null, id: { [Op.ne]: token.id } } },
    );
    try {
        await sendAuthEmail(user.email, 'Password reset code', `Your password reset code is ${code}. It expires in ${RESET_TTL_MINUTES} minutes.`);
    } catch (error) {
        await token.update({ consumedAt: new Date() });
        throw error;
    }
    await audit({ action: 'auth.password_reset_requested', subjectUserId: user.id, ipAddress });
};

export const verifyPasswordResetCode = async ({ email, code, ipAddress }) => {
    const normalizedEmail = verifyAddressEmail(email);
    const user = await User.findOne({ where: { email: normalizedEmail } });
    if (typeof code !== 'string' || !user || !accountIsActive(user)) {
        throw new AuthError(400, 'Invalid or expired reset code.', 'INVALID_RESET_CODE');
    }
    const reset = await PasswordResetToken.findOne({
        where: { userId: user.id, consumedAt: null, expiresAt: { [Op.gt]: new Date() } },
        order: [['createdAt', 'DESC']],
    });
    if (!reset || !hashesMatch(reset.tokenHash, hashToken(code))) {
        throw new AuthError(400, 'Invalid or expired reset code.', 'INVALID_RESET_CODE');
    }
    await reset.update({ verifiedAt: new Date() });
    await audit({ action: 'auth.password_reset_code_verified', subjectUserId: user.id, ipAddress });
};

export const resetAccountPassword = async ({ email, code, password, ipAddress }) => {
    if (!isValidPasswordLength(password)) {
        throw new AuthError(400, 'Password must be 6-18 characters.', 'VALIDATION_ERROR');
    }
    const normalizedEmail = verifyAddressEmail(email);
    const user = await User.findOne({ where: { email: normalizedEmail } });
    if (!user || !accountIsActive(user) || typeof code !== 'string') {
        throw new AuthError(400, 'Invalid or expired reset code.', 'INVALID_RESET_CODE');
    }
    const reset = await PasswordResetToken.findOne({
        where: { userId: user.id, verifiedAt: { [Op.not]: null }, consumedAt: null },
        order: [['createdAt', 'DESC']],
    });
    if (!reset || reset.expiresAt <= new Date() || !hashesMatch(reset.tokenHash, hashToken(code))) {
        throw new AuthError(400, 'Invalid or expired reset code.', 'INVALID_RESET_CODE');
    }
    await database.sequelize.transaction(async (transaction) => {
        await user.update({ passwordHash: await bcrypt.hash(password, PASSWORD_ROUNDS) }, { transaction });
        await reset.update({ consumedAt: new Date() }, { transaction });
        await AuthSession.update(
            { revokedAt: new Date() },
            { where: { userId: user.id, revokedAt: null }, transaction },
        );
    });
    await audit({ action: 'auth.password_reset', subjectUserId: user.id, ipAddress });
};

export const changeAccountPassword = async ({ user, currentPassword, newPassword, ipAddress }) => {
    if (typeof currentPassword !== 'string' ||
        !isValidPasswordLength(newPassword)) {
        throw new AuthError(400, 'Provide the current password and a new password of 6-18 characters.', 'VALIDATION_ERROR');
    }
    if (!await bcrypt.compare(currentPassword, user.passwordHash)) {
        throw new AuthError(400, 'Current password is incorrect.', 'INVALID_PASSWORD');
    }
    await user.update({ passwordHash: await bcrypt.hash(newPassword, PASSWORD_ROUNDS) });
    await revokeAllSessions({ userId: user.id, ipAddress });
    await audit({ actorUserId: user.id, action: 'auth.password_changed', subjectUserId: user.id, ipAddress });
};

const issueEmailVerification = async (user) => {
    if (!user.email || user.emailVerifiedAt || user.isVerified) return;
    const value = crypto.randomBytes(32).toString('hex');
    await VerificationToken.update(
        { consumedAt: new Date() },
        { where: { userId: user.id, channel: 'email', consumedAt: null } },
    );
    const token = await VerificationToken.create({
        id: crypto.randomUUID(),
        userId: user.id,
        channel: 'email',
        tokenHash: hashToken(value),
        expiresAt: new Date(Date.now() + VERIFY_TTL_HOURS * 60 * 60 * 1000),
    });
    try {
        await sendAuthEmail(
            user.email,
            'Verify your email address',
            `Use this verification token to verify your email address: ${value}`,
        );
    } catch (error) {
        await token.destroy();
        throw error;
    }
};

export const resendEmailVerification = async ({ user, ipAddress }) => {
    if (!user.email) throw new AuthError(400, 'This account has no email address.', 'VALIDATION_ERROR');
    if (user.emailVerifiedAt || user.isVerified) return;
    await issueEmailVerification(user);
    await audit({ actorUserId: user.id, action: 'auth.email_verification_resent', subjectUserId: user.id, ipAddress });
};

export const verifyAccountEmail = async ({ token, ipAddress }) => {
    if (typeof token !== 'string' || token.length < 32 || token.length > 128) {
        throw new AuthError(400, 'Invalid or expired verification token.', 'INVALID_VERIFICATION_TOKEN');
    }
    const record = await VerificationToken.findOne({
        where: { channel: 'email', tokenHash: hashToken(token), consumedAt: null },
    });
    if (!record || record.expiresAt <= new Date()) {
        throw new AuthError(400, 'Invalid or expired verification token.', 'INVALID_VERIFICATION_TOKEN');
    }
    const user = await User.findByPk(record.userId);
    if (!user) throw new AuthError(400, 'Invalid or expired verification token.', 'INVALID_VERIFICATION_TOKEN');
    const now = new Date();
    await database.sequelize.transaction(async (transaction) => {
        await record.update({ consumedAt: now }, { transaction });
        await user.update({ emailVerifiedAt: now, isVerified: true }, { transaction });
    });
    await audit({ actorUserId: user.id, action: 'auth.email_verified', subjectUserId: user.id, ipAddress });
};

export const updateAccountProfile = async ({ user, changes, ipAddress }) => {
    const allowed = new Set(['firstName', 'lastName', 'email', 'phoneNumber']);
    if (Object.keys(changes).length === 0 || Object.keys(changes).some((key) => !allowed.has(key))) {
        throw new AuthError(400, 'Only firstName, lastName, email, and phoneNumber can be updated.', 'VALIDATION_ERROR');
    }
    const update = {};
    for (const field of ['firstName', 'lastName']) {
        if (Object.prototype.hasOwnProperty.call(changes, field)) {
            if (typeof changes[field] !== 'string' || !changes[field].trim() || changes[field].trim().length > 120) {
                throw new AuthError(400, `Provide a ${field} of at most 120 characters.`, 'VALIDATION_ERROR');
            }
            update[field] = changes[field].trim();
        }
    }
    if (Object.prototype.hasOwnProperty.call(changes, 'email')) {
        if (changes.email !== null && typeof changes.email !== 'string') {
            throw new AuthError(400, 'Email must be a valid email address.', 'VALIDATION_ERROR');
        }
        update.email = changes.email ? verifyAddressEmail(changes.email) : null;
        if (update.email !== user.email) {
            update.emailVerifiedAt = null;
            update.isVerified = false;
        }
    }
    if (Object.prototype.hasOwnProperty.call(changes, 'phoneNumber')) {
        const digits = typeof changes.phoneNumber === 'string' &&
            /^\+?[\d\s().-]+$/.test(changes.phoneNumber)
            ? normalizePhone(changes.phoneNumber)
            : '';
        if (changes.phoneNumber !== null && (digits.length < 7 || digits.length > 15)) {
            throw new AuthError(400, 'Phone number must contain 7-15 digits.', 'VALIDATION_ERROR');
        }
        update.phoneNumber = digits || null;
        if (update.phoneNumber !== user.phoneNumber) update.phoneVerifiedAt = null;
    }
    const finalEmail = Object.prototype.hasOwnProperty.call(update, 'email') ? update.email : user.email;
    const finalPhone = Object.prototype.hasOwnProperty.call(update, 'phoneNumber')
        ? update.phoneNumber
        : user.phoneNumber;
    if (!finalEmail && !finalPhone) {
        throw new AuthError(400, 'At least one email address or phone number must remain on the account.', 'VALIDATION_ERROR');
    }
    await user.update(update);
    await audit({ actorUserId: user.id, action: 'user.profile_updated', subjectUserId: user.id, ipAddress });
    return getCurrentAccount(user);
};

export const listStaffAccounts = async () => {
    const users = await User.findAll({
        where: { role: [USER_ROLES.MANAGER, USER_ROLES.CASHIER, USER_ROLES.EMPLOYEE] },
        attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber', 'role', 'status', 'createdAt'],
        order: [['createdAt', 'DESC']],
    });
    return users.map((user) => user.toJSON());
};

export const roleConstants = USER_ROLES;

export const ensureAuthenticationSeedData = async () => {
    const roles = [
        ['admin', 'Admin'],
        ['manager', 'Manager'],
        ['cashier', 'Cashier'],
        ['employee', 'Employee'],
        ['customer', 'Customer'],
    ];
    const permissionDescriptions = {
        'profile:read': 'Read own profile',
        'profile:update': 'Update own profile',
        'users:read': 'Read user accounts',
        'users:create': 'Create user accounts',
        'users:update': 'Update user accounts',
        'sessions:revoke': 'Revoke user sessions',
        'team:read': 'Read staff accounts',
        'menu:read': 'Read menu items',
        'menu:create': 'Create menu items',
        'menu:update': 'Update menu items',
        'recipes:read': 'Read recipes and versions',
        'recipes:create': 'Create recipes',
        'recipes:update': 'Create immutable recipe versions',
        'recipes:archive': 'Archive or restore recipes',
        'production:read': 'Read production records',
        'production:preview': 'Preview production and stock requirements',
        'production:create': 'Confirm production and deduct stock',
        'production:update': 'Update actual production yield',
        'production:cancel': 'Cancel production and recover unused stock',
        'production:reports:read': 'Read production reports',
        'production:pos:read': 'Read available production for point of sale',
        'production:pos:checkout': 'Complete point-of-sale transactions',
        'production:close': 'Close daily production and record wastage',
        'production:expenses:manage': 'Manage operating expenses',
        'customers:read': 'Read customers',
        'customers:create': 'Create customers',
        'customers:update': 'Update and deactivate customers',
        'notifications:read': 'Read notifications',
        'notifications:create': 'Create notifications',
        'notifications:update': 'Update or delete notifications',
        'inventory:read': 'Read stock and inventory',
        'inventory:manage': 'Manage stock and inventory movements',
        'dashboard:view': 'View role dashboard summaries',
        'reports:view': 'View sales and operating reports',
        'settings:manage': 'Manage application and billing settings',
        'staff:view': 'View staff',
        'staff:create': 'Create staff',
        'staff:update': 'Update staff',
        'staff:manage_roles': 'Manage staff role assignments',
        'profit_share:view': 'View profit sharing',
        'profit_share:calculate': 'Calculate profit sharing',
        'profit_share:approve': 'Approve profit sharing',
        'profit_share:reject': 'Reject profit sharing',
        'profit_share:adjust': 'Adjust approved profit sharing',
        'profit_share:payments:view': 'View profit share payments',
        'profit_share:payments:create': 'Record profit share payments',
        'profit_share:reports:view': 'View profit share reports',
    };
    const assignments = {
        admin: Object.keys(permissionDescriptions),
        manager: [
            'profile:read', 'profile:update', 'team:read',
            'dashboard:view', 'reports:view',
            'settings:manage',
            'inventory:read', 'inventory:manage',
            'menu:read', 'menu:create', 'menu:update',
            'recipes:read', 'recipes:create', 'recipes:update', 'recipes:archive',
            'production:read', 'production:preview', 'production:create',
            'production:update', 'production:cancel', 'production:reports:read',
            'production:pos:read', 'production:pos:checkout', 'production:close',
            'production:expenses:manage',
            'customers:read', 'customers:create', 'customers:update',
            'notifications:read',
        ],
        cashier: [
            'profile:read', 'profile:update',
            'production:pos:read', 'production:pos:checkout',
            'customers:read', 'customers:create',
            'notifications:read',
        ],
        employee: [
            'profile:read', 'profile:update', 'menu:read', 'recipes:read',
            'production:read', 'production:preview', 'production:create', 'production:update',
            'production:pos:read', 'dashboard:view', 'inventory:read',
        ],
        customer: ['profile:read', 'profile:update'],
    };
    await Role.bulkCreate(roles.map(([id, name]) => ({ id, name })), { ignoreDuplicates: true });
    await Permission.bulkCreate(
        Object.entries(permissionDescriptions).map(([id, description]) => ({ id, description })),
        { ignoreDuplicates: true },
    );
    await RolePermission.bulkCreate(
        Object.entries(assignments).flatMap(([roleId, permissions]) =>
            permissions.map((permissionId) => ({ roleId, permissionId }))),
        { ignoreDuplicates: true },
    );
};
