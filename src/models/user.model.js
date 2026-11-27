import { DataTypes } from "sequelize";
import { schema, sequelize } from "../config/db.js";
import Branch from "./branch.model.js";

export const USER_ROLES = Object.freeze({
    ADMIN: "admin",
    MANAGER: "manager",
    CASHIER: "cashier",
    EMPLOYEE: "employee",
    CUSTOMER: "customer",
});

export const STAFF_ROLES = Object.freeze([
    USER_ROLES.MANAGER,
    USER_ROLES.CASHIER,
    USER_ROLES.EMPLOYEE,
]);

const User = sequelize.define(
    "User",
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        firstName: {
            type: DataTypes.STRING(120),
            allowNull: false,
            validate: { notEmpty: true },
        },
        lastName: {
            type: DataTypes.STRING(120),
            allowNull: false,
            validate: { notEmpty: true },
        },
        email: {
            type: DataTypes.STRING(254),
            allowNull: true,
            unique: true,
            validate: { isEmail: true },
        },
        passwordHash: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        phoneNumber: {
            type: DataTypes.STRING(30),
            allowNull: true,
            unique: true,
        },
        branchId: {
            type: DataTypes.UUID,
            allowNull: true,
            field: 'branch_id',
            references: { model: Branch, key: 'id' },
            onDelete: 'RESTRICT',
        },
        role: {
            type: DataTypes.STRING(30),
            allowNull: false,
            validate: { isIn: [Object.values(USER_ROLES)] },
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },
        status: {
            type: DataTypes.ENUM("active", "inactive", "blocked"),
            allowNull: false,
            defaultValue: "active",
        },
        isVerified: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        emailVerifiedAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        phoneVerifiedAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        isSubscribed: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
    },
    {
        schema,
        timestamps: true,
        freezeTableName: true,
        tableName: "users",
        indexes: [
            { fields: ["role"] },
            { name: "users_status_idx", fields: ["status"] },
            { fields: ["isVerified"] },
            { fields: ["isSubscribed"] },
        ],
    },
);

export default User;
