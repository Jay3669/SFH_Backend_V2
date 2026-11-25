import { connectDatabase, sequelize } from './db.js';

export { sequelize };

export default {
    sequelize,
    connect: connectDatabase,
    sync: async (options = {}) => sequelize.sync(options),
};