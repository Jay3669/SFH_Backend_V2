import { DataTypes } from "sequelize";
import { schema, sequelize } from "../config/db.js";

const ProductionSale = sequelize.define(
    "production_sales",
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        reference: {
            type: DataTypes.STRING(40),
            allowNull: false,
            unique: true,
        },
        idempotencyKey: {
            type: DataTypes.STRING(100),
            allowNull: false,
            unique: true,
        },
        requestHash: {
            type: DataTypes.CHAR(64),
            allowNull: false,
        },
        productionDate: {
            type: DataTypes.DATEONLY,
            allowNull: false,
        },
        subtotal: {
            type: DataTypes.DECIMAL(14, 2),
            allowNull: false
        },
        discountAmount: {
            type: DataTypes.DECIMAL(14, 2),
            allowNull: false,
            defaultValue: 0,
        },
        taxRate: {
            type: DataTypes.DECIMAL(5, 2),
            allowNull: false,
            defaultValue: 0,
        },
        taxAmount: {
            type: DataTypes.DECIMAL(14, 2),
            allowNull: false,
            defaultValue: 0,
        },
        packingCharge: {
            type: DataTypes.DECIMAL(14, 2),
            allowNull: false,
            defaultValue: 0,
        },
        additionalCharges: {
            type: DataTypes.JSONB,
            allowNull: false,
            defaultValue: [],
        },
        totalAmount: {
            type: DataTypes.DECIMAL(14, 2),
            allowNull: false
        },
        paymentMethod: {
            type: DataTypes.STRING(16),
            allowNull: false
        },
        paymentBreakdown: {
            type: DataTypes.JSONB,
            allowNull: false,
            defaultValue: {},
        },
        paymentStatus: {
            type: DataTypes.STRING(16),
            allowNull: false,
            defaultValue: "completed",
        },
        cashierId: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        customerId: {
            type: DataTypes.UUID,
            allowNull: true,
        },
    },
    {
        schema,
        timestamps: true,
        freezeTableName: true,
        tableName: "production_sales",
        indexes: [
            {
                name: "production_sales_date_status_idx",
                fields: ["productionDate", "paymentStatus"],
            },
        ],
    },
);

export default ProductionSale;