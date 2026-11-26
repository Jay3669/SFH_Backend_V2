import database, { schema } from '../src/config/database.js';
import { QueryTypes } from 'sequelize';

export async function validateSeedData(transaction) {
    const tables = [
        'users','roles','permissions','role_permissions','auth_audit_logs','staff_profiles','customers',
        'menu_categories','menu_items','stock_categories','stock_items','stock_movements',
        'recipes','recipe_versions','recipe_ingredients','production_records','production_ingredients',
        'production_cost_details','production_cancellations','production_recoveries','production_days',
        'production_day_items','production_sales','production_sale_items','cash_drawers',
        'operating_expenses','notifications','notification_recipients','application_settings',
    ];
    const counts=[];
    for (const table of tables) {
        const [row]=await database.sequelize.query(
            `SELECT COUNT(*)::integer AS count FROM "${schema}"."${table}"`,
            { type:QueryTypes.SELECT, transaction },
        );
        counts.push({table,finalCount:row.count});
    }

    const orphanSql = [
        ['menu_items.categoryId','menu_categories','menu_items','categoryId'],
        ['stock_items.categoryId','stock_categories','stock_items','categoryId'],
        ['recipes.menuItemId','menu_items','recipes','menuItemId'],
        ['production_records.menuItemId','menu_items','production_records','menuItemId'],
        ['production_sale_items.saleId','production_sales','production_sale_items','saleId'],
    ];
    const orphans=[];
    for (const [label,parent,child,foreign] of orphanSql) {
        const [row]=await database.sequelize.query(
            `SELECT COUNT(*)::integer AS count
             FROM "${schema}"."${child}" c
             LEFT JOIN "${schema}"."${parent}" p ON p."id" = c."${foreign}"
             WHERE p."id" IS NULL`,
            { type:QueryTypes.SELECT, transaction },
        );
        orphans.push({relationship:label,orphanCount:row.count});
    }

    const [negativeStock]=await database.sequelize.query(
        `SELECT COUNT(*)::integer AS count FROM "${schema}"."stock_items" WHERE "quantity" < 0`,
        { type:QueryTypes.SELECT, transaction },
    );
    const [mismatchedSales]=await database.sequelize.query(
        `SELECT COUNT(*)::integer AS count
         FROM "${schema}"."production_sales"
         WHERE ABS("totalAmount" - ("subtotal" - "discountAmount" + "taxAmount" + "packingCharge")) > 0.01`,
        { type:QueryTypes.SELECT, transaction },
    );
    const duplicateQueries = [
        ['users.email','users','email'],
        ['users.phoneNumber','users','phoneNumber'],
        ['customers.phoneNumber','customers','phoneNumber'],
        ['stock_items.sku','stock_items','sku'],
        ['recipes.menuItemId','recipes','menuItemId'],
    ];
    const duplicates=[];
    for (const [label,table,column] of duplicateQueries) {
        const [row]=await database.sequelize.query(
            `SELECT COUNT(*)::integer AS count FROM (
                SELECT "${column}" FROM "${schema}"."${table}"
                WHERE "${column}" IS NOT NULL
                GROUP BY "${column}" HAVING COUNT(*) > 1
             ) duplicate_values`,
            { type:QueryTypes.SELECT, transaction },
        );
        duplicates.push({field:label,duplicateValueCount:row.count});
    }
    return {counts,orphans,duplicates,negativeStockCount:negativeStock.count,mismatchedSalesCount:mismatchedSales.count};
}
