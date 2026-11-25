import crypto from 'node:crypto';
import { Op } from 'sequelize';
import MenuItem from '../src/models/menuItem.model.js';
import StockItem from '../src/models/stockItem.model.js';
import User from '../src/models/user.model.js';
import Recipe from '../src/models/recipes.model.js';
import RecipeVersion from '../src/models/recipeVersion.model.js';
import RecipeIngredient from '../src/models/recipeIngredient.model.js';
import { StockMovement } from '../src/models/stock.model.js';

export async function seedRecipesInventory(transaction) {
    const menuItems = await MenuItem.findAll({ where: { name: { [Op.iLike]: 'Special%' } }, transaction }).catch(() => []);
    const allMenuItems = menuItems.length ? menuItems : await MenuItem.findAll({ limit:50, order:[['name','ASC']], transaction });
    const stockItems = await StockItem.findAll({ where: { sku: { [Op.iLike]: 'SFH-QA-%' } }, transaction }).catch(() => []);
    const qaStock = stockItems.length ? stockItems : await StockItem.findAll({ limit:50, order:[['name','ASC']], transaction });
    const creator = await User.findOne({ where:{ role:'manager' }, transaction }) || await User.findOne({ transaction });
    let recipesCreated=0, versionsCreated=0, ingredientsCreated=0, movementsCreated=0;

    for (let i=0;i<allMenuItems.length;i+=1) {
        const menu = allMenuItems[i];
        const [recipe,recipeCreated] = await Recipe.findOrCreate({
            where:{ menuItemId:menu.id },
            defaults:{ menuItemId:menu.id,name:menu.name,currentVersion:1,isArchived:false,createdBy:creator.id,updatedBy:creator.id },
            transaction,
        });
        if (recipeCreated) recipesCreated+=1;
        const [version,versionCreated] = await RecipeVersion.findOrCreate({
            where:{ recipeId:recipe.id,version:1 },
            defaults:{
                recipeId:recipe.id,version:1,baseProductionQuantity:5,baseProductionUnit:'kg',
                expectedPlateCount:20,servingSize:250,servingUnit:'g',
                preparationInstructions:`Prepare ${menu.name} in small batches, maintain food temperature and garnish before service.`,
                cookingTimeMinutes:35,wastagePercentage:3,createdBy:creator.id,updatedBy:creator.id,
            }, transaction,
        });
        if (versionCreated) versionsCreated+=1;

        for (let j=0;j<4;j+=1) {
            const stock = qaStock[(i*4+j)%qaStock.length];
            if (!stock) continue;
            const [ingredient,created] = await RecipeIngredient.findOrCreate({
                where:{ recipeVersionId:version.id,stockItemId:stock.id },
                defaults:{ recipeVersionId:version.id,stockItemId:stock.id,quantity:0.25+(j*0.15),unit:stock.unit,preparationNotes:'Cleaned and portioned before cooking.',wastagePercentage:j===0?2:1 },
                transaction,
            });
            if (created) ingredientsCreated+=1;
        }
    }

    for (let i=0;i<50;i+=1) {
        const stock = qaStock[i%qaStock.length];
        if (!stock) continue;
        const hash = crypto.createHash('sha256').update(`opening-stock:${stock.id}:${i}`).digest('hex');
        const existing = await StockMovement.findOne({ where:{ reason:`QA opening stock ${i+1}` }, transaction });
        if (!existing) {
            await StockMovement.create({
                stockItemId:stock.id,type:'in',quantity:25,unitCost:stock.unitCost,change:25,beforeQuantity:Number(stock.quantity)||0,
                afterQuantity:Number(stock.quantity||0)+25,unit:stock.unit,reason:`QA opening stock ${i+1}`,referenceType:'seed',referenceId:crypto.randomUUID(),actorUserId:creator.id,
            }, { transaction });
            await stock.update({ quantity:Number(stock.quantity||0)+25 }, { transaction });
            movementsCreated+=1;
        }
    }
    return { recipesCreated,recipeVersionsCreated:versionsCreated,recipeIngredientsCreated:ingredientsCreated,stockMovementsCreated:movementsCreated };
}
