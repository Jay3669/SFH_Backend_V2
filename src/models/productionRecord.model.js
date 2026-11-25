import { DataTypes } from "sequelize";
import { schema, sequelize } from "../config/db.js";
import MenuItem from "./menuItem.model.js";
import RecipeVersion from "./recipeVersion.model.js";
import User from "./user.model.js";

const ProductionRecord = sequelize.define(
    "production_records",
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        reference: {
            type: DataTypes.STRING(40),
            allowNull: false,
            unique: true
        },
        idempotencyKey: {
            type: DataTypes.STRING(100),
            allowNull: false,
            unique: true,
        },
        requestHash: {
            type: DataTypes.STRING(64),
            allowNull: false
        },
        menuItemId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: MenuItem, key: "id" },
            onDelete: "RESTRICT",
        },
        recipeVersionId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: RecipeVersion, key: "id" },
            onDelete: "RESTRICT",
        },
        productionDate: {
            type: DataTypes.DATEONLY,
            allowNull: false
        },
        productionQuantity: {
            type: DataTypes.DECIMAL(14, 3),
            allowNull: false
        },
        productionUnit: {
            type: DataTypes.STRING(24),
            allowNull: false
        },
        expectedPlateCount: {
            type: DataTypes.DECIMAL(14, 3),
            allowNull: false
        },
        actualPlateCount: {
            type: DataTypes.DECIMAL(14, 3),
            allowNull: true
        },
        sellingPricePerPlate: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false,
            defaultValue: 0,
        },
        totalIngredientCost: {
            type: DataTypes.DECIMAL(14, 2),
            allowNull: false
        },
        additionalCost: {
            type: DataTypes.DECIMAL(14, 2),
            allowNull: false,
            defaultValue: 0,
        },
        totalProductionCost: {
            type: DataTypes.DECIMAL(14, 2),
            allowNull: false
        },
        costPerKg: {
            type: DataTypes.DECIMAL(14, 2),
            allowNull: true
        },
        costPerPlate: {
            type: DataTypes.DECIMAL(14, 2),
            allowNull: false
        },
        notes: {
            type: DataTypes.STRING(1000),
            allowNull: true
        },
        preparedBy: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: User, key: "id" },
            onDelete: "RESTRICT",
        },
        status: {
            type: DataTypes.STRING(16),
            allowNull: false,
            defaultValue: "confirmed",
        },
    },
    {
        schema,
        timestamps: true,
        freezeTableName: true,
        tableName: "production_records",
        indexes: [
            {
                name: "production_records_date_status_idx",
                fields: ["productionDate", "status"],
            },
            {
                name: "production_records_menu_date_idx",
                fields: ["menuItemId", "productionDate"],
            },
            {
                name: "production_records_prepared_by_idx",
                fields: ["preparedBy"]
            },
        ],
    },
);

export default ProductionRecord;