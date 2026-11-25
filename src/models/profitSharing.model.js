import { DataTypes } from 'sequelize';
import { schema, sequelize } from '../config/db.js';
import User from './user.model.js';
import { Role } from './auth.model.js';
import { StaffProfile } from './staffProfile.model.js';

const options = (tableName) => ({
    schema,
    tableName,
    freezeTableName: true,
    timestamps: true,
});

export const StaffRoleAssignment = sequelize.define('StaffRoleAssignment', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    staffId: { type: DataTypes.UUID, allowNull: false },
    roleId: { type: DataTypes.STRING(30), allowNull: false },
    customProfitPercentage: { type: DataTypes.DECIMAL(7, 4), allowNull: true },
    effectiveFrom: { type: DataTypes.DATEONLY, allowNull: false },
    effectiveTo: { type: DataTypes.DATEONLY, allowNull: true },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'active' },
    createdBy: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, options('staff_role_assignments'));

export const RoleProfitShareConfiguration = sequelize.define('RoleProfitShareConfiguration', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    roleId: { type: DataTypes.STRING(30), allowNull: false },
    defaultProfitPercentage: { type: DataTypes.DECIMAL(7, 4), allowNull: false },
    effectiveFrom: { type: DataTypes.DATEONLY, allowNull: false },
    effectiveTo: { type: DataTypes.DATEONLY, allowNull: true },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'active' },
    createdBy: { type: DataTypes.UUID, allowNull: true },
}, options('role_profit_share_configurations'));

export const ProfitShareCalculation = sequelize.define('ProfitShareCalculation', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    businessDate: { type: DataTypes.DATEONLY, allowNull: false },
    calculationVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    eligibleNetProfit: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    revenueBreakdown: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    expenseBreakdown: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    totalAllocationPercentage: { type: DataTypes.DECIMAL(7, 4), allowNull: false },
    totalProfitShare: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'draft' },
    calculatedBy: { type: DataTypes.UUID, allowNull: true },
    calculatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    approvedBy: { type: DataTypes.UUID, allowNull: true },
    approvedAt: { type: DataTypes.DATE, allowNull: true },
    rejectedBy: { type: DataTypes.UUID, allowNull: true },
    rejectedAt: { type: DataTypes.DATE, allowNull: true },
    remarks: { type: DataTypes.TEXT, allowNull: true },
}, options('profit_share_calculations'));

export const ProfitShareCalculationDetail = sequelize.define('ProfitShareCalculationDetail', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    calculationId: { type: DataTypes.UUID, allowNull: false },
    staffId: { type: DataTypes.UUID, allowNull: false },
    roleId: { type: DataTypes.STRING(30), allowNull: false },
    roleAssignmentId: { type: DataTypes.UUID, allowNull: false },
    appliedPercentage: { type: DataTypes.DECIMAL(7, 4), allowNull: false },
    eligibleNetProfit: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    calculatedShare: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
}, options('profit_share_calculation_details'));

export const ProfitShareApproval = sequelize.define('ProfitShareApproval', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    calculationId: { type: DataTypes.UUID, allowNull: false },
    action: { type: DataTypes.STRING(20), allowNull: false },
    actedBy: { type: DataTypes.UUID, allowNull: false },
    actedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    remarks: { type: DataTypes.TEXT, allowNull: true },
}, options('profit_share_approvals'));

export const ProfitShareAdjustment = sequelize.define('ProfitShareAdjustment', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    calculationId: { type: DataTypes.UUID, allowNull: false },
    calculationDetailId: { type: DataTypes.UUID, allowNull: true },
    previousAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    adjustedAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    reason: { type: DataTypes.TEXT, allowNull: false },
    adjustedBy: { type: DataTypes.UUID, allowNull: false },
}, options('profit_share_adjustments'));

export const ProfitSharePayment = sequelize.define('ProfitSharePayment', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    paymentReference: { type: DataTypes.STRING(100), allowNull: true },
    idempotencyKey: { type: DataTypes.STRING(100), allowNull: true, unique: true },
    paymentDate: { type: DataTypes.DATEONLY, allowNull: false },
    paymentMethod: { type: DataTypes.STRING(30), allowNull: false },
    totalAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'successful' },
    remarks: { type: DataTypes.TEXT, allowNull: true },
    createdBy: { type: DataTypes.UUID, allowNull: false },
}, options('profit_share_payments'));

export const ProfitSharePaymentDetail = sequelize.define('ProfitSharePaymentDetail', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    paymentId: { type: DataTypes.UUID, allowNull: false },
    calculationDetailId: { type: DataTypes.UUID, allowNull: false },
    staffId: { type: DataTypes.UUID, allowNull: false },
    allocatedAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
}, options('profit_share_payment_details'));

export const StaffActivityLog = sequelize.define('StaffActivityLog', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    staffId: { type: DataTypes.UUID, allowNull: false },
    action: { type: DataTypes.STRING(80), allowNull: false },
    actorId: { type: DataTypes.UUID, allowNull: true },
    details: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
}, options('staff_activity_logs'));

export function initializeProfitSharingAssociations() {
    StaffRoleAssignment.belongsTo(User, { foreignKey: 'staffId', as: 'staff' });
    StaffRoleAssignment.belongsTo(Role, { foreignKey: 'roleId', as: 'role' });
    RoleProfitShareConfiguration.belongsTo(Role, { foreignKey: 'roleId', as: 'role' });
    ProfitShareCalculation.hasMany(ProfitShareCalculationDetail, { foreignKey: 'calculationId', as: 'details' });
    ProfitShareCalculationDetail.belongsTo(ProfitShareCalculation, { foreignKey: 'calculationId', as: 'calculation' });
    ProfitShareCalculationDetail.belongsTo(User, { foreignKey: 'staffId', as: 'staff' });
    ProfitShareCalculationDetail.belongsTo(Role, { foreignKey: 'roleId', as: 'role' });
    ProfitSharePayment.hasMany(ProfitSharePaymentDetail, { foreignKey: 'paymentId', as: 'allocations' });
}
