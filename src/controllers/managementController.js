import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import User, { STAFF_ROLES, USER_ROLES } from '../models/user.model.js';
import { StaffProfile } from '../models/staffProfile.model.js';
import { Customer } from '../models/customer.model.js';
import { Notification, NotificationRecipient } from '../models/notification.model.js';
import { Permission, Role, RolePermission, UserPermission } from '../models/auth.model.js';
import { StaffRoleAssignment } from '../models/profitSharing.model.js';
import { BAD_REQUEST, CREATED, NOT_FOUND, OPERATION_SUCCESS } from '../function/response.js';
import database from '../config/database.js';
import { QueryTypes } from 'sequelize';
import { validatePrivilegedRegistration } from '../validators/registrationValidator.js';

const notFound = (res, message) => res.status(404).json(NOT_FOUND(message));

export const getStaffDashboardSummary = async (req, res, next) => {
    try {
        const today = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).format(new Date()).replace(/\//g, '-');
        const [summary] = await database.sequelize.query(`
            SELECT
                COALESCE(SUM(CASE WHEN "paymentStatus" = 'completed' THEN "totalAmount" ELSE 0 END), 0)::numeric AS "todaySales",
                COUNT(*)::integer AS "todayBills",
                COALESCE(SUM(CASE WHEN "paymentStatus" = 'completed' AND "paymentMethod" = 'cash' THEN "totalAmount" ELSE 0 END), 0)::numeric AS "cashCollection",
                COALESCE(SUM(CASE WHEN "paymentStatus" = 'completed' AND "paymentMethod" = 'upi' THEN "totalAmount" ELSE 0 END), 0)::numeric AS "upiCollection",
                COALESCE(SUM(CASE WHEN "paymentStatus" = 'completed' AND "paymentMethod" = 'card' THEN "totalAmount" ELSE 0 END), 0)::numeric AS "cardCollection"
            FROM "public"."production_sales"
            WHERE "productionDate" = $1
        `, { bind: [today], type: QueryTypes.SELECT });
        const [customerCount, expenseRow, stockRow] = await Promise.all([
            Customer.count({ where: { status: 'active' } }),
            database.sequelize.query(`
                SELECT COALESCE(SUM("amount"), 0)::numeric AS "todayExpenses"
                FROM "public"."operating_expenses" WHERE "expenseDate" = $1
            `, { bind: [today], type: QueryTypes.SELECT }),
            database.sequelize.query(`
                SELECT COUNT(*)::integer AS "lowStock"
                FROM "public"."stock_items"
                WHERE "isActive" = true AND "quantity" <= "reorderLevel"
            `, { type: QueryTypes.SELECT }),
        ]);
        return res.status(200).json(OPERATION_SUCCESS('Dashboard summary loaded.', {
            date: today,
            totalSalesToday: Number(summary.todaySales),
            totalBillsToday: summary.todayBills,
            totalCustomers: customerCount,
            cashCollection: Number(summary.cashCollection),
            upiCollection: Number(summary.upiCollection),
            cardCollection: Number(summary.cardCollection),
            totalExpensesToday: Number(expenseRow[0]?.todayExpenses || 0),
            lowStockAlerts: stockRow[0]?.lowStock || 0,
            estimatedProfit: Number(summary.todaySales) - Number(expenseRow[0]?.todayExpenses || 0),
        }));
    } catch (error) { return next(error); }
};

export const getCustomerPurchaseHistory = async (req, res, next) => {
    try {
        const sales = await database.sequelize.query(`
            SELECT s."id", s."reference", s."productionDate", s."subtotal",
                   s."discountAmount", s."taxAmount", s."packingCharge",
                   s."totalAmount", s."paymentMethod", s."paymentStatus", s."createdAt",
                   COALESCE(json_agg(json_build_object(
                       'menuItemName', i."menuItemName",
                       'quantity', i."quantity",
                       'unitPrice', i."unitPrice",
                       'totalPrice', i."totalPrice"
                   )) FILTER (WHERE i."id" IS NOT NULL), '[]') AS "items"
            FROM "public"."production_sales" s
            LEFT JOIN "public"."production_sale_items" i ON i."saleId" = s."id"
            WHERE s."customerId" = $1
            GROUP BY s."id"
            ORDER BY s."createdAt" DESC
        `, { bind: [req.params.customerId], type: QueryTypes.SELECT });
        return res.status(200).json(OPERATION_SUCCESS('Customer purchase history loaded.', sales));
    } catch (error) { return next(error); }
};

