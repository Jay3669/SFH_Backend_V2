import { DataTypes, literal } from "sequelize";
import { schema, sequelize } from "../config/db.js";

const MenuCategory = sequelize.define(
    "menu_categories",
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        name: {
            type: DataTypes.STRING(80),
            allowNull: false
        },
        categoryCode: {
            type: DataTypes.STRING(32),
            allowNull: false,
            defaultValue: literal(`'MCAT-' || CASE WHEN nextval('${schema}.menu_category_code_seq'::regclass) < 1000000 THEN lpad(currval('${schema}.menu_category_code_seq'::regclass)::text, 6, '0') ELSE currval('${schema}.menu_category_code_seq'::regclass)::text END`),
            field: "category_code",
        },
        description: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        displayOrder: {
            type: DataTypes.INTEGER,
            allowNull: false,
            field: "display_order",
            validate: { min: 0 },
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
        tableName: "menu_categories",
        indexes: [
            { 
                name: "menu_categories_display_order_idx", 
                fields: ["display_order"] 
            },
            { 
                name: "menu_categories_active_idx", 
                fields: ["isActive"] 
            },
        ],
    },
);

export default MenuCategory;
