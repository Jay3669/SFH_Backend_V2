import { DataTypes } from "sequelize";
import { schema, sequelize } from "../config/db.js";
import MenuCategory from "./menuCategory.model.js";

const MenuItem = sequelize.define(
    "menu_items",
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        name: {
            type: DataTypes.STRING(120),
            allowNull: false
        },
        category: {
            type: DataTypes.STRING(80),
            allowNull: false
        },
        categoryId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: MenuCategory, key: "id" },
            onDelete: "RESTRICT",
        },
        price: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false,
            defaultValue: 0,
            validate: { min: 0 },
        },
        isVegetarian: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        imageUrl: {
            type: DataTypes.STRING(2048),
            allowNull: true
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
    },
    {
        schema,
        timestamps: true,
        freezeTableName: true,
        tableName: "menu_items",
        indexes: [
            { 
                name: "menu_items_active_name_idx", 
                fields: ["isActive", "name"] 
            },
        ],
    },
);

export default MenuItem;