import { DataTypes } from 'sequelize';
import { schema, sequelize } from '../config/db.js';

export const StaffProfile = sequelize.define('StaffProfile', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false, unique: true },
    address: { type: DataTypes.TEXT, allowNull: true },
    department: { type: DataTypes.STRING(100), allowNull: true },
    designation: { type: DataTypes.STRING(100), allowNull: true },
    joiningDate: { type: DataTypes.DATEONLY, allowNull: true },
    salary: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    employmentStatus: { type: DataTypes.ENUM('active', 'on_leave', 'inactive'), allowNull: false, defaultValue: 'active' },
    profileImage: { type: DataTypes.TEXT, allowNull: true },
    createdBy: { type: DataTypes.UUID, allowNull: true },
    employeeId: { type: DataTypes.STRING(40), allowNull: true },
    emergencyContact: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    gender: { type: DataTypes.STRING(20), allowNull: true },
    dateOfBirth: { type: DataTypes.DATEONLY, allowNull: true },
    alternatePhone: { type: DataTypes.STRING(30), allowNull: true },
    employmentType: { type: DataTypes.STRING(30), allowNull: true },
}, {
    schema,
    tableName: 'staff_profiles',
    freezeTableName: true,
    timestamps: true,
    indexes: [{
        name: 'staff_profiles_branch_employee_id_unique',
        unique: true,
        fields: ['branch_id', 'employeeId'],
    }],
});

