import { Router } from 'express';
import {
    changePassword,
    forgotPassword,
    getMe,
    loginUser,
    logout,
    logoutAll,
    refreshToken,
    registerUser,
    resendVerificationEmail,
    resetPassword,
    updateProfile,
    verifyEmail,
    verifyResetCode,
} from '../controllers/authController.js';
import {
    authenticateToken,
    authorizeAdmin,
    authorizePermission,
    enforceTrustedOrigin,
    optionalAuthenticateToken,
} from '../middleware/auth.js';
import {
    challengeRateLimit,
    loginRateLimit,
    refreshRateLimit,
    registrationRateLimit,
} from '../middleware/rateLimit.js';
import { USER_ROLES, STAFF_ROLES } from '../models/user.model.js';

const router = Router();

router.post('/auth/register', registrationRateLimit, optionalAuthenticateToken, registerUser());
router.post(
    '/auth/customer/register',
    registrationRateLimit,
    registerUser({ forcedRole: USER_ROLES.CUSTOMER }),
);

router.post('/auth/login', loginRateLimit, loginUser());
router.post('/auth/customer/login', loginRateLimit, loginUser([USER_ROLES.CUSTOMER]));
router.post('/auth/admin/login', loginRateLimit, loginUser([USER_ROLES.ADMIN]));
router.post('/auth/staff/login', loginRateLimit, loginUser(STAFF_ROLES));

router.post('/auth/refresh', enforceTrustedOrigin, refreshRateLimit, refreshToken);
router.post('/auth/logout', enforceTrustedOrigin, logout);
router.post('/auth/logout-all', authenticateToken, logoutAll);
router.post('/auth/logout-all-devices', authenticateToken, logoutAll);
router.post('/auth/forgot-password', challengeRateLimit, forgotPassword);
router.post('/auth/verify-reset-token', challengeRateLimit, verifyResetCode);
router.post('/auth/verify-password-reset-token', challengeRateLimit, verifyResetCode);
router.post('/auth/reset-password', challengeRateLimit, resetPassword);
router.post('/auth/change-password', authenticateToken, challengeRateLimit, changePassword);
router.get('/auth/me', authenticateToken, getMe);
router.patch('/auth/profile', authenticateToken, updateProfile);
router.put('/auth/profile', authenticateToken, updateProfile);
router.post('/auth/verify-email', challengeRateLimit, verifyEmail);
router.post('/auth/resend-email-verification', authenticateToken, challengeRateLimit, resendVerificationEmail);

router.post(
    '/admin/users',
    authenticateToken,
    authorizeAdmin,
    authorizePermission('users:create'),
    registrationRateLimit,
    registerUser({ allowedRoles: Object.values(USER_ROLES), requireRole: true }),
);

export default router;
