import { Op } from 'sequelize';
import database from '../config/database.js';
import User from '../models/user.model.js';
import { Role } from '../models/auth.model.js';
import { StaffProfile } from '../models/staffProfile.model.js';
import ApplicationSettings from '../models/applicationSettings.model.js';
import {
    StaffRoleAssignment,
    RoleProfitShareConfiguration,
    ProfitShareCalculation,
    ProfitShareCalculationDetail,
    ProfitShareApproval,
    ProfitShareAdjustment,
    ProfitSharePayment,
    ProfitSharePaymentDetail,
} from '../models/profitSharing.model.js';
import { getFinancialReport } from './productionService.js';
import { toScaledInteger } from '../utils/productionMath.js';

export class ProfitSharingError extends Error {
    constructor(statusCode, message, code = 'PROFIT_SHARING_ERROR') {
        super(message);
        this.name = 'ProfitSharingError';
        this.statusCode = statusCode;
        this.code = code;
    }
}

const money = (value) => Number(value || 0);
const cents = (value, label) => toScaledInteger(value, 2, label);
const fromCents = (value) => Number(value) / 100;
const pct = (value) => toScaledInteger(value, 4, 'Profit percentage');
const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value));

const getAllocationLimit = async (transaction) => {
    const settings = await ApplicationSettings.findByPk(1, { transaction });
    const value = settings?.settings?.profitSharing?.maxAllocationPercentage;
    if (value === undefined) return 20;
    if (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 100) {
        throw new ProfitSharingError(503, 'The configured staff allocation limit is invalid.', 'INVALID_ALLOCATION_LIMIT');
    }
    return Number(value);
};

export const listRoles = async () => Role.findAll({ order: [['id', 'ASC']] });

export const upsertRoleProfitPercentage = async (roleId, body, actorId, transaction) => {
    const role = await Role.findByPk(roleId);
    if (!role) throw new ProfitSharingError(404, 'Role not found.', 'ROLE_NOT_FOUND');
    const value = Number(body.defaultProfitPercentage);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
        throw new ProfitSharingError(400, 'defaultProfitPercentage must be between 0 and 100.', 'VALIDATION_ERROR');
    }
    const effectiveFrom = body.effectiveFrom;
    if (!isDate(effectiveFrom)) throw new ProfitSharingError(400, 'effectiveFrom must be YYYY-MM-DD.', 'VALIDATION_ERROR');
    await RoleProfitShareConfiguration.update(
        { effectiveTo: effectiveFrom, status: 'inactive' },
        { where: { roleId, status: 'active', effectiveFrom: { [Op.lt]: effectiveFrom } }, transaction },
    );
    return RoleProfitShareConfiguration.create({
        roleId,
        defaultProfitPercentage: value,
        effectiveFrom,
        status: 'active',
        createdBy: actorId,
    }, { transaction });
};

export const assignStaffRole = async (staffId, body, actorId) => database.sequelize.transaction(async (transaction) => {
    const staff = await User.findByPk(staffId, { transaction });
    if (!staff) throw new ProfitSharingError(404, 'Staff not found.', 'STAFF_NOT_FOUND');
    const role = await Role.findByPk(body.roleId, { transaction });
    if (!role) throw new ProfitSharingError(404, 'Role not found.', 'ROLE_NOT_FOUND');
    if (!isDate(body.effectiveFrom)) throw new ProfitSharingError(400, 'effectiveFrom must be YYYY-MM-DD.', 'VALIDATION_ERROR');
    if (body.customProfitPercentage !== undefined && body.customProfitPercentage !== null) {
        const value = Number(body.customProfitPercentage);
        if (!Number.isFinite(value) || value < 0 || value > 100) {
            throw new ProfitSharingError(400, 'customProfitPercentage must be between 0 and 100.', 'VALIDATION_ERROR');
        }
    }
    const existing = await StaffRoleAssignment.findOne({
        where: { staffId, roleId: body.roleId, status: 'active' },
        transaction,
        lock: transaction.LOCK.UPDATE,
    });
    if (existing) throw new ProfitSharingError(409, 'This role is already assigned to the employee.', 'DUPLICATE_ROLE_ASSIGNMENT');
    const assignment = await StaffRoleAssignment.create({
        staffId,
        roleId: body.roleId,
        customProfitPercentage: body.customProfitPercentage ?? null,
        effectiveFrom: body.effectiveFrom,
        effectiveTo: body.effectiveTo || null,
        status: 'active',
        createdBy: actorId,
        updatedBy: actorId,
    }, { transaction });
    return assignment;
});

export const listStaffRoles = async (staffId) => StaffRoleAssignment.findAll({
    where: { staffId },
    order: [['effectiveFrom', 'DESC'], ['createdAt', 'DESC']],
});

