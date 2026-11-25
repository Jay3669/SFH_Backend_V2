import { DataTypes } from "sequelize";
import { schema, sequelize } from "../config/db.js";
import ProductionSale from "./productionSale.model.js";
import ProductionRecord from "./productionRecord.model.js";
import MenuItem from "./menuItem.model.js";

const ProductionSaleItem = sequelize.define(
    "production_sale_items",
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        saleId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {
                model: ProductionSale,
                key: "id"
            },
            onDelete: "RESTRICT",
        },
        productionRecordId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {
                model: ProductionRecord,
                key: "id"
            },
            onDelete: "RESTRICT",
        },
        menuItemId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {
                model: MenuItem,
                key: "id"
            },
            onDelete: "RESTRICT",
        },
        menuItemName: {
            type: DataTypes.STRING(120),
            allowNull: false
        },
        quantity: {
            type: DataTypes.DECIMAL(14, 3),
            allowNull: false
        },
        unitPrice: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false
        },
        costPerPlate: {
            type: DataTypes.DECIMAL(14, 2),
            allowNull: false
        },
        discountAmount: {
            type: DataTypes.DECIMAL(14, 2),
            allowNull: false,
            defaultValue: 0,
        },
        totalPrice: {
            type: DataTypes.DECIMAL(14, 2),
            allowNull: false
        },
    },
    {
        schema,
        timestamps: true,
        freezeTableName: true,
        tableName: "production_sale_items",
        indexes: [
            { name: "production_sale_items_sale_idx", fields: ["saleId"] },
            {
                name: "production_sale_items_record_idx",
                fields: ["productionRecordId"],
            },
        ],
    },
);

export default ProductionSaleItem;