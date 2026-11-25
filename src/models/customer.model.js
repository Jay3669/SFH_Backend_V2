import { DataTypes } from 'sequelize';
import { schema, sequelize } from '../config/db.js';

export const Customer = sequelize.define('Customer', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: true },
    fullName: { type: DataTypes.STRING(200), allowNull: false },
    email: { type: DataTypes.STRING(254), allowNull: true, unique: true },
    phoneNumber: { type: DataTypes.STRING(30), allowNull: false, unique: true },
    address: { type: DataTypes.TEXT, allowNull: true },
    dateOfBirth: { type: DataTypes.DATEONLY, allowNull: true },
    status: { type: DataTypes.ENUM('active', 'inactive'), allowNull: false, defaultValue: 'active' },
    totalPurchases: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    totalSpending: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
}, {
    schema,
    tableName: 'customers',
    freezeTableName: true,
    timestamps: true,
    indexes: [{ fields: ['fullName'] }, { fields: ['status'] }],
});

