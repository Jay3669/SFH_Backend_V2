import database, { schema } from '../src/config/database.js';
import { applySingleMigration } from '../src/services/migrationRunner.js';

const file = process.argv[2];
if (!file) throw new Error('Migration file argument is required.');

try {
    await database.connect();
    const applied = await applySingleMigration(database.sequelize, schema, file);
    console.log(applied ? `Applied migration ${file}` : `Migration already applied: ${file}`);
} finally {
    await database.sequelize.close();
}
