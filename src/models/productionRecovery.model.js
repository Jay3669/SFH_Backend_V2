import { DataTypes } from 'sequelize';
import { schema, sequelize } from '../config/db.js';
import ProductionCancellation from './productionCancellation.model.js';
import ProductionIngredient from './productionIngredient.model.js';
import { StockMovement } from './stock.model.js';

const ProductionRecovery = sequelize.define(
    'production_recoveries',
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        cancellationId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: ProductionCancellation, key: 'id' },
            onDelete: 'RESTRICT',
        },
        productionIngredientId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: ProductionIngredient, key: 'id' },
            onDelete: 'RESTRICT',
        },
        quantityRecovered: {
            type: DataTypes.DECIMAL(14, 3),
            allowNull: false,
        },
        unit: {
            type: DataTypes.STRING(24),
            allowNull: false,
        },
        stockMovementId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: StockMovement, key: 'id' },
            onDelete: 'RESTRICT',
        },
    },
    {
        schema,
        timestamps: true,
        freezeTableName: true,
        tableName: 'production_recoveries',
    },
);

export default ProductionRecovery;
