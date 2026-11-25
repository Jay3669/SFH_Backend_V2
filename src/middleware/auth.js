import jwt from 'jsonwebtoken';
import User from '../models/user.model.js';
import { AuthSession } from '../models/auth.model.js';
import { getRolePermissions } from '../services/authService.js';
import { UNAUTHORIZED, FORBIDDEN } from '../function/response.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('AuthMiddleware');

const authenticate = (optional = false) => async (req, res, next) => {
    const authorization = req.header('Authorization');
    const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) {
        if (optional && !authorization) return next();
        return res.status(401).json(UNAUTHORIZED('A bearer access token is required.', {
            code: 'AUTHENTICATION_REQUIRED',
        }));
    }

    let verified;
    try {
        const secret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
        if (!secret || secret.length < 32) throw new Error('Authentication secret is not configured.');
        verified = jwt.verify(token, secret, { issuer: 'sfh-api', audience: 'sfh-client' });
        if (verified.tokenType !== 'access' || !verified.id || !verified.role || !verified.sid) {
            return res.status(401).json(UNAUTHORIZED('Invalid access token.', {
                code: 'INVALID_ACCESS_TOKEN',
            }));
        }
    } catch (error) {
        logger.warn('Access token verification failed', { error: error.name, path: req.path, method: req.method });
        return res.status(401).json(UNAUTHORIZED(
            error.name === 'TokenExpiredError' ? 'Access token expired.' : 'Invalid access token.',
            { code: error.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_ACCESS_TOKEN' },
        ));
    }

    try {
        const [user, session] = await Promise.all([
            User.findByPk(verified.id),
            AuthSession.findByPk(verified.sid),
        ]);
        if (!user || !session || session.userId !== user.id || session.revokedAt ||
            session.expiresAt <= new Date() || !user.isActive ||
            (user.status && user.status !== 'active') || user.role !== verified.role) {
            return res.status(401).json(UNAUTHORIZED(
                'Session is no longer valid. Please sign in again.',
                { code: 'SESSION_INVALID' },
            ));
        }
        req.user = user;
        req.authClaims = verified;
        req.permissions = await getRolePermissions(user.role, user.id);
        return next();
    } catch (error) {
        return next(error);
    }
};

export const authenticateToken = authenticate();
export const optionalAuthenticateToken = authenticate(true);
export const verifyToken = authenticateToken;

export const authorizeRole = (roles) => {
    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            logger.warn('Authorization failed - insufficient role', {
                userId: req.user?.id,
                userRole: req.user?.role,
                requiredRoles: allowedRoles,
                path: req.path,
                method: req.method,
            });
            return res.status(403).json(FORBIDDEN('Insufficient role.'));
        }
        return next();
    };
};

export const authorizePermission = (...permissions) => (req, res, next) => {
    if (!req.user || !permissions.every((permission) => req.permissions?.includes(permission))) {
        logger.warn('Authorization failed - missing permission', {
            userId: req.user?.id,
            requiredPermissions: permissions,
            path: req.path,
            method: req.method,
        });
        return res.status(403).json(FORBIDDEN('Insufficient permissions.'));
    }
    return next();
};

export const enforceTrustedOrigin = (req, res, next) => {
    const origin = req.get('Origin');
    if (!origin) return next();

    let trusted = false;
    if (process.env.ENABLE_CORS === 'true') {
        const allowedOrigins = (process.env.FRONTEND_URL || '')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean);
        trusted = allowedOrigins.includes(origin);
    } else {
        try {
            trusted = new URL(origin).host === req.get('host');
        } catch {
            trusted = false;
        }
    }
    if (!trusted) return res.status(403).json(FORBIDDEN('Untrusted request origin.'));
    return next();
};

export const authorizeAdmin = authorizeRole('admin');
export const authorizeManager = authorizeRole('manager');
export const authorizeEmployee = authorizeRole('employee');
export const authorizeCustomer = authorizeRole('customer');