export const listUsers = async (req, res, next) => {
    try {
        const users = await User.findAll({
            where: req.query.role ? { role: req.query.role } : undefined,
            attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber', 'role', 'status', 'isActive', 'createdAt', 'updatedAt'],
            order: [['createdAt', 'DESC']],
        });
        return res.status(200).json(OPERATION_SUCCESS('Users retrieved.', users));
    } catch (error) { return next(error); }
};

export const getUser = async (req, res, next) => {
    try {
        const user = await User.findByPk(req.params.userId, {
            attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber', 'role', 'status', 'isActive', 'createdAt', 'updatedAt'],
        });
        if (!user) return notFound(res, 'User not found.');
        return res.status(200).json(OPERATION_SUCCESS('User retrieved.', user));
    } catch (error) { return next(error); }
};

export const updateUser = async (req, res, next) => {
    try {
        const user = await User.findByPk(req.params.userId);
        if (!user) return notFound(res, 'User not found.');
        const allowed = ['firstName', 'lastName', 'email', 'phoneNumber', 'role', 'status', 'isActive'];
        const changes = Object.fromEntries(Object.entries(req.body || {}).filter(([key]) => allowed.includes(key)));
        if (changes.role && !Object.values(USER_ROLES).includes(changes.role)) {
            return res.status(400).json(BAD_REQUEST('Unsupported role.'));
        }
        await user.update(changes);
        return res.status(200).json(OPERATION_SUCCESS('User updated.', user));
    } catch (error) { return next(error); }
};

export const deactivateUser = async (req, res, next) => {
    try {
        const user = await User.findByPk(req.params.userId);
        if (!user) return notFound(res, 'User not found.');
        await user.update({ isActive: false, status: 'inactive' });
        return res.status(200).json(OPERATION_SUCCESS('User deactivated.', { id: user.id }));
    } catch (error) { return next(error); }
};

export const setUserPermission = async (req, res, next) => {
    try {
        const { permissionId, granted } = req.body || {};
        if (!permissionId || typeof granted !== 'boolean') return res.status(400).json(BAD_REQUEST('permissionId and granted are required.'));
        if (!await Permission.findByPk(permissionId)) return notFound(res, 'Permission not found.');
        await UserPermission.upsert({ userId: req.params.userId, permissionId, granted });
        return res.status(200).json(OPERATION_SUCCESS('User permission updated.'));
    } catch (error) { return next(error); }
};

export const listRolesPermissions = async (req, res, next) => {
    try {
        const [permissions, assignments] = await Promise.all([
            Permission.findAll({ order: [['id', 'ASC']] }),
            RolePermission.findAll({ order: [['roleId', 'ASC'], ['permissionId', 'ASC']] }),
        ]);
        return res.status(200).json(OPERATION_SUCCESS('Role permissions retrieved.', { permissions, assignments }));
    } catch (error) { return next(error); }
};

export const setRolePermission = async (req, res, next) => {
    try {
        const { roleId, permissionId, enabled } = req.body || {};
        if (roleId === 'admin') return res.status(400).json(BAD_REQUEST('Admin permissions cannot be revoked.'));
        if (!roleId || !permissionId || typeof enabled !== 'boolean') return res.status(400).json(BAD_REQUEST('roleId, permissionId and enabled are required.'));
        if (enabled) await RolePermission.findOrCreate({ where: { roleId, permissionId } });
        else await RolePermission.destroy({ where: { roleId, permissionId } });
        return res.status(200).json(OPERATION_SUCCESS('Role permission updated.'));
    } catch (error) { return next(error); }
};

