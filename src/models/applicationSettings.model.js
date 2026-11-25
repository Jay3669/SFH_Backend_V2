import { DataTypes } from 'sequelize';
import { schema, sequelize } from "../config/db.js";
import User from './user.model.js';

const ApplicationSettings = sequelize.define(
    'application_settings',
    {
        id: {
            type: DataTypes.SMALLINT,
            primaryKey: true,
        },
        settings: {
            type: DataTypes.JSONB,
            allowNull: false,
            defaultValue: {},
        },
        nextInvoiceNumber: {
            type: DataTypes.BIGINT,
            allowNull: false,
            defaultValue: 1,
        },
        updatedBy: {
            type: DataTypes.UUID,
            allowNull: true,
            references: { model: User, key: 'id' },
            onDelete: 'SET NULL',
        },
    },
    {
        schema,
        timestamps: true,
        freezeTableName: true,
    },
);

export default ApplicationSettings;
