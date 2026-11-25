import database from '../src/config/database.js';
import { initializeAssociations } from '../src/models/index.js';
import { assertSafeTestDatabase } from './safety.js';
import { seedAuthUsers } from './01_authUsers.js';
import { seedCatalog } from './02_catalog.js';
import { seedRecipesInventory } from './03_recipesInventory.js';
import { seedOperations } from './04_operations.js';
import { seedSupporting } from './05_supporting.js';
import { validateSeedData } from './06_validate.js';

async function main() {
    assertSafeTestDatabase();
    initializeAssociations();
    await database.connect();

    const report = await database.sequelize.transaction(async (transaction) => {
        const users = await seedAuthUsers(transaction);
        const catalog = await seedCatalog(transaction);
        const recipesInventory = await seedRecipesInventory(transaction);
        const operations = await seedOperations(transaction);
        const supporting = await seedSupporting(transaction);
        const validation = await validateSeedData(transaction);
        return { users, catalog, recipesInventory, operations, supporting, validation };
    });

    console.log(JSON.stringify({
        message: 'Realistic non-production seed completed.',
        database: process.env.DB_NAME,
        schema: process.env.DB_SCHEMA || 'public',
        inserted: report,
    }, null, 2));
}

main()
    .catch((error) => {
        console.error(`Realistic seeding failed: ${error.message}`);
        console.error(error.stack);
        process.exitCode = 1;
    })
    .finally(async () => {
        await database.sequelize.close();
    });
