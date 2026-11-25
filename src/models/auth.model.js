import { DataTypes } from 'sequelize';
import { schema, sequelize } from '../config/db.js';

const options = (tableName) => ({
    schema,
    tableName,
    freezeTableName: true,
    timestamps: true,
});

export const Role = sequelize.define('Role', {
    id: { type: DataTypes.STRING(30), primaryKey: true },
    name: { type: DataTypes.STRING(60), allowNull: false },
}, options('roles'));

export const Permission = sequelize.define('Permission', {
    id: { type: DataTypes.STRING(100), primaryKey: true },
    description: { type: DataTypes.STRING(255), allowNull: false },
}, options('permissions'));

export const RolePermission = sequelize.define('RolePermission', {
    roleId: { type: DataTypes.STRING(30), primaryKey: true },
    permissionId: { type: DataTypes.STRING(100), primaryKey: true },
}, options('role_permissions'));

export const UserPermission = sequelize.define('UserPermission', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    permissionId: { type: DataTypes.STRING(100), allowNull: false },
    granted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, options('user_permissions'));

export const AuthSession = sequelize.define('AuthSession', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    refreshTokenHash: { type: DataTypes.CHAR(64), allowNull: false, unique: true },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    revokedAt: { type: DataTypes.DATE, allowNull: true },
}, options('auth_sessions'));

export const PasswordResetToken = sequelize.define('PasswordResetToken', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    tokenHash: { type: DataTypes.CHAR(64), allowNull: false },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    verifiedAt: { type: DataTypes.DATE, allowNull: true },
    consumedAt: { type: DataTypes.DATE, allowNull: true },
}, options('password_reset_tokens'));

export const VerificationToken = sequelize.define('VerificationToken', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    channel: { type: DataTypes.ENUM('email', 'phone'), allowNull: false },
    tokenHash: { type: DataTypes.CHAR(64), allowNull: false },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    consumedAt: { type: DataTypes.DATE, allowNull: true },
}, options('verification_tokens'));

export const AuthAuditLog = sequelize.define('AuthAuditLog', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    actorUserId: { type: DataTypes.UUID, allowNull: true },
    subjectUserId: { type: DataTypes.UUID, allowNull: true },
    action: { type: DataTypes.STRING(80), allowNull: false },
    ipAddress: { type: DataTypes.STRING(64), allowNull: true },
    details: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
}, options('auth_audit_logs'));
