import { connectDatabase, schema, sequelize } from './db.js';

export { schema, sequelize };

export default {
    sequelize,
    connect: connectDatabase,
    sync: async (options = {}) => sequelize.sync(options),
};