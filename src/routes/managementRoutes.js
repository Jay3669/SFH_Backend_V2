import { Router } from 'express';
import { authenticateToken, authorizeAdmin, authorizePermission } from '../middleware/auth.js';
import {
    createCustomer, createNotification, createStaff, deactivateCustomer, deactivateUser,
    deleteNotification, deleteReadNotifications, deleteStaff, getCustomer, getNotification,
    getUser, listCustomers, listNotifications, listRolesPermissions, listStaff, getStaffById, listUsers,
    markAllNotificationsRead, setNotificationRead, setRolePermission, setUserPermission,
    getStaffDashboardSummary, getCustomerPurchaseHistory,
    updateCustomer, updateNotification, updateStaff, updateUser,
} from '../controllers/managementController.js';

const router = Router();

router.use('/admin', authenticateToken);
router.get('/admin/dashboard/summary', authorizePermission('dashboard:view'), getStaffDashboardSummary);

router.get('/admin/users', authorizeAdmin, authorizePermission('users:read'), listUsers);
router.get('/admin/users/:userId', authorizeAdmin, authorizePermission('users:read'), getUser);
router.patch('/admin/users/:userId', authorizeAdmin, authorizePermission('users:update'), updateUser);
router.delete('/admin/users/:userId', authorizeAdmin, authorizePermission('users:update'), deactivateUser);
router.put('/admin/users/:userId/permissions', authorizeAdmin, authorizePermission('users:update'), setUserPermission);
router.get('/admin/permissions', authorizeAdmin, authorizePermission('users:read'), listRolesPermissions);
router.put('/admin/roles/permissions', authorizeAdmin, authorizePermission('users:update'), setRolePermission);

router.get('/admin/staff', authorizePermission('team:read'), listStaff);
router.get('/admin/staff/:userId', authorizePermission('team:read'), getStaffById);
router.post('/admin/staff', authorizeAdmin, authorizePermission('users:create'), createStaff);
router.patch('/admin/staff/:userId', authorizeAdmin, authorizePermission('users:update'), updateStaff);
router.delete('/admin/staff/:userId', authorizeAdmin, authorizePermission('users:update'), deleteStaff);

router.get('/admin/customers', authorizePermission('customers:read'), listCustomers);
router.post('/admin/customers', authorizePermission('customers:create'), createCustomer);
router.get('/admin/customers/:customerId', authorizePermission('customers:read'), getCustomer);
router.get('/admin/customers/:customerId/history', authorizePermission('customers:read'), getCustomerPurchaseHistory);
router.patch('/admin/customers/:customerId', authorizePermission('customers:update'), updateCustomer);
router.delete('/admin/customers/:customerId', authorizePermission('customers:update'), deactivateCustomer);

router.get('/notifications', authenticateToken, listNotifications);
router.get('/notifications/:notificationId', authenticateToken, getNotification);
router.patch('/notifications/:notificationId/read', authenticateToken, (req, res, next) => {
    req.params.action = 'read';
    setNotificationRead(req, res, next);
});
router.patch('/notifications/:notificationId/unread', authenticateToken, (req, res, next) => {
    req.params.action = 'unread';
    setNotificationRead(req, res, next);
});
router.patch('/notifications/read-all', authenticateToken, markAllNotificationsRead);
router.delete('/notifications/read', authenticateToken, deleteReadNotifications);

router.use('/admin/notifications', authenticateToken);
router.get('/admin/notifications', authorizePermission('notifications:read'), listNotifications);
router.post('/admin/notifications', authorizePermission('notifications:create'), createNotification);
router.get('/admin/notifications/:notificationId', authorizePermission('notifications:read'), getNotification);
router.patch('/admin/notifications/:notificationId', authorizePermission('notifications:update'), updateNotification);
router.delete('/admin/notifications/:notificationId', authorizePermission('notifications:update'), deleteNotification);

export default router;
