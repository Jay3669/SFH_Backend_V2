import { CREATED, OPERATION_SUCCESS } from '../function/response.js';
import {
    listRoles,
    upsertRoleProfitPercentage,
    assignStaffRole,
    listStaffRoles,
    updateStaffRole,
    removeStaffRole,
    calculateDailyProfitSharing,
    getDailyCalculations,
    getCalculationById,
    approveOrRejectCalculation,
    adjustCalculationDetail,
    recordProfitSharePayment,
    getEmployeeDailyProfile,
} from '../services/profitSharingService.js';

export const listRolesController = async (req, res, next) => {
    try { return res.status(200).json(OPERATION_SUCCESS('Roles loaded.', await listRoles())); }
    catch (error) { return next(error); }
};

export const updateRolePercentageController = async (req, res, next) => {
    try {
        const result = await upsertRoleProfitPercentage(req.params.roleId, req.body, req.user.id);
        return res.status(200).json(OPERATION_SUCCESS('Role profit percentage updated.', result));
    } catch (error) { return next(error); }
};

export const assignStaffRoleController = async (req, res, next) => {
    try { return res.status(201).json(CREATED('Role assigned.', await assignStaffRole(req.params.staffId, req.body, req.user.id))); }
    catch (error) { return next(error); }
};

export const listStaffRolesController = async (req, res, next) => {
    try { return res.status(200).json(OPERATION_SUCCESS('Staff role assignments loaded.', await listStaffRoles(req.params.staffId))); }
    catch (error) { return next(error); }
};

export const updateStaffRoleController = async (req, res, next) => {
    try { return res.status(200).json(OPERATION_SUCCESS('Role assignment updated.', await updateStaffRole(req.params.staffId, req.params.assignmentId, req.body, req.user.id))); }
    catch (error) { return next(error); }
};

export const removeStaffRoleController = async (req, res, next) => {
    try { return res.status(200).json(OPERATION_SUCCESS('Role assignment removed.', await removeStaffRole(req.params.staffId, req.params.assignmentId, req.user.id))); }
    catch (error) { return next(error); }
};

export const calculateDailyController = async (req, res, next) => {
    try {
        const result = await calculateDailyProfitSharing(req.body.businessDate, req.user.id);
        return res.status(201).json(CREATED('Daily net profit sharing calculated.', result));
    } catch (error) { return next(error); }
};

export const listDailyController = async (req, res, next) => {
    try { return res.status(200).json(OPERATION_SUCCESS('Daily profit-sharing calculations loaded.', await getDailyCalculations(req.query))); }
    catch (error) { return next(error); }
};

export const getCalculationController = async (req, res, next) => {
    try { return res.status(200).json(OPERATION_SUCCESS('Profit-sharing calculation loaded.', await getCalculationById(req.params.id))); }
    catch (error) { return next(error); }
};

export const approveCalculationController = async (req, res, next) => {
    try { return res.status(200).json(OPERATION_SUCCESS('Profit-sharing calculation approved.', await approveOrRejectCalculation(req.params.id, 'approve', req.body?.remarks, req.user.id))); }
    catch (error) { return next(error); }
};

export const rejectCalculationController = async (req, res, next) => {
    try { return res.status(200).json(OPERATION_SUCCESS('Profit-sharing calculation rejected.', await approveOrRejectCalculation(req.params.id, 'reject', req.body?.remarks, req.user.id))); }
    catch (error) { return next(error); }
};

export const adjustCalculationController = async (req, res, next) => {
    try { return res.status(200).json(OPERATION_SUCCESS('Approved profit-sharing calculation adjusted.', await adjustCalculationDetail(req.params.id, req.body.calculationDetailId, req.body, req.user.id))); }
    catch (error) { return next(error); }
};

export const recordPaymentController = async (req, res, next) => {
    try { return res.status(201).json(CREATED('Profit-sharing payment recorded.', await recordProfitSharePayment(req.body, req.user.id))); }
    catch (error) { return next(error); }
};

export const employeeProfileController = async (req, res, next) => {
    try { return res.status(200).json(OPERATION_SUCCESS('Employee daily profit profile loaded.', await getEmployeeDailyProfile(req.params.staffId, req.query.businessDate))); }
    catch (error) { return next(error); }
};
