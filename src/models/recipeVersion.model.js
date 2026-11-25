import { DataTypes } from 'sequelize';
import { schema, sequelize } from '../config/db.js';
import Recipe from './recipes.model.js';
import User from './user.model.js';

const RecipeVersion = sequelize.define('recipe_versions', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    recipeId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: Recipe, key: 'id' },
        onDelete: 'RESTRICT',
    },
    version: { type: DataTypes.INTEGER, allowNull: false },
    baseProductionQuantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false },
    baseProductionUnit: { type: DataTypes.STRING(24), allowNull: false },
    expectedPlateCount: { type: DataTypes.DECIMAL(14, 3), allowNull: false },
    servingSize: { type: DataTypes.DECIMAL(14, 3), allowNull: true },
    servingUnit: { type: DataTypes.STRING(24), allowNull: true },
    preparationInstructions: { type: DataTypes.TEXT, allowNull: true },
    cookingTimeMinutes: { type: DataTypes.INTEGER, allowNull: true },
    wastagePercentage: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    createdBy: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: User, key: 'id' },
        onDelete: 'RESTRICT',
    },
    updatedBy: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: User, key: 'id' },
        onDelete: 'RESTRICT',
    },
}, {
    schema,
    timestamps: true,
    freezeTableName: true,
    tableName: 'recipe_versions',
});

export default RecipeVersion;
