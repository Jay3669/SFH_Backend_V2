import { DataTypes } from "sequelize";
import { schema, sequelize } from "../config/db.js";
import ProductionRecord from "./productionRecord.model.js";
import RecipeIngredient from "./recipeIngredient.model.js";
import StockItem from "./stockItem.model.js";
import { StockMovement } from "./stock.model.js";

const ProductionIngredient = sequelize.define(
    "production_ingredients",
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        productionRecordId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: ProductionRecord, key: "id" },
            onDelete: "RESTRICT",
        },
        recipeIngredientId: {
            type: DataTypes.UUID,
            allowNull: true,
            references: { model: RecipeIngredient, key: "id" },
            onDelete: "RESTRICT",
        },
        stockItemId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: StockItem, key: "id" },
            onDelete: "RESTRICT",
        },
        ingredientName: {
            type: DataTypes.STRING(120),
            allowNull: false
        },
        theoreticalQuantity: {
            type: DataTypes.DECIMAL(14, 3),
            allowNull: false
        },
        quantityDeducted: {
            type: DataTypes.DECIMAL(14, 3),
            allowNull: false
        },
        unit: {
            type: DataTypes.STRING(24),
            allowNull: false
        },
        wastagePercentage: {
            type: DataTypes.DECIMAL(5, 2),
            allowNull: false,
            defaultValue: 0,
        },
        recipeWastagePercentage: {
            type: DataTypes.DECIMAL(5, 2),
            allowNull: false,
            defaultValue: 0,
        },
        unitCost: {
            type: DataTypes.DECIMAL(14, 2),
            allowNull: false
        },
        totalCost: {
            type: DataTypes.DECIMAL(14, 2),
            allowNull: false
        },
        balanceAfter: {
            type: DataTypes.DECIMAL(14, 3),
            allowNull: false
        },
        stockMovementId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: StockMovement, key: "id" },
            onDelete: "RESTRICT",
        },
    },
    {
        schema,
        timestamps: true,
        freezeTableName: true,
        tableName: "production_ingredients",
        indexes: [
            {
                name: "production_ingredients_record_idx",
                fields: ["productionRecordId"],
            },
        ],
    },
);

export default ProductionIngredient;