export const updateStaffRole = async (staffId, assignmentId, body, actorId) => database.sequelize.transaction(async (transaction) => {
    const assignment = await StaffRoleAssignment.findOne({
        where: { id: assignmentId, staffId },
        transaction,
        lock: transaction.LOCK.UPDATE,
    });
    if (!assignment) throw new ProfitSharingError(404, 'Role assignment not found.', 'ASSIGNMENT_NOT_FOUND');
    if (body.customProfitPercentage !== undefined) {
        const value = body.customProfitPercentage === null ? null : Number(body.customProfitPercentage);
        if (value !== null && (!Number.isFinite(value) || value < 0 || value > 100)) {
            throw new ProfitSharingError(400, 'customProfitPercentage must be between 0 and 100.', 'VALIDATION_ERROR');
        }
        assignment.customProfitPercentage = value;
    }
    if (body.effectiveFrom) {
        if (!isDate(body.effectiveFrom)) throw new ProfitSharingError(400, 'effectiveFrom must be YYYY-MM-DD.', 'VALIDATION_ERROR');
        assignment.effectiveFrom = body.effectiveFrom;
    }
    if (body.effectiveTo !== undefined) assignment.effectiveTo = body.effectiveTo || null;
    if (body.status) assignment.status = body.status;
    assignment.updatedBy = actorId;
    await assignment.save({ transaction });
    return assignment;
});

export const removeStaffRole = async (staffId, assignmentId, actorId) => database.sequelize.transaction(async (transaction) => {
    const assignment = await StaffRoleAssignment.findOne({
        where: { id: assignmentId, staffId },
        transaction,
        lock: transaction.LOCK.UPDATE,
    });
    if (!assignment) throw new ProfitSharingError(404, 'Role assignment not found.', 'ASSIGNMENT_NOT_FOUND');
    await assignment.update({ status: 'inactive', effectiveTo: new Date().toISOString().slice(0, 10), updatedBy: actorId }, { transaction });
    return { id: assignment.id, status: 'inactive' };
});

export const calculateDailyProfitSharing = async (businessDate, actorId) => database.sequelize.transaction(async (transaction) => {
    if (!isDate(businessDate)) throw new ProfitSharingError(400, 'businessDate must be YYYY-MM-DD.', 'VALIDATION_ERROR');
    await database.sequelize.query("SELECT pg_advisory_xact_lock(hashtext($1))", {
        bind: [`profit-sharing:${businessDate}`],
        transaction,
    });
    const existing = await ProfitShareCalculation.findOne({
        where: { businessDate },
        transaction,
        lock: transaction.LOCK.UPDATE,
    });
    if (existing) throw new ProfitSharingError(409, 'A calculation already exists for this business date.', 'DUPLICATE_DAILY_CALCULATION');

    const report = await getFinancialReport({ from: businessDate, to: businessDate, paymentStatus: 'completed' });
    const daily = report.daily?.find((row) => row.date === businessDate);
    const eligibleNetProfit = money(daily?.netProfit ?? report.summary?.netProfit ?? 0);
    if (eligibleNetProfit < 0) throw new ProfitSharingError(422, 'Net profit is negative; no staff profit share can be calculated.', 'NEGATIVE_NET_PROFIT');

    const assignments = await StaffRoleAssignment.findAll({
        where: {
            status: 'active',
            effectiveFrom: { [Op.lte]: businessDate },
            [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: businessDate } }],
        },
        transaction,
    });
    const roleIds = [...new Set(assignments.map((assignment) => assignment.roleId))];
    const configs = await RoleProfitShareConfiguration.findAll({
        where: {
            roleId: { [Op.in]: roleIds },
            status: 'active',
            effectiveFrom: { [Op.lte]: businessDate },
            [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: businessDate } }],
        },
        order: [['effectiveFrom', 'DESC']],
        transaction,
    });
    const configByRole = new Map();
    for (const config of configs) {
        if (!configByRole.has(config.roleId)) configByRole.set(config.roleId, config);
    }

    const netCents = cents(eligibleNetProfit, 'Eligible net profit');
    let totalPercentageTenK = 0n;
    const details = [];
    for (const assignment of assignments) {
        const staff = await User.findByPk(assignment.staffId, { attributes: ['id', 'firstName', 'lastName', 'isActive', 'status'], transaction });
        if (!staff || !staff.isActive || staff.status !== 'active') continue;
        let applied;
        if (assignment.customProfitPercentage !== null) {
            applied = assignment.customProfitPercentage;
        } else {
            const config = configByRole.get(assignment.roleId);
            if (!config) {
                throw new ProfitSharingError(422, `No effective profit percentage is configured for role ${assignment.roleId}.`, 'MISSING_ROLE_PERCENTAGE');
            }
            applied = config.defaultProfitPercentage;
        }
        const percentageTenK = pct(applied);
        totalPercentageTenK += percentageTenK;
        const shareCents = (netCents * percentageTenK + 500_000n) / 1_000_000n;
        details.push({
            staffId: assignment.staffId,
            roleId: assignment.roleId,
            roleAssignmentId: assignment.id,
            appliedPercentage: fromCentsPercent(percentageTenK),
            eligibleNetProfit: eligibleNetProfit,
            calculatedShare: fromCents(shareCents),
        });
    }
    const totalAllocation = Number(totalPercentageTenK) / 10000;
    const limit = await getAllocationLimit(transaction);
    if (totalAllocation > limit) {
        throw new ProfitSharingError(422, `Total allocation ${totalAllocation.toFixed(4)}% exceeds the configured limit of ${limit.toFixed(4)}%.`, 'ALLOCATION_LIMIT_EXCEEDED');
    }
    const totalShareCents = details.reduce((sum, detail) => sum + cents(detail.calculatedShare, 'Calculated share'), 0n);
    const calculation = await ProfitShareCalculation.create({
        businessDate,
        eligibleNetProfit: fromCents(netCents),
        revenueBreakdown: {
            salesRevenue: report.summary?.totalSalesRevenue ?? 0,
            discounts: report.summary?.discounts ?? 0,
        },
        expenseBreakdown: {
            productionCost: report.summary?.totalProductionCost ?? 0,
            operatingExpenses: report.summary?.operatingExpenses ?? 0,
        },
        totalAllocationPercentage: totalAllocation,
        totalProfitShare: fromCents(totalShareCents),
        status: 'pending_approval',
        calculatedBy: actorId,
        calculatedAt: new Date(),
    }, { transaction });
    await ProfitShareCalculationDetail.bulkCreate(details.map((detail) => ({
        ...detail,
        calculationId: calculation.id,
    })), { transaction });
    return { calculation, details };
});

