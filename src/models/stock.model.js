import StockCategory from './stockCategory.model.js';
import StockItem from './stockItem.model.js';
import { DataTypes } from 'sequelize';
import { schema, sequelize } from '../config/db.js';

const StockMovement = sequelize.define('StockMovement', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    stockItemId: { type: DataTypes.UUID, allowNull: false },
    type: { type: DataTypes.ENUM('in', 'out', 'count'), allowNull: false },
    quantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false },
    unitCost: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
    change: { type: DataTypes.DECIMAL(14, 3), allowNull: false },
    beforeQuantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false },
    afterQuantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false },
    unit: { type: DataTypes.STRING(24), allowNull: false },
    reason: { type: DataTypes.STRING(255), allowNull: false },
    referenceType: { type: DataTypes.STRING(32), allowNull: true },
    referenceId: { type: DataTypes.UUID, allowNull: true },
    totalCost: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
    actorUserId: { type: DataTypes.UUID, allowNull: true },
}, {
    schema,
    tableName: 'stock_movements',
    freezeTableName: true,
    timestamps: true,
});

export { StockCategory, StockItem, StockMovement };