export const listStaff = async (req, res, next) => {
    try {
        const q = String(req.query.q || '').trim();
        const role = String(req.query.role || '').trim();
        const status = String(req.query.status || '').trim();
        const roleWhere = role && [...STAFF_ROLES].includes(role) ? { role } : undefined;
        let assignmentUserIds;
        if (role && roleWhere) {
            const matchingAssignments = await StaffRoleAssignment.findAll({
                where: { roleId: role, status: 'active' },
                attributes: ['staffId'],
            });
            assignmentUserIds = [...new Set(matchingAssignments.map((assignment) => assignment.staffId))];
        }
        const users = await User.findAll({
            where: {
                ...(role && roleWhere
                    ? {
                        [Op.or]: [
                            { role },
                            { id: { [Op.in]: assignmentUserIds || [] } },
                        ],
                    }
                    : role
                        ? { id: { [Op.in]: [] } }
                        : { role: { [Op.in]: [...STAFF_ROLES] } }),
                ...(q ? { [Op.or]: [
                    { firstName: { [Op.iLike]: `%${q}%` } },
                    { lastName: { [Op.iLike]: `%${q}%` } },
                    { email: { [Op.iLike]: `%${q}%` } },
                    { phoneNumber: { [Op.iLike]: `%${q}%` } },
                ] } : {}),
            },
            order: [['createdAt', 'DESC']],
        });
        const profiles = await StaffProfile.findAll({
            where: { userId: { [Op.in]: users.map((user) => user.id) } },
        });
        const assignments = await StaffRoleAssignment.findAll({
            where: {
                staffId: { [Op.in]: users.map((user) => user.id) },
                status: 'active',
            },
            order: [['effectiveFrom', 'ASC'], ['createdAt', 'ASC']],
        });
        const profileByUser = new Map(profiles.map((profile) => [profile.userId, profile]));
        const assignmentsByUser = new Map();
        for (const assignment of assignments) {
            const values = assignmentsByUser.get(assignment.staffId) || [];
            values.push(assignment.toJSON());
            assignmentsByUser.set(assignment.staffId, values);
        }
        let data = users.map((user) => {
            const roleAssignments = assignmentsByUser.get(user.id) || [];
            return {
                ...user.toJSON(),
                profile: profileByUser.get(user.id)?.toJSON() || null,
                roles: roleAssignments,
                roleAssignments,
            };
        });
        if (status === 'active') data = data.filter((item) => item.isActive && item.profile?.employmentStatus !== 'inactive' && item.profile?.employmentStatus !== 'on_leave');
        if (status === 'on_leave') data = data.filter((item) => item.profile?.employmentStatus === 'on_leave');
        if (status === 'inactive') data = data.filter((item) => !item.isActive || item.profile?.employmentStatus === 'inactive');
        if (q) {
            const needle = q.toLowerCase();
            data = data.filter((item) => [
                item.firstName, item.lastName, item.email, item.phoneNumber,
                item.profile?.employeeId, item.profile?.department, item.profile?.designation,
            ].some((value) => typeof value === 'string' && value.toLowerCase().includes(needle)));
        }
        return res.status(200).json(OPERATION_SUCCESS('Staff retrieved.', data));
    } catch (error) { return next(error); }
};

export const getStaffById = async (req, res, next) => {
    try {
        const user = await User.findByPk(req.params.userId);
        if (!user || !STAFF_ROLES.includes(user.role)) return notFound(res, 'Staff account not found.');
        const profile = await StaffProfile.findOne({ where: { userId: user.id } });
        const roleAssignments = await StaffRoleAssignment.findAll({
            where: { staffId: user.id, status: 'active' },
            order: [['effectiveFrom', 'ASC'], ['createdAt', 'ASC']],
        });
        const roles = roleAssignments.map((assignment) => assignment.toJSON());
        return res.status(200).json(OPERATION_SUCCESS('Staff retrieved.', {
            ...user.toJSON(),
            profile: profile?.toJSON() || null,
            roles,
            roleAssignments: roles,
        }));
    } catch (error) { return next(error); }
};

export const createStaff = async (req, res, next) => {
    try {
        const validation = validatePrivilegedRegistration(req.body, [...STAFF_ROLES]);
        if (validation.error) return res.status(400).json(BAD_REQUEST(validation.error));
        const { firstName, lastName, email, phoneNumber, password, role } = validation.value;
        const body = req.body || {};
        const rawRoles = body.roles ?? body.roleAssignments;
        let roleAssignments = [];
        if (rawRoles !== undefined) {
            if (!Array.isArray(rawRoles) || rawRoles.length === 0) {
                return res.status(400).json(BAD_REQUEST('roles must contain at least one role.'));
            }
            const seen = new Set();
            for (const item of rawRoles) {
                const roleId = typeof item === 'string' ? item : item?.roleId;
                const customProfitPercentage = typeof item === 'object' && item !== null
                    ? item.customProfitPercentage
                    : undefined;
                if (!STAFF_ROLES.includes(roleId) || seen.has(roleId)) {
                    return res.status(400).json(BAD_REQUEST('roles must contain unique supported staff roles.'));
                }
                if (customProfitPercentage !== undefined && customProfitPercentage !== null) {
                    const percentage = Number(customProfitPercentage);
                    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
                        return res.status(400).json(BAD_REQUEST('customProfitPercentage must be between 0 and 100.'));
                    }
                    seen.add(roleId);
                    roleAssignments.push({ roleId, customProfitPercentage: percentage });
                } else {
                    seen.add(roleId);
                    roleAssignments.push({ roleId, customProfitPercentage: null });
                }
            }
        } else {
            roleAssignments = [{ roleId: role, customProfitPercentage: null }];
        }
        if (!roleAssignments.some((assignment) => assignment.roleId === role)) {
            roleAssignments.unshift({ roleId: role, customProfitPercentage: null });
        }
        const roleRecords = await Role.findAll({
            where: { id: { [Op.in]: roleAssignments.map((assignment) => assignment.roleId) } },
            attributes: ['id'],
        });
        if (roleRecords.length !== roleAssignments.length) {
            return res.status(400).json(BAD_REQUEST('One or more selected roles are not configured.'));
        }
        const allowedProfileFields = [
            'address', 'department', 'designation', 'joiningDate', 'salary', 'employmentStatus',
            'profileImage', 'employeeId', 'emergencyContact', 'gender', 'dateOfBirth',
            'alternatePhone', 'employmentType',
        ];
        const profile = Object.fromEntries(Object.entries(body).filter(([key]) => allowedProfileFields.includes(key)));
        if (profile.employeeId) {
            const duplicateEmployee = await StaffProfile.findOne({ where: { employeeId: String(profile.employeeId).trim() } });
            if (duplicateEmployee) return res.status(409).json(BAD_REQUEST('An employee with this staff ID already exists.'));
            profile.employeeId = String(profile.employeeId).trim();
        }
        if (profile.employmentStatus && !['active', 'on_leave', 'inactive'].includes(profile.employmentStatus)) {
            return res.status(400).json(BAD_REQUEST('employmentStatus must be active, on_leave, or inactive.'));
        }
        if (profile.joiningDate && !/^\d{4}-\d{2}-\d{2}$/.test(profile.joiningDate)) {
            return res.status(400).json(BAD_REQUEST('joiningDate must be YYYY-MM-DD.'));
        }
        if (profile.salary !== undefined && (!Number.isFinite(Number(profile.salary)) || Number(profile.salary) < 0)) {
            return res.status(400).json(BAD_REQUEST('salary must be a non-negative number.'));
        }
        const existing = await User.findOne({ where: { [Op.or]: [
            ...(email ? [{ email }] : []), ...(phoneNumber ? [{ phoneNumber }] : []),
        ] } });
        if (existing) return res.status(409).json(BAD_REQUEST('A user with this email or phone already exists.'));
        const employmentStatus = profile.employmentStatus || 'active';
        const isInactive = employmentStatus === 'inactive';
        const user = await database.sequelize.transaction(async (transaction) => {
            const created = await User.create({
                firstName, lastName, email: email || null, phoneNumber: phoneNumber || null,
                passwordHash: await bcrypt.hash(password, 12), role,
                status: isInactive ? 'inactive' : 'active',
                isActive: !isInactive,
            }, { transaction });
            await StaffProfile.create({
                ...profile,
                salary: profile.salary === undefined ? null : Number(profile.salary),
                employmentStatus,
                userId: created.id,
                createdBy: req.user.id,
            }, { transaction });
            const effectiveFrom = profile.joiningDate || new Date().toISOString().slice(0, 10);
            await StaffRoleAssignment.bulkCreate(roleAssignments.map((assignment) => ({
                staffId: created.id,
                roleId: assignment.roleId,
                customProfitPercentage: assignment.customProfitPercentage,
                effectiveFrom,
                effectiveTo: null,
                status: 'active',
                createdBy: req.user.id,
                updatedBy: req.user.id,
            })), { transaction, ignoreDuplicates: true });
            return created;
        });
        const createdProfile = await StaffProfile.findOne({ where: { userId: user.id } });
        const createdAssignments = await StaffRoleAssignment.findAll({
            where: { staffId: user.id, status: 'active' },
            order: [['effectiveFrom', 'ASC'], ['createdAt', 'ASC']],
        });
        const roles = createdAssignments.map((assignment) => assignment.toJSON());
        return res.status(201).json(CREATED('Staff created.', {
            ...user.toJSON(),
            profile: createdProfile?.toJSON() || null,
            roles,
            roleAssignments: roles,
        }));
    } catch (error) { return next(error); }
};

export const updateStaff = async (req, res, next) => {
    try {
        const user = await User.findByPk(req.params.userId);
        if (!user || !STAFF_ROLES.includes(user.role)) return notFound(res, 'Staff account not found.');
        const { address, department, designation, joiningDate, salary, employmentStatus, profileImage,
            employeeId, emergencyContact, gender, dateOfBirth, alternatePhone, employmentType,
            firstName, lastName, role } = req.body || {};
        if (role && !STAFF_ROLES.includes(role)) return res.status(400).json(BAD_REQUEST('Unsupported staff role.'));
        if (firstName !== undefined && (typeof firstName !== 'string' || !firstName.trim())) {
            return res.status(400).json(BAD_REQUEST('firstName is required.'));
        }
        if (lastName !== undefined && (typeof lastName !== 'string' || !lastName.trim())) {
            return res.status(400).json(BAD_REQUEST('lastName is required.'));
        }
        if (employmentStatus && !['active', 'on_leave', 'inactive'].includes(employmentStatus)) {
            return res.status(400).json(BAD_REQUEST('employmentStatus must be active, on_leave, or inactive.'));
        }
        if (joiningDate && !/^\d{4}-\d{2}-\d{2}$/.test(joiningDate)) {
            return res.status(400).json(BAD_REQUEST('joiningDate must be YYYY-MM-DD.'));
        }
        if (salary !== undefined && (!Number.isFinite(Number(salary)) || Number(salary) < 0)) {
            return res.status(400).json(BAD_REQUEST('salary must be a non-negative number.'));
        }
        if (employeeId) {
            const existing = await StaffProfile.findOne({ where: { employeeId: String(employeeId).trim(), userId: { [Op.ne]: user.id } } });
            if (existing) return res.status(409).json(BAD_REQUEST('An employee with this staff ID already exists.'));
        }
        await database.sequelize.transaction(async (transaction) => {
            const userChanges = {
                ...(firstName !== undefined && { firstName: String(firstName).trim() }),
                ...(lastName !== undefined && { lastName: String(lastName).trim() }),
                ...(role && { role }),
                ...(employmentStatus === 'inactive' && { isActive: false, status: 'inactive' }),
                ...((employmentStatus === 'active' || employmentStatus === 'on_leave') && { isActive: true, status: 'active' }),
            };
            await user.update(userChanges, { transaction });
            const profile = await StaffProfile.findOne({ where: { userId: user.id }, transaction });
            const profileChanges = {
                address, department, designation, joiningDate,
                salary: salary === undefined ? undefined : Number(salary),
                employmentStatus, profileImage, employeeId, emergencyContact, gender, dateOfBirth,
                alternatePhone, employmentType,
            };
            if (profile) await profile.update(Object.fromEntries(Object.entries(profileChanges).filter(([, value]) => value !== undefined)), { transaction });
            else await StaffProfile.create({ ...Object.fromEntries(Object.entries(profileChanges).filter(([, value]) => value !== undefined)), userId: user.id, createdBy: req.user.id }, { transaction });
        });
        return res.status(200).json(OPERATION_SUCCESS('Staff updated.'));
    } catch (error) { return next(error); }
};

export const deleteStaff = async (req, res, next) => {
    try {
        const user = await User.findByPk(req.params.userId);
        if (!user) return notFound(res, 'Staff account not found.');
        await user.update({ isActive: false, status: 'inactive' });
        await StaffProfile.update({ employmentStatus: 'inactive' }, { where: { userId: user.id } });
        return res.status(200).json(OPERATION_SUCCESS('Staff deactivated.'));
    } catch (error) { return next(error); }
};

export const listCustomers = async (req, res, next) => {
    try {
        const q = String(req.query.q || '').trim();
        const where = q ? { [Op.or]: [
            { fullName: { [Op.iLike]: `%${q}%` } },
            { email: { [Op.iLike]: `%${q}%` } },
            { phoneNumber: { [Op.iLike]: `%${q}%` } },
        ] } : undefined;
        const customers = await Customer.findAll({ where, order: [['createdAt', 'DESC']] });
        return res.status(200).json(OPERATION_SUCCESS('Customers retrieved.', customers));
    } catch (error) { return next(error); }
};

export const createCustomer = async (req, res, next) => {
    try {
        const { fullName, email, phoneNumber, address, dateOfBirth } = req.body || {};
        if (!fullName || !phoneNumber) return res.status(400).json(BAD_REQUEST('Full name and phone number are required.'));
        const customer = await Customer.create({ fullName, email: email || null, phoneNumber, address: address || null, dateOfBirth: dateOfBirth || null });
        return res.status(201).json(CREATED('Customer created.', customer));
    } catch (error) { return next(error); }
};

export const getCustomer = async (req, res, next) => {
    try {
        const customer = await Customer.findByPk(req.params.customerId);
        if (!customer) return notFound(res, 'Customer not found.');
        return res.status(200).json(OPERATION_SUCCESS('Customer retrieved.', customer));
    } catch (error) { return next(error); }
};

export const updateCustomer = async (req, res, next) => {
    try {
        const customer = await Customer.findByPk(req.params.customerId);
        if (!customer) return notFound(res, 'Customer not found.');
        const allowed = ['fullName', 'email', 'phoneNumber', 'address', 'dateOfBirth', 'status'];
        await customer.update(Object.fromEntries(Object.entries(req.body || {}).filter(([key]) => allowed.includes(key))));
        return res.status(200).json(OPERATION_SUCCESS('Customer updated.', customer));
    } catch (error) { return next(error); }
};

export const deactivateCustomer = async (req, res, next) => {
    try {
        const customer = await Customer.findByPk(req.params.customerId);
        if (!customer) return notFound(res, 'Customer not found.');
        await customer.update({ status: 'inactive' });
        return res.status(200).json(OPERATION_SUCCESS('Customer deactivated.'));
    } catch (error) { return next(error); }
};

export const createNotification = async (req, res, next) => {
    try {
        const { title, message, category = 'general', targetRole, targetUserId } = req.body || {};
        if (!title || !message) return res.status(400).json(BAD_REQUEST('Title and message are required.'));
        const notification = await Notification.create({
            title, message, category, targetRole: targetRole || null,
            targetUserId: targetUserId || null, createdBy: req.user.id,
        });
        let recipients = [];
        if (targetUserId) {
            recipients = [{ notificationId: notification.id, userId: targetUserId }];
        } else if (targetRole) {
            const users = await User.findAll({ where: { role: targetRole, isActive: true }, attributes: ['id'] });
            recipients = users.map((user) => ({ notificationId: notification.id, userId: user.id }));
        } else {
            const users = await User.findAll({ where: { isActive: true }, attributes: ['id'] });
            recipients = users.map((user) => ({ notificationId: notification.id, userId: user.id }));
        }
        if (recipients.length) await NotificationRecipient.bulkCreate(recipients, { ignoreDuplicates: true });
        return res.status(201).json(CREATED('Notification created.', notification));
    } catch (error) { return next(error); }
};

