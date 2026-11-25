import { DataTypes } from "sequelize";
import { schema, sequelize } from "../config/db.js";
import ProductionRecord from "./productionRecord.model.js";

const ProductionCostDetail = sequelize.define(
    "production_cost_details",
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
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
        name: {
            type: DataTypes.STRING(80),
            allowNull: false
        },
        amount: {
            type: DataTypes.DECIMAL(14, 2),
            allowNull: false
        },
    },
    {
        schema,
        timestamps: true,
        freezeTableName: true,
        tableName: "production_cost_details"
    },
);

export default ProductionCostDetail;