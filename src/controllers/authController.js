import { UniqueConstraintError } from 'sequelize';
import { BAD_REQUEST, CREATED, OPERATION_SUCCESS } from '../function/response.js';
import {
    authenticateAccount,
    changeAccountPassword,
    getCurrentAccount,
    listStaffAccounts,
    refreshAccountTokens,
    registerAccount,
    requestPasswordReset,
    revokeSessionByAccessToken,
    revokeSessionByRefreshToken,
    resetAccountPassword,
    resendEmailVerification,
    revokeAllSessions,
    updateAccountProfile,
    verifyAccountEmail,
    verifyPasswordResetCode,
} from '../services/authService.js';
import { DuplicateAccountError } from '../services/userRegistrationService.js';
import {
    validateCustomerRegistration,
    validateLogin,
    validatePrivilegedRegistration,
} from '../validators/registrationValidator.js';

const REFRESH_COOKIE = 'sfhRefreshToken';
const publicTokenDetails = ({ accessToken, tokenType, expiresIn }) => ({
    accessToken,
    tokenType,
    expiresIn,
    refreshTokenLocation: 'httpOnly-cookie',
});

const cookieOptions = () => {
    const sameSite = process.env.AUTH_COOKIE_SAME_SITE || 'strict';
    if (!['strict', 'lax', 'none'].includes(sameSite)) {
        throw new Error('AUTH_COOKIE_SAME_SITE must be strict, lax, or none.');
    }
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production' || sameSite === 'none',
        sameSite,
        path: '/api/auth',
    };
};

