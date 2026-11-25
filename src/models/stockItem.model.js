import { DataTypes, literal } from "sequelize";
import { schema, sequelize } from "../config/db.js";
import StockCategory from "./stockCategory.model.js";

const StockItem = sequelize.define(
    'StockItem',
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        itemCode: {
            type: DataTypes.STRING(32),
            allowNull: false,
            defaultValue: literal(`'ITM-' || CASE WHEN nextval('${schema}.stock_item_code_seq'::regclass) < 1000000 THEN lpad(currval('${schema}.stock_item_code_seq'::regclass)::text, 6, '0') ELSE currval('${schema}.stock_item_code_seq'::regclass)::text END`),
            field: 'item_code',
        },
        name: {
            type: DataTypes.STRING(120),
            allowNull: false
        },
        imageUrl: {
            type: DataTypes.STRING(2048),
            allowNull: true,
            field: 'image_url',
        },
        sku: {
            type: DataTypes.STRING(64),
            allowNull: true,
            unique: true,
        },
        expiryDate: {
            type: DataTypes.DATEONLY,
            allowNull: true,
            field: 'expiry_date',
        },
        displayOrder: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
            field: 'display_order',
            validate: {
                min: 0,
            },
        },
        categoryId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {
                model: StockCategory,
                key: 'id'
            },
            onDelete: 'RESTRICT',
        },
        category: {
            type: DataTypes.STRING(80),
            allowNull: false,
            defaultValue: 'General'
        },
        unit: {
            type: DataTypes.STRING(24),
            allowNull: false
        },
        quantity: {
            type: DataTypes.DECIMAL(14, 3),
            allowNull: false, defaultValue: 0
        },
        reorderLevel: {
            type: DataTypes.DECIMAL(14, 3),
            allowNull: false, defaultValue: 0
        },
        unitCost: {
            type: DataTypes.DECIMAL(14, 2),
            allowNull: false, defaultValue: 0
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false, defaultValue: true
        },
    },
    {
        schema,
        timestamps: true,
        freezeTableName: true,
        tableName: 'stock_items',
        indexes: [
            { name: 'stock_items_category_idx', fields: ['category'] },
            { name: 'stock_items_category_id_idx', fields: ['categoryId'] },
            { name: 'stock_items_active_idx', fields: ['isActive'] },
        ],
    },
);

export default StockItem;