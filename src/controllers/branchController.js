import { Op } from 'sequelize';
import Branch from '../models/branch.model.js';
import {
    MenuCategory,
    MenuItem,
    OperatingExpense,
    ProductionCancellation,
    ProductionCostDetail,
    ProductionDay,
    ProductionDayItem,
    ProductionIngredient,
    ProductionRecord,
    ProductionRecovery,
    ProductionSale,
    ProductionSaleItem,
    Recipe,
    RecipeIngredient,
    RecipeVersion,
    StaffActivityLog,
    StaffProfile,
    StaffRoleAssignment,
    StockCategory,
    StockItem,
    StockMovement,
    ProfitShareCalculation,
    ProfitShareCalculationDetail,
    ProfitShareApproval,
    ProfitShareAdjustment,
    ProfitSharePayment,
    ProfitSharePaymentDetail,
} from '../models/index.js';
import User from '../models/user.model.js';
import { BAD_REQUEST, CONFLICT, CREATED, NOT_FOUND, OPERATION_SUCCESS } from '../function/response.js';
import { validateBranchInput } from '../validators/branchValidator.js';

const invalid = (res, message) => res.status(400).json(BAD_REQUEST(message));
const branchNameConflict = (res) => res.status(409).json(CONFLICT(
    'A branch with that name already exists.',
    { code: 'BRANCH_NAME_EXISTS' },
));

const branchModels = [
    MenuCategory, MenuItem, OperatingExpense, ProductionCancellation, ProductionCostDetail,
    ProductionDay, ProductionDayItem, ProductionIngredient, ProductionRecord, ProductionRecovery,
    ProductionSale, ProductionSaleItem, Recipe, RecipeIngredient, RecipeVersion,
    StaffActivityLog, StaffProfile, StaffRoleAssignment, StockCategory, StockItem, StockMovement,
    ProfitShareCalculation, ProfitShareCalculationDetail, ProfitShareApproval, ProfitShareAdjustment,
    ProfitSharePayment, ProfitSharePaymentDetail,
];

export const listBranches = async (req, res, next) => {
    try {
        const branches = req.user.role === 'admin'
            ? await Branch.findAll({ order: [['name', 'ASC']] })
            : await Branch.findAll({ where: { id: req.user.branchId } });
        return res.status(200).json(OPERATION_SUCCESS('Branches loaded.', branches));
    } catch (error) {
        return next(error);
    }
};

export const createBranch = async (req, res, next) => {
    try {
        const { value, error } = validateBranchInput(req.body);
        if (error) return invalid(res, error);
        if (await Branch.findOne({ where: { name: { [Op.iLike]: value.name } } })) {
            return branchNameConflict(res);
        }
        const branch = await Branch.create(value);
        return res.status(201).json(CREATED('Branch created.', branch));
    } catch (error) {
        return next(error);
    }
};

export const updateBranch = async (req, res, next) => {
    try {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.branchId)) {
            return invalid(res, 'branchId must be a valid branch identifier.');
        }
        const { value, error } = validateBranchInput(req.body, true);
        if (error) return invalid(res, error);
        if (!Object.keys(value).length) return invalid(res, 'Provide at least one branch field to update.');
        const branch = await Branch.findByPk(req.params.branchId);
        if (!branch) return res.status(404).json(NOT_FOUND('Branch not found.'));
        if (value.name && await Branch.findOne({
            where: {
                name: { [Op.iLike]: value.name },
                id: { [Op.ne]: branch.id },
            },
        })) {
            return branchNameConflict(res);
        }
        await branch.update(value);
        return res.status(200).json(OPERATION_SUCCESS('Branch updated.', branch));
    } catch (error) {
        return next(error);
    }
};

export const deleteBranch = async (req, res, next) => {
    try {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.branchId)) {
            return invalid(res, 'branchId must be a valid branch identifier.');
        }
        const branch = await Branch.findByPk(req.params.branchId);
        if (!branch) return res.status(404).json(NOT_FOUND('Branch not found.'));

        if (await Branch.count() <= 1) {
            return res.status(409).json(CONFLICT('At least one branch must remain.'));
        }
        const dependentCounts = await Promise.all([
            ...branchModels.map((model) => model.count({ where: { branchId: branch.id } })),
            User.count({ where: { branchId: branch.id } }),
        ]);
        const dependentRecordCount = dependentCounts.reduce((total, count) => total + count, 0);
        if (dependentRecordCount > 0) {
            return res.status(409).json(CONFLICT(
                `This branch has ${dependentRecordCount} dependent record(s) and cannot be deleted.`,
                { code: 'BRANCH_HAS_DEPENDENCIES', dependentRecordCount },
            ));
        }

        await branch.destroy();
        return res.status(200).json(OPERATION_SUCCESS('Branch deleted.', {
            id: branch.id,
            deleted: true,
        }));
    } catch (error) {
        if (error.name === 'SequelizeForeignKeyConstraintError') {
            return res.status(409).json(CONFLICT(
                'This branch has dependent records and cannot be deleted.',
                { code: 'BRANCH_HAS_DEPENDENCIES' },
            ));
        }
        return next(error);
    }
};
