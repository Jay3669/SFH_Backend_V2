import { DataTypes } from 'sequelize';
import { schema, sequelize } from '../config/db.js';

export const Notification = sequelize.define('Notification', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    title: { type: DataTypes.STRING(160), allowNull: false },
    message: { type: DataTypes.TEXT, allowNull: false },
    category: { type: DataTypes.ENUM(
        'general', 'production', 'inventory', 'billing', 'payment',
        'staff', 'customer', 'system',
    ), allowNull: false, defaultValue: 'general' },
    targetRole: { type: DataTypes.STRING(30), allowNull: true },
    targetUserId: { type: DataTypes.UUID, allowNull: true },
    createdBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema,
    tableName: 'notifications',
    freezeTableName: true,
    timestamps: true,
});

export const NotificationRecipient = sequelize.define('NotificationRecipient', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    notificationId: { type: DataTypes.UUID, allowNull: false },
    userId: { type: DataTypes.UUID, allowNull: false },
    readAt: { type: DataTypes.DATE, allowNull: true },
}, {
    schema,
    tableName: 'notification_recipients',
    freezeTableName: true,
    timestamps: true,
    indexes: [{ unique: true, fields: ['notificationId', 'userId'] }],
});
