import Branch from '../models/branch.model.js';
import { BAD_REQUEST, CONFLICT, FORBIDDEN, NOT_FOUND } from '../function/response.js';
import { runWithBranchContext } from '../utils/branchContext.js';

export const requireBranchContext = async (req, res, next) => {
    try {
        const requestedBranchId = req.get('X-Branch-Id')?.trim().toLowerCase();
        if (requestedBranchId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedBranchId)) {
            return res.status(400).json(BAD_REQUEST('X-Branch-Id must be a valid branch identifier.'));
        }
        let branchId;
        if (req.user.role === 'admin') {
            branchId = requestedBranchId || req.user.branchId;
            if (!branchId) {
                const defaultBranch = await Branch.findOne({ where: { code: 'MAIN' } });
                branchId = defaultBranch?.id;
            }
        } else {
            branchId = req.user.branchId;
            if (!branchId) {
                return res.status(403).json(FORBIDDEN('Your account is not assigned to a branch.'));
            }
            if (requestedBranchId && requestedBranchId !== branchId) {
                return res.status(403).json(FORBIDDEN('You cannot access another branch.'));
            }
        }

        if (!branchId) {
            return res.status(409).json(CONFLICT('Create a branch before using branch-scoped management.'));
        }

        const branch = await Branch.findByPk(branchId);
        if (!branch) return res.status(404).json(NOT_FOUND('The selected branch was not found.'));

        req.branchId = branch.id;
        return runWithBranchContext(branch.id, next);
    } catch (error) {
        return next(error);
    }
};
