import { Router } from 'express';
import { authenticateToken, authorizeAdmin, authorizeRole } from '../middleware/auth.js';
import { requireBranchContext } from '../middleware/branchContext.js';
import { createBranch, deleteBranch, listBranches, updateBranch } from '../controllers/branchController.js';

const router = Router();

router.use('/admin/branches', authenticateToken);
router.get('/admin/branches', authorizeRole(['admin', 'manager', 'cashier', 'employee']), listBranches);
router.post('/admin/branches', authorizeAdmin, createBranch);
router.patch('/admin/branches/:branchId', authorizeAdmin, updateBranch);
router.delete('/admin/branches/:branchId', authorizeAdmin, deleteBranch);

router.use('/admin/dashboard', authenticateToken, requireBranchContext);
router.use('/admin/customers/:customerId/history', authenticateToken, requireBranchContext);
router.use('/admin/stock', authenticateToken, requireBranchContext);
router.use('/admin/production', authenticateToken, requireBranchContext);
router.use('/admin/staff', authenticateToken, requireBranchContext);

export default router;