const fromCentsPercent = (value) => Number(value) / 10000;

export const getDailyCalculations = async (query) => {
    const where = {};
    if (query.businessDate) where.businessDate = query.businessDate;
    if (query.status) where.status = query.status;
    if (query.from && query.to) where.businessDate = { [Op.between]: [query.from, query.to] };
    return ProfitShareCalculation.findAll({
        where,
        include: [{ model: ProfitShareCalculationDetail, as: 'details', include: [{ model: User, as: 'staff', attributes: ['id', 'firstName', 'lastName'] }, { model: Role, as: 'role', attributes: ['id', 'name'] }] }],
        order: [['businessDate', 'DESC'], ['createdAt', 'DESC']],
    });
};

export const getCalculationById = async (id) => {
    const calculation = await ProfitShareCalculation.findByPk(id, {
        include: [{ model: ProfitShareCalculationDetail, as: 'details', include: [{ model: User, as: 'staff', attributes: ['id', 'firstName', 'lastName', 'email'] }, { model: Role, as: 'role', attributes: ['id', 'name'] }] }],
    });
    if (!calculation) throw new ProfitSharingError(404, 'Profit-sharing calculation not found.', 'CALCULATION_NOT_FOUND');
    return calculation;
};

export const approveOrRejectCalculation = async (id, action, remarks, actorId) => database.sequelize.transaction(async (transaction) => {
    const calculation = await ProfitShareCalculation.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!calculation) throw new ProfitSharingError(404, 'Profit-sharing calculation not found.', 'CALCULATION_NOT_FOUND');
    if (calculation.status === 'approved') throw new ProfitSharingError(409, 'This calculation is already approved.', 'DUPLICATE_APPROVAL');
    if (calculation.status === 'rejected') throw new ProfitSharingError(409, 'This calculation is already rejected.', 'ALREADY_REJECTED');
    if (actorId === calculation.calculatedBy && action === 'approve') {
        throw new ProfitSharingError(403, 'Employees cannot approve their own profit-sharing records.', 'SELF_APPROVAL_NOT_ALLOWED');
    }
    if (action === 'approve') await calculation.update({
        status: 'approved',
        approvedBy: actorId,
        approvedAt: new Date(),
        remarks: remarks || null,
    }, { transaction });
    else await calculation.update({
        status: 'rejected',
        rejectedBy: actorId,
        rejectedAt: new Date(),
        remarks: remarks || null,
    }, { transaction });
    await ProfitShareApproval.create({
        calculationId: id,
        action,
        actedBy: actorId,
        actedAt: new Date(),
        remarks: remarks || null,
    }, { transaction });
    return calculation;
});

