import { DataTypes } from 'sequelize';
import { schema, sequelize } from '../config/db.js';

const Branch = sequelize.define('Branch', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    name: {
        type: DataTypes.STRING(120),
        allowNull: false,
        validate: { notEmpty: true },
    },
    code: {
        type: DataTypes.STRING(20),
        allowNull: false,
        set(value) {
            this.setDataValue('code', typeof value === 'string' ? value.trim().toUpperCase() : value);
        },
    },
    address: {
        type: DataTypes.STRING(500),
        allowNull: true,
    },
    phone: {
        type: DataTypes.STRING(30),
        allowNull: true,
    },
    email: {
        type: DataTypes.STRING(254),
        allowNull: true,
        validate: { isEmail: true },
    },
}, {
    schema,
    tableName: 'branches',
    freezeTableName: true,
    timestamps: true,
    indexes: [{ name: 'branches_code_unique', unique: true, fields: ['code'] }],
});

export default Branch;
