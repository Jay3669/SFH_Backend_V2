import { DataTypes } from "sequelize";
import { schema, sequelize } from "../config/db.js";
import ProductionRecord from "./productionRecord.model.js";
import User from "./user.model.js";

const ProductionCancellation = sequelize.define(
    "production_cancellations",
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        productionRecordId: {
            type: DataTypes.UUID,
            allowNull: false,
            unique: true,
            references: {
                model: ProductionRecord,
                key: "id"
            },
            onDelete: "RESTRICT",
        },
        reason: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        notes: {
            type: DataTypes.STRING(1000),
            allowNull: true
        },
        cancelledBy: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: User, key: "id" },
            onDelete: "RESTRICT",
        },
        cancelledAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
        },
    },
    {
        schema,
        timestamps: true,
        freezeTableName: true,
        tableName: "production_cancellations"
    },
);

export default ProductionCancellation;