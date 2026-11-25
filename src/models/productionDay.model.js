import { DataTypes } from "sequelize";
import { schema, sequelize } from "../config/db.js";
import User from "./user.model.js";

export const ProductionDay = sequelize.define(
    "production_days",
    {
        productionDate: {
            type: DataTypes.DATEONLY,
            primaryKey: true
        },
        isClosed: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        closedAt: {
            type: DataTypes.DATE,
            allowNull: true
        },
        closedBy: {
            type: DataTypes.UUID,
            allowNull: true,
            references: { model: User, key: "id" },
            onDelete: "RESTRICT",
        },
        totalProducedPlates: {
            type: DataTypes.DECIMAL(14, 3),
            allowNull: false,
            defaultValue: 0,
        },
        totalSoldPlates: {
            type: DataTypes.DECIMAL(14, 3),
            allowNull: false,
            defaultValue: 0,
        },
        totalWastagePlates: {
            type: DataTypes.DECIMAL(14, 3),
            allowNull: false,
            defaultValue: 0,
        },
        totalProductionCost: {
            type: DataTypes.DECIMAL(14, 2),
            allowNull: false,
            defaultValue: 0,
        },
        totalSalesRevenue: {
            type: DataTypes.DECIMAL(14, 2),
            allowNull: false,
            defaultValue: 0,
        },
        totalWastageCost: {
            type: DataTypes.DECIMAL(14, 2),
            allowNull: false,
            defaultValue: 0,
        },
    },
    {
        schema,
        timestamps: true,
        freezeTableName: true,
        tableName: "production_days"
    },
);

export default ProductionDay;