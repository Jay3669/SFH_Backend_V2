import { DataTypes } from "sequelize";
import { schema, sequelize } from "../config/db.js";
import User from "./user.model.js";

const OperatingExpense = sequelize.define(
    "operating_expenses",
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        expenseDate: {
            type: DataTypes.DATEONLY,
            allowNull: false
        },
        category: {
            type: DataTypes.STRING(60),
            allowNull: false
        },
        description: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        amount: {
            type: DataTypes.DECIMAL(14, 2),
            allowNull: false
        },
        createdBy: {
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
        tableName: "operating_expenses",
        indexes: [{ name: "operating_expenses_date_idx", fields: ["expenseDate"] }],
    },
);

export default OperatingExpense;