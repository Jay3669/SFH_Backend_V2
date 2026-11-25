import { DataTypes } from "sequelize";
import { schema, sequelize } from "../config/db.js";
import MenuItem from "./menuItem.model.js";
import User from "./user.model.js";

const Recipe = sequelize.define(
    "recipes",
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        menuItemId: {
            type: DataTypes.UUID,
            allowNull: false,
            unique: true,
            references: { model: MenuItem, key: "id" },
            onDelete: "RESTRICT",
        },
        name: {
            type: DataTypes.STRING(120),
            allowNull: false
        },
        currentVersion: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1,
        },
        isArchived: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        createdBy: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: User, key: "id" },
            onDelete: "RESTRICT",
        },
        updatedBy: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: User, key: "id" },
            onDelete: "RESTRICT",
        },
    },
    {
        schema,
        timestamps: true,
        freezeTableName: true,
        tableName: "recipes"
    },
);

export default Recipe;