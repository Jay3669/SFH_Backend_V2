import { DataTypes, literal } from "sequelize";
import { schema, sequelize } from "../config/db.js";

const StockCategory = sequelize.define(
    'stock_categories',
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
            defaultValue: literal(`'CAT-' || CASE WHEN nextval('${schema}.stock_category_code_seq'::regclass) < 1000000 THEN lpad(currval('${schema}.stock_category_code_seq'::regclass)::text, 6, '0') ELSE currval('${schema}.stock_category_code_seq'::regclass)::text END`),
            field: 'category_code',
        },
        description: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        imageUrl: {
            type: DataTypes.STRING(2048),
            allowNull: true,
            field: 'image_url',
        },
        displayOrder: {
            type: DataTypes.INTEGER,
            allowNull: false,
            field: 'display_order',
            validate: {
                min: 1,
            },
        },
    },
    {
        schema,
        timestamps: true,
        freezeTableName: true,
        tableName: 'stock_categories'
    },
);

export default StockCategory;

