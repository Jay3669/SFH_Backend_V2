import { DataTypes } from "sequelize";
import { schema, sequelize } from "../config/db.js";
import MenuItem from "./menuItem.model.js";

const ProductionDayItem = sequelize.define(
    "ProductionDayItem",
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        productionDate: {
            type: DataTypes.DATEONLY,
            allowNull: false,
        },
        menuItemId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {
                model: MenuItem,
                key: "id"
            },
            onDelete: "RESTRICT",
        },
        menuItemName: {
            type: DataTypes.STRING(120),
            allowNull: false
        },
        producedPlates: {
            type: DataTypes.DECIMAL(14, 3),
            allowNull: false
        },
        soldPlates: {
            type: DataTypes.DECIMAL(14, 3),
            allowNull: false
        },
        wastagePlates: {
            type: DataTypes.DECIMAL(14, 3),
            allowNull: false
        },
        productionCost: {
            type: DataTypes.DECIMAL(14, 2),
            allowNull: false
        },
        salesRevenue: {
            type: DataTypes.DECIMAL(14, 2),
            allowNull: false
        },
        wastageCost: {
            type: DataTypes.DECIMAL(14, 2),
            allowNull: false
        },
    },
    {
        schema,
        timestamps: true,
        freezeTableName: true,
        tableName: "production_day_items",
        indexes: [
            {
                name: "production_day_items_date_menu_unique",
                unique: true,
                fields: ["productionDate", "menuItemId"],
            },
        ],
    },
);

export default ProductionDayItem;