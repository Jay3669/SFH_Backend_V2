import { DataTypes } from "sequelize";
import { schema, sequelize } from "../config/db.js";
import RecipeVersion from "./recipeVersion.model.js";
import StockItem from "./stockItem.model.js";

const RecipeIngredient = sequelize.define(
    "recipe_ingredients",
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        recipeVersionId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: RecipeVersion, key: "id" },
            onDelete: "RESTRICT",
        },
        stockItemId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: StockItem, key: "id" },
            onDelete: "RESTRICT",
        },
        quantity: {
            type: DataTypes.DECIMAL(14, 3),
            allowNull: false
        },
        unit: {
            type: DataTypes.STRING(24),
            allowNull: false
        },
        preparationNotes: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        wastagePercentage: {
            type: DataTypes.DECIMAL(5, 2),
            allowNull: false,
            defaultValue: 0,
        },
    },
    {
        schema,
        timestamps: true,
        freezeTableName: true,
        tableName: "recipe_ingredients",
    },
);

export default RecipeIngredient;