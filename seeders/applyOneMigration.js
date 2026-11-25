import fs from 'node:fs';
import database, { schema } from '../src/config/database.js';

const file = process.argv[2];
if (!file) throw new Error('Migration file argument is required.');

try {
    await database.connect();
    const sql = fs.readFileSync(file, 'utf8').replace(/\bpublic\b/g, schema);
    await database.sequelize.query(sql);
    console.log(`Applied migration ${file}`);
} finally {
    await database.sequelize.close();
}
