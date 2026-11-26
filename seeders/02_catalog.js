import MenuCategory from '../src/models/menuCategory.model.js';
import MenuItem from '../src/models/menuItem.model.js';
import StockCategory from '../src/models/stockCategory.model.js';
import StockItem from '../src/models/stockItem.model.js';
import database, { schema } from '../src/config/database.js';
import { findNextStockCategoryDisplayOrder } from '../src/utils/stockCategoryDisplayOrder.js';

const menuNames = [
    ['Masala Dosa','Breakfast'], ['Idli Sambar','Breakfast'], ['Medu Vada','Breakfast'], ['Ghee Podi Dosa','Breakfast'], ['Kharabath','Breakfast'],
    ['Paneer Butter Masala','Main Course'], ['Dal Makhani','Main Course'], ['Chole Masala','Main Course'], ['Palak Paneer','Main Course'], ['Kadhai Paneer','Main Course'],
    ['Chicken Biryani','Main Course'], ['Mutton Rogan Josh','Main Course'], ['Butter Chicken','Main Course'], ['Chicken 65','Starters'], ['Fish Fry','Starters'],
    ['Veg Thali','Thali'], ['Mini South Indian Thali','Thali'], ['North Indian Deluxe Thali','Thali'], ['Non-Veg Thali','Thali'], ['Curd Rice Thali','Thali'],
];

export async function seedCatalog(transaction) {
    const menuCategories = [
        ['Breakfast','South Indian breakfast favourites',1],
        ['Starters','Vegetarian and non-vegetarian starters',2],
        ['Main Course','Curries and rice specialties',3],
        ['Thali','Complete Indian meal selections',4],
        ['Beverages','Hot and cold beverages',5],
        ['Desserts','Traditional Indian sweets',6],
        ['Breads','Tandoori and tawa breads',7],
        ['Combos','Popular value meal combinations',8],
    ];
    const categories = {};
    for (const [name,description,displayOrder] of menuCategories) {
        const [row] = await MenuCategory.findOrCreate({ where: { name }, defaults: { name, description, displayOrder, isActive:true }, transaction });
        categories[name] = row;
    }

    let menuCreated = 0;
    for (let i = 0; i < 50; i += 1) {
        const [baseName, categoryName] = menuNames[i % menuNames.length];
        const name = i < menuNames.length ? baseName : `${baseName} - Special ${i - menuNames.length + 1}`;
        const vegetarian = !/Chicken|Mutton|Fish|Non-Veg/.test(name);
        const category = categories[categoryName] || categories['Main Course'];
        const [row,created] = await MenuItem.findOrCreate({
            where: { name },
            defaults: { name, category: category.name, categoryId: category.id, price: vegetarian ? 180 + (i % 8) * 25 : 260 + (i % 8) * 30, isVegetarian:vegetarian, description:`Freshly prepared ${name} using authentic Indian ingredients.`, isActive:true },
            transaction,
        });
        if (created) menuCreated += 1;
    }

    const stockNames = [
        ['Basmati Rice','Grains & Rice','kg'], ['Wheat Flour','Flour & Atta','kg'], ['Ragi Flour','Flour & Atta','kg'], ['Moong Dal','Pulses','kg'],
        ['Chana Dal','Pulses','kg'], ['Toor Dal','Pulses','kg'], ['Chicken','Meat & Seafood','kg'], ['Mutton','Meat & Seafood','kg'], ['Fish','Meat & Seafood','kg'], ['Eggs','Dairy & Eggs','dozen'],
        ['Milk','Dairy & Eggs','litre'], ['Curd','Dairy & Eggs','kg'], ['Paneer','Dairy & Eggs','kg'], ['Ghee','Cooking Essentials','litre'], ['Sunflower Oil','Cooking Essentials','litre'],
    ];
    const stockCategories = {};
    await database.sequelize.query(
        `LOCK TABLE "${schema}"."stock_categories" IN SHARE ROW EXCLUSIVE MODE`,
        { transaction },
    );
    const currentCategoryOrders = await StockCategory.findAll({
        attributes: ['displayOrder'],
        raw: true,
        transaction,
    });
    const usedCategoryOrders = new Set(currentCategoryOrders.map((category) => Number(category.displayOrder)));
    for (const [,categoryName] of stockNames) {
        if (!stockCategories[categoryName]) {
            const displayOrder = findNextStockCategoryDisplayOrder(usedCategoryOrders);
            const [row, created] = await StockCategory.findOrCreate({
                where: { name: categoryName },
                defaults: { name: categoryName, description: `${categoryName} supplies`, displayOrder },
                transaction,
            });
            if (created) usedCategoryOrders.add(displayOrder);
            stockCategories[categoryName] = row;
        }
    }

    let stockCreated = 0;
    for (let i = 0; i < 50; i += 1) {
        const [baseName,categoryName,unit] = stockNames[i % stockNames.length];
        const name = i < stockNames.length ? baseName : `${baseName} - Pack ${i - stockNames.length + 1}`;
        const sku = `SFH-QA-${String(i + 1).padStart(3,'0')}`;
        const category = stockCategories[categoryName];
        const [row,created] = await StockItem.findOrCreate({
            where: { sku },
            defaults: { name, sku, categoryId:category.id, category:category.name, unit, quantity:40 + (i % 30), reorderLevel:10, unitCost:unit==='kg'?45+(i%40):unit==='litre'?60+(i%50):90+(i%60), isActive:true },
            transaction,
        });
        if (created) stockCreated += 1;
    }
    return { menuCategoriesCreated:8, menuItemsCreated:menuCreated, stockCategoriesCreated:Object.keys(stockCategories).length, stockItemsCreated:stockCreated };
}
