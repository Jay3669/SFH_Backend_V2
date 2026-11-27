import { DataTypes } from 'sequelize';
import Branch from './branch.model.js';
import { StaffProfile } from './staffProfile.model.js';
import User from './user.model.js';
import MenuCategory from './menuCategory.model.js';
import MenuItem from './menuItem.model.js';
import Recipe from './recipes.model.js';
import RecipeVersion from './recipeVersion.model.js';
import RecipeIngredient from './recipeIngredient.model.js';
import StockCategory from './stockCategory.model.js';
import StockItem from './stockItem.model.js';
import { StockMovement } from './stock.model.js';
import ProductionRecord from './productionRecord.model.js';
import ProductionCostDetail from './productionCostDetail.model.js';
import ProductionCancellation from './productionCancellation.model.js';
import ProductionIngredient from './productionIngredient.model.js';
import ProductionSale from './productionSale.model.js';
import ProductionSaleItem from './productionSaleItem.model.js';
import ProductionDay from './productionDay.model.js';
import ProductionDayItem from './productionDayItem.model.js';
import ProductionRecovery from './productionRecovery.model.js';
import OperatingExpense from './operatingExpense.model.js';
import {
    StaffRoleAssignment,
    RoleProfitShareConfiguration,
    ProfitShareCalculation,
    ProfitShareCalculationDetail,
    ProfitShareApproval,
    ProfitShareAdjustment,
    ProfitSharePayment,
    ProfitSharePaymentDetail,
    StaffActivityLog,
    initializeProfitSharingAssociations,
} from './profitSharing.model.js';
import { applyBranchScope, getBranchId } from '../utils/branchContext.js';

const branchScopedModels = [
    MenuCategory,
    MenuItem,
    Recipe,
    RecipeVersion,
    RecipeIngredient,
    StockCategory,
    StockItem,
    StockMovement,
    ProductionRecord,
    ProductionCostDetail,
    ProductionCancellation,
    ProductionIngredient,
    ProductionRecovery,
    ProductionSale,
    ProductionSaleItem,
    ProductionDay,
    ProductionDayItem,
    OperatingExpense,
    StaffProfile,
    StaffRoleAssignment,
    ProfitShareCalculation,
    ProfitShareCalculationDetail,
    ProfitShareApproval,
    ProfitShareAdjustment,
    ProfitSharePayment,
    ProfitSharePaymentDetail,
    StaffActivityLog,
];

function initializeBranchScope() {
    for (const model of branchScopedModels) {
        if (!model.rawAttributes.branchId) {
            model.rawAttributes.branchId = {
                type: DataTypes.UUID,
                allowNull: false,
                primaryKey: model === ProductionDay,
                field: 'branch_id',
                references: { model: Branch.getTableName(), key: 'id' },
                onDelete: 'RESTRICT',
            };
            model.refreshAttributes();
        }

        model.addHook('beforeFind', (options) => applyBranchScope(options, model));
        model.addHook('beforeCount', (options) => applyBranchScope(options, model));
        model.addHook('beforeBulkUpdate', (options) => {
            applyBranchScope(options, model);
            if (options.attributes) delete options.attributes.branchId;
        });
        model.addHook('beforeBulkDestroy', (options) => applyBranchScope(options, model));
        model.addHook('beforeValidate', (instance) => {
            const branchId = getBranchId();
            if (branchId) instance.branchId = branchId;
        });
        model.addHook('beforeBulkCreate', (instances) => {
            const branchId = getBranchId();
            if (branchId) instances.forEach((instance) => { instance.branchId = branchId; });
        });
    }
}

export function initializeAssociations() {
    initializeBranchScope();
    MenuCategory.hasMany(MenuItem, { foreignKey: 'categoryId', as: 'menuItems' });
    MenuItem.belongsTo(MenuCategory, { foreignKey: 'categoryId', as: 'menuCategory' });
    MenuItem.hasOne(Recipe, { foreignKey: 'menuItemId', as: 'recipe' });
    Recipe.belongsTo(MenuItem, { foreignKey: 'menuItemId', as: 'menuItem' });

    Recipe.hasMany(RecipeVersion, { foreignKey: 'recipeId', as: 'versions' });
    RecipeVersion.belongsTo(Recipe, { foreignKey: 'recipeId', as: 'recipe' });
    RecipeVersion.hasMany(RecipeIngredient, { foreignKey: 'recipeVersionId', as: 'ingredients' });
    RecipeIngredient.belongsTo(RecipeVersion, { foreignKey: 'recipeVersionId', as: 'recipeVersion' });
    RecipeIngredient.belongsTo(StockItem, { foreignKey: 'stockItemId', as: 'stockItem' });

    StockCategory.hasMany(StockItem, { foreignKey: 'categoryId', as: 'items' });
    StockItem.belongsTo(StockCategory, { foreignKey: 'categoryId', as: 'stockCategory' });
    StockMovement.belongsTo(StockItem, { foreignKey: 'stockItemId', as: 'item' });

    ProductionRecord.belongsTo(MenuItem, { foreignKey: 'menuItemId', as: 'menuItem' });
    ProductionRecord.belongsTo(RecipeVersion, { foreignKey: 'recipeVersionId', as: 'recipeVersion' });
    ProductionRecord.belongsTo(User, { foreignKey: 'preparedBy', as: 'preparedByUser' });
    ProductionRecord.hasMany(ProductionIngredient, { foreignKey: 'productionRecordId', as: 'ingredients' });
    ProductionRecord.hasMany(ProductionCostDetail, { foreignKey: 'productionRecordId', as: 'additionalCosts' });
    ProductionRecord.hasOne(ProductionCancellation, { foreignKey: 'productionRecordId', as: 'cancellation' });
    ProductionIngredient.belongsTo(StockItem, { foreignKey: 'stockItemId', as: 'stockItem' });
    ProductionCancellation.hasMany(ProductionRecovery, { foreignKey: 'cancellationId', as: 'recoveries' });
    ProductionRecovery.belongsTo(ProductionIngredient, { foreignKey: 'productionIngredientId', as: 'productionIngredient' });

    ProductionDay.belongsTo(User, { foreignKey: 'closedBy', as: 'closedByUser' });
    ProductionDay.hasMany(ProductionDayItem, {
        foreignKey: 'productionDate',
        sourceKey: 'productionDate',
        as: 'items',
        constraints: false,
    });
    ProductionSale.hasMany(ProductionSaleItem, { foreignKey: 'saleId', as: 'items' });
    ProductionSaleItem.belongsTo(ProductionSale, { foreignKey: 'saleId', as: 'sale' });
    initializeProfitSharingAssociations();
}

export {
    Branch,
    StaffProfile,
    User,
    MenuCategory,
    MenuItem,
    Recipe,
    RecipeVersion,
    RecipeIngredient,
    StockCategory,
    StockItem,
    StockMovement,
    ProductionRecord,
    ProductionCostDetail,
    ProductionCancellation,
    ProductionIngredient,
    ProductionRecovery,
    ProductionSale,
    ProductionSaleItem,
    ProductionDay,
    ProductionDayItem,
    OperatingExpense,
    StaffRoleAssignment,
    RoleProfitShareConfiguration,
    ProfitShareCalculation,
    ProfitShareCalculationDetail,
    ProfitShareApproval,
    ProfitShareAdjustment,
    ProfitSharePayment,
    ProfitSharePaymentDetail,
    StaffActivityLog,
};
