import { Router } from 'express';
import { authenticateToken, authorizeAdmin, authorizePermission } from '../middleware/auth.js';
import { FORBIDDEN } from '../function/response.js';
import { requireBranchContext } from '../middleware/branchContext.js';
import {
    listRolesController,
    updateRolePercentageController,
    assignStaffRoleController,
    listStaffRolesController,
    updateStaffRoleController,
    removeStaffRoleController,
    calculateDailyController,
    listDailyController,
    getCalculationController,
    approveCalculationController,
    rejectCalculationController,
    adjustCalculationController,
    recordPaymentController,
    employeeProfileController,
} from '../controllers/profitSharingController.js';

const router = Router();

router.use(authenticateToken);
router.use('/profit-sharing', requireBranchContext);
router.use('/admin/profit-sharing', requireBranchContext);
router.use('/admin/staff', requireBranchContext);
router.use('/staff', requireBranchContext);

router.get('/roles', authorizePermission('profit_share:view'), listRolesController);
router.put('/roles/:roleId/profit-percentage', authorizeAdmin, authorizePermission('profit_share:adjust'), updateRolePercentageController);
router.get('/admin/roles', authorizePermission('profit_share:view'), listRolesController);
router.put('/admin/roles/:roleId/profit-percentage', authorizeAdmin, authorizePermission('profit_share:adjust'), updateRolePercentageController);
router.post('/staff/:staffId/roles', authorizePermission('staff:manage_roles'), assignStaffRoleController);
router.get('/staff/:staffId/roles', authorizePermission('staff:view'), listStaffRolesController);
router.put('/staff/:staffId/roles/:assignmentId', authorizePermission('staff:manage_roles'), updateStaffRoleController);
router.delete('/staff/:staffId/roles/:assignmentId', authorizePermission('staff:manage_roles'), removeStaffRoleController);
router.post('/admin/staff/:staffId/roles', authorizePermission('staff:manage_roles'), assignStaffRoleController);
router.get('/admin/staff/:staffId/roles', authorizePermission('staff:view'), listStaffRolesController);
router.put('/admin/staff/:staffId/roles/:assignmentId', authorizePermission('staff:manage_roles'), updateStaffRoleController);
router.delete('/admin/staff/:staffId/roles/:assignmentId', authorizePermission('staff:manage_roles'), removeStaffRoleController);

router.post('/profit-sharing/calculate', authorizePermission('profit_share:calculate'), calculateDailyController);
router.get('/profit-sharing/daily', authorizePermission('profit_share:view'), listDailyController);
router.post('/admin/profit-sharing/calculate', authorizePermission('profit_share:calculate'), calculateDailyController);
router.get('/admin/profit-sharing/daily', authorizePermission('profit_share:view'), listDailyController);
router.get('/profit-sharing/:id', authorizePermission('profit_share:view'), getCalculationController);
router.post('/profit-sharing/:id/approve', authorizeAdmin, authorizePermission('profit_share:approve'), approveCalculationController);
router.post('/profit-sharing/:id/reject', authorizeAdmin, authorizePermission('profit_share:reject'), rejectCalculationController);
router.post('/profit-sharing/:id/adjust', authorizeAdmin, authorizePermission('profit_share:adjust'), adjustCalculationController);
router.post('/profit-sharing/payments', authorizePermission('profit_share:payments:create'), recordPaymentController);
router.post('/admin/profit-sharing/payments', authorizePermission('profit_share:payments:create'), recordPaymentController);
router.get('/profit-sharing/employee/:staffId/daily-profile', authorizePermission('profit_share:view'), (req, res, next) => {
    const mayViewAll = req.user.role === 'admin' || req.user.role === 'manager';
    if (!mayViewAll && req.user.id !== req.params.staffId) {
        return res.status(403).json(FORBIDDEN('You can only view your own profit-sharing profile.'));
    }
    return employeeProfileController(req, res, next);
});

export default router;
