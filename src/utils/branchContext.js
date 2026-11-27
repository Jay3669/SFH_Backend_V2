import { AsyncLocalStorage } from 'node:async_hooks';
import { Op } from 'sequelize';

const branchContext = new AsyncLocalStorage();

export function getBranchId() {
    return branchContext.getStore()?.branchId;
}

export function runWithBranchContext(branchId, callback) {
    return branchContext.run({ branchId }, callback);
}

export function applyBranchScope(options, model) {
    const branchId = getBranchId();
    if (!branchId) return options;

    if (model?.rawAttributes?.branchId) {
        options.where = options.where
            ? { [Op.and]: [options.where, { branchId }] }
            : { branchId };
    }
    const includes = Array.isArray(options.include)
        ? options.include
        : options.include ? [options.include] : [];
    for (const include of includes) {
        if (include.model?.rawAttributes?.branchId && include.required === undefined) {
            include.required = Boolean(include.where);
        }
        applyBranchScope(include, include.model);
    }
    return options;
}