export const adjustCalculationDetail = async (id, detailId, body, actorId) => database.sequelize.transaction(async (transaction) => {
    const calculation = await ProfitShareCalculation.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!calculation || calculation.status !== 'approved') throw new ProfitSharingError(409, 'Only approved calculations can be adjusted.', 'ADJUSTMENT_NOT_ALLOWED');
    const detail = await ProfitShareCalculationDetail.findByPk(detailId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!detail || detail.calculationId !== id) throw new ProfitSharingError(404, 'Calculation detail not found.', 'DETAIL_NOT_FOUND');
    const adjustedAmount = Number(body.adjustedAmount);
    if (!Number.isFinite(adjustedAmount) || adjustedAmount < 0) throw new ProfitSharingError(400, 'adjustedAmount must be non-negative.', 'VALIDATION_ERROR');
    if (!body.reason) throw new ProfitSharingError(400, 'reason is required.', 'VALIDATION_ERROR');
    await ProfitShareAdjustment.create({
        calculationId: id,
        calculationDetailId: detailId,
        previousAmount: detail.calculatedShare,
        adjustedAmount,
        reason: body.reason,
        adjustedBy: actorId,
    }, { transaction });
    await detail.update({ calculatedShare: adjustedAmount }, { transaction });
    const sumCents = await ProfitShareCalculationDetail.sum('calculatedShare', { where: { calculationId: id }, transaction });
    await calculation.update({ totalProfitShare: sumCents || 0 }, { transaction });
    return detail;
});

export const recordProfitSharePayment = async (body, actorId) => database.sequelize.transaction(async (transaction) => {
    if (!Array.isArray(body.allocations) || body.allocations.length === 0) throw new ProfitSharingError(400, 'At least one payment allocation is required.', 'VALIDATION_ERROR');
    if (!['cash', 'upi', 'bank_transfer'].includes(body.paymentMethod)) throw new ProfitSharingError(400, 'Unsupported payment method.', 'VALIDATION_ERROR');
    if (!isDate(body.paymentDate)) throw new ProfitSharingError(400, 'paymentDate must be YYYY-MM-DD.', 'VALIDATION_ERROR');
    if (body.idempotencyKey) {
        const duplicate = await ProfitSharePayment.findOne({ where: { idempotencyKey: body.idempotencyKey }, transaction });
        if (duplicate) return duplicate;
    }
    const detailIds = body.allocations.map((allocation) => allocation.calculationDetailId);
    const details = await ProfitShareCalculationDetail.findAll({
        where: { id: { [Op.in]: detailIds } },
        include: [{ model: ProfitShareCalculation, as: 'calculation' }],
        transaction,
        lock: transaction.LOCK.UPDATE,
    });
    if (details.length !== detailIds.length) throw new ProfitSharingError(404, 'One or more payable records were not found.', 'PAYABLE_NOT_FOUND');
    const detailById = new Map(details.map((detail) => [detail.id, detail]));
    let totalCents = 0n;
    const allocationRows = [];
    for (const allocation of body.allocations) {
        const detail = detailById.get(allocation.calculationDetailId);
        if (!detail || detail.calculation.status !== 'approved') throw new ProfitSharingError(409, 'Payments require approved profit-sharing records.', 'PAYABLE_NOT_APPROVED');
        const amountCents = cents(allocation.amount, 'Payment amount');
        if (amountCents <= 0n) throw new ProfitSharingError(400, 'Payment allocation must be greater than zero.', 'VALIDATION_ERROR');
        const paidCents = await ProfitSharePaymentDetail.sum('allocatedAmount', {
            where: { calculationDetailId: detail.id },
            transaction,
        });
        const paid = cents(paidCents || 0, 'Previously paid amount');
        const approved = cents(detail.calculatedShare, 'Approved payable amount');
        if (paid + amountCents > approved) throw new ProfitSharingError(422, 'Payment exceeds the outstanding approved payable amount.', 'OVERPAYMENT');
        totalCents += amountCents;
        allocationRows.push({ calculationDetailId: detail.id, staffId: detail.staffId, allocatedAmount: fromCents(amountCents) });
    }
    const payment = await ProfitSharePayment.create({
        paymentReference: body.paymentReference || null,
        idempotencyKey: body.idempotencyKey || null,
        paymentDate: body.paymentDate,
        paymentMethod: body.paymentMethod,
        totalAmount: fromCents(totalCents),
        status: 'successful',
        remarks: body.remarks || null,
        createdBy: actorId,
    }, { transaction });
    await ProfitSharePaymentDetail.bulkCreate(allocationRows.map((row) => ({ ...row, paymentId: payment.id })), { transaction });
    return payment;
});

export const getEmployeeDailyProfile = async (staffId, businessDate) => {
    const where = { staffId };
    if (businessDate) where['$calculation.businessDate$'] = businessDate;
    return ProfitShareCalculationDetail.findAll({
        where,
        include: [
            { model: ProfitShareCalculation, as: 'calculation' },
            { model: User, as: 'staff', attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'] },
            { model: Role, as: 'role', attributes: ['id', 'name'] },
        ],
        order: [['createdAt', 'DESC']],
    });
};
