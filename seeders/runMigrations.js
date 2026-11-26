import database, { schema } from '../src/config/database.js';
import { baselineMigrations } from '../src/services/migrationRunner.js';

const [command, version] = process.argv.slice(2);

try {
    if (command !== '--baseline' || !version) {
        throw new Error('Usage: npm run migrate:baseline -- <three-digit-version>');
    }
    await database.connect();
    await baselineMigrations(database.sequelize, schema, version);
    console.log(`Baseline completed through migration ${version}.`);
} catch (error) {
    console.error(`Migration baseline failed: ${error.message}`);
    process.exitCode = 1;
} finally {
    await database.sequelize.close();
}