const readRefreshCookie = (req) => {
    const cookie = req.headers.cookie?.split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${REFRESH_COOKIE}=`));
    if (!cookie) return undefined;
    try {
        return decodeURIComponent(cookie.slice(REFRESH_COOKIE.length + 1));
    } catch {
        return undefined;
    }
};

const clearRefreshCookie = (res) => res.clearCookie(REFRESH_COOKIE, cookieOptions());

const validationError = (res, message) =>
    res.status(400).json(BAD_REQUEST(message));

export const registerUser = (options = {}) => async (req, res, next) => {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
        ? {
            firstName: req.body.firstName,
            lastName: req.body.lastName,
            email: req.body.email,
            password: req.body.password,
            phoneNumber: req.body.phoneNumber,
            ...(Object.prototype.hasOwnProperty.call(req.body, 'role') ? { role: req.body.role } : {}),
        }
        : req.body;
    if (options.requireRole && !body?.role) {
        return validationError(res, 'A role is required for this endpoint.');
    }
    const requestedRole = options.forcedRole || body?.role || 'customer';
    const isCustomer = requestedRole === 'customer';
    const validation = isCustomer
        ? validateCustomerRegistration({ ...body, role: body?.role ?? 'customer' })
        : validatePrivilegedRegistration(body, options.allowedRoles || [
            'admin', 'manager', 'cashier', 'employee',
        ]);
    if (validation.error) return validationError(res, validation.error);

    if (options.forcedRole && body?.role && body.role !== options.forcedRole) {
        return validationError(res, `This endpoint only registers ${options.forcedRole} accounts.`);
    }
    if (options.forcedRole) validation.value.role = options.forcedRole;

    try {
        const data = await registerAccount({
            input: validation.value,
            actor: req.user,
            ipAddress: req.ip,
        });
        return res.status(201).json(CREATED('User registered successfully.', data));
    } catch (error) {
        if (error instanceof DuplicateAccountError || error instanceof UniqueConstraintError) {
            return res.status(409).json({
                statusCode: 409,
                status: 'CONFLICT',
                message: 'An account with this email or phone number already exists.',
            });
        }
        return next(error);
    }
};

export const loginUser = (expectedRoles) => async (req, res, next) => {
    const validation = validateLogin(req.body);
    if (validation.error) return validationError(res, validation.error);
    try {
        const data = await authenticateAccount({ ...validation.value, expectedRoles, ipAddress: req.ip });
        const { refreshToken, ...publicTokens } = data.tokens;
        res.cookie(REFRESH_COOKIE, refreshToken, {
            ...cookieOptions(),
            maxAge: (Number(process.env.JWT_REFRESH_DAYS) || 30) * 24 * 60 * 60 * 1000,
        });
        return res.status(200).json(OPERATION_SUCCESS('Login successful.', {
            user: data.user,
            tokens: publicTokenDetails(publicTokens),
        }));
    } catch (error) {
        return next(error);
    }
};

export const refreshToken = async (req, res, next) => {
    try {
        const token = readRefreshCookie(req) || req.body?.refreshToken;
        const tokens = await refreshAccountTokens(token, req.ip);
        res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
            ...cookieOptions(),
            maxAge: (Number(process.env.JWT_REFRESH_DAYS) || 30) * 24 * 60 * 60 * 1000,
        });
        return res.status(200).json(OPERATION_SUCCESS('Access token refreshed.', {
            tokens: publicTokenDetails(tokens),
        }));
    } catch (error) {
        return next(error);
    }
};

export const logout = async (req, res, next) => {
    try {
        const accessToken = req.header('Authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
        const revoked = await revokeSessionByAccessToken({ token: accessToken, ipAddress: req.ip });
        if (!revoked) {
            await revokeSessionByRefreshToken({ token: readRefreshCookie(req), ipAddress: req.ip });
        }
        clearRefreshCookie(res);
        return res.status(200).json(OPERATION_SUCCESS('Logged out successfully.'));
    } catch (error) {
        clearRefreshCookie(res);
        return next(error);
    }
};

export const logoutAll = async (req, res, next) => {
    try {
        await revokeAllSessions({ userId: req.user.id, ipAddress: req.ip });
        clearRefreshCookie(res);
        return res.status(200).json(OPERATION_SUCCESS('All sessions have been revoked.'));
    } catch (error) {
        return next(error);
    }
};

export const forgotPassword = async (req, res, next) => {
    try {
        await requestPasswordReset({ email: req.body?.email, ipAddress: req.ip });
        return res.status(200).json(OPERATION_SUCCESS(
            'If the account is eligible, a password reset code has been sent.',
        ));
    } catch (error) {
        return next(error);
    }
};

export const verifyResetCode = async (req, res, next) => {
    try {
        await verifyPasswordResetCode({
            email: req.body?.email,
            code: req.body?.code,
            ipAddress: req.ip,
        });
        return res.status(200).json(OPERATION_SUCCESS('Password reset code verified.'));
    } catch (error) {
        return next(error);
    }
};

export const resetPassword = async (req, res, next) => {
    try {
        await resetAccountPassword({
            email: req.body?.email,
            code: req.body?.code,
            password: req.body?.password,
            ipAddress: req.ip,
        });
        clearRefreshCookie(res);
        return res.status(200).json(OPERATION_SUCCESS('Password reset successfully.'));
    } catch (error) {
        return next(error);
    }
};

export const changePassword = async (req, res, next) => {
    try {
        await changeAccountPassword({
            user: req.user,
            currentPassword: req.body?.currentPassword,
            newPassword: req.body?.newPassword,
            ipAddress: req.ip,
        });
        clearRefreshCookie(res);
        return res.status(200).json(OPERATION_SUCCESS('Password changed successfully.'));
    } catch (error) {
        return next(error);
    }
};

export const getMe = async (req, res, next) => {
    try {
        return res.status(200).json(OPERATION_SUCCESS('Current user retrieved.', await getCurrentAccount(req.user)));
    } catch (error) {
        return next(error);
    }
};

export const updateProfile = async (req, res, next) => {
    try {
        const data = await updateAccountProfile({ user: req.user, changes: req.body || {}, ipAddress: req.ip });
        return res.status(200).json(OPERATION_SUCCESS('Profile updated successfully.', data));
    } catch (error) {
        return next(error);
    }
};

export const verifyEmail = async (req, res, next) => {
    try {
        await verifyAccountEmail({ token: req.body?.token || req.query?.token, ipAddress: req.ip });
        return res.status(200).json(OPERATION_SUCCESS('Email address verified.'));
    } catch (error) {
        return next(error);
    }
};

export const resendVerificationEmail = async (req, res, next) => {
    try {
        await resendEmailVerification({ user: req.user, ipAddress: req.ip });
        return res.status(200).json(OPERATION_SUCCESS('Verification email sent if your account needs verification.'));
    } catch (error) {
        return next(error);
    }
};

export const getStaff = async (req, res, next) => {
    try {
        return res.status(200).json(OPERATION_SUCCESS('Staff accounts retrieved.', await listStaffAccounts()));
    } catch (error) {
        return next(error);
    }
};