export const listNotifications = async (req, res, next) => {
    try {
        const recipientRows = await NotificationRecipient.findAll({
            where: { userId: req.user.id },
            include: undefined,
            order: [['createdAt', 'DESC']],
        });
        const notificationIds = recipientRows.map((row) => row.notificationId);
        const notifications = await Notification.findAll({
            where: notificationIds.length ? { id: { [Op.in]: notificationIds } } : { id: null },
            order: [['createdAt', 'DESC']],
        });
        const readById = new Map(recipientRows.map((row) => [row.notificationId, row.readAt]));
        const data = notifications.map((item) => ({ ...item.toJSON(), readAt: readById.get(item.id) || null }));
        return res.status(200).json(OPERATION_SUCCESS('Notifications retrieved.', data));
    } catch (error) { return next(error); }
};

export const getNotification = async (req, res, next) => {
    try {
        const recipient = await NotificationRecipient.findOne({
            where: { notificationId: req.params.notificationId, userId: req.user.id },
        });
        if (!recipient) return notFound(res, 'Notification not found.');
        const notification = await Notification.findByPk(req.params.notificationId);
        if (!notification) return notFound(res, 'Notification not found.');
        return res.status(200).json(OPERATION_SUCCESS('Notification retrieved.', {
            ...notification.toJSON(),
            readAt: recipient.readAt,
        }));
    } catch (error) { return next(error); }
};

export const updateNotification = async (req, res, next) => {
    try {
        const notification = await Notification.findByPk(req.params.notificationId);
        if (!notification) return notFound(res, 'Notification not found.');
        const allowed = ['title', 'message', 'category', 'targetRole', 'targetUserId'];
        await notification.update(Object.fromEntries(Object.entries(req.body || {}).filter(([key]) => allowed.includes(key))));
        return res.status(200).json(OPERATION_SUCCESS('Notification updated.', notification));
    } catch (error) { return next(error); }
};

export const deleteNotification = async (req, res, next) => {
    try {
        await NotificationRecipient.destroy({ where: { notificationId: req.params.notificationId } });
        const deleted = await Notification.destroy({ where: { id: req.params.notificationId } });
        if (!deleted) return notFound(res, 'Notification not found.');
        return res.status(200).json(OPERATION_SUCCESS('Notification deleted.'));
    } catch (error) { return next(error); }
};

export const setNotificationRead = async (req, res, next) => {
    try {
        const recipient = await NotificationRecipient.findOne({
            where: { notificationId: req.params.notificationId, userId: req.user.id },
        });
        if (!recipient) return notFound(res, 'Notification not found.');
        await recipient.update({ readAt: req.params.action === 'unread' ? null : new Date() });
        return res.status(200).json(OPERATION_SUCCESS(req.params.action === 'unread' ? 'Notification marked unread.' : 'Notification marked read.'));
    } catch (error) { return next(error); }
};

export const markAllNotificationsRead = async (req, res, next) => {
    try {
        await NotificationRecipient.update(
            { readAt: new Date() },
            { where: { userId: req.user.id, readAt: null } },
        );
        return res.status(200).json(OPERATION_SUCCESS('All notifications marked read.'));
    } catch (error) { return next(error); }
};

export const deleteReadNotifications = async (req, res, next) => {
    try {
        await NotificationRecipient.destroy({ where: { userId: req.user.id, readAt: { [Op.not]: null } } });
        return res.status(200).json(OPERATION_SUCCESS('Read notifications deleted.'));
    } catch (error) { return next(error); }
};
