import express from 'express';
import {
    readApplicationSettingsController,
    updateApplicationSettingsController,
} from '../controllers/applicationSettingsController.js';
import {
    authenticateToken,
    authorizeAdmin,
    authorizePermission,
} from '../middleware/auth.js';

const router = express.Router();

router.use('/admin/settings', authenticateToken);
router.get(
    '/admin/settings',
    authorizePermission('production:pos:read'),
    readApplicationSettingsController,
);
router.put(
    '/admin/settings',
    authorizePermission('settings:manage'),
    updateApplicationSettingsController,
);

export default router;
