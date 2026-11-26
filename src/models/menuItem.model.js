import { DataTypes, literal } from "sequelize";
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
        itemCode: {
            type: DataTypes.STRING(32),
            allowNull: false,
            defaultValue: literal(`'MITM-' || CASE WHEN nextval('${schema}.menu_item_code_seq'::regclass) < 1000000 THEN lpad(currval('${schema}.menu_item_code_seq'::regclass)::text, 6, '0') ELSE currval('${schema}.menu_item_code_seq'::regclass)::text END`),
            field: "item_code",
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
        displayOrder: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
            field: "display_order",
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