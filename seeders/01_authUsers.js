import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import User from '../src/models/user.model.js';
import { Customer } from '../src/models/customer.model.js';
import { StaffProfile } from '../src/models/staffProfile.model.js';
import { Role, Permission, RolePermission, AuthAuditLog } from '../src/models/auth.model.js';

const firstNames = ['Aarav','Vivaan','Aditya','Vihaan','Arjun','Sai','Krishna','Ishaan','Kabir','Rohan','Ananya','Diya','Saanvi','Aadhya','Kiara','Myra','Ira','Navya','Pari','Avni','Nisha','Pooja','Rahul','Siddharth','Kavya','Meera','Tanvi','Riya','Neha','Sneha','Arnav','Dhruv','Manav','Reyansh','Dev','Yash','Amit','Raj','Vikram','Harish','Lakshmi','Radha','Kiran','Priya','Sunita','Deepak','Nitin','Mohit','Shreya','Shalini'];
const lastNames = ['Sharma','Verma','Iyer','Reddy','Kumar','Patel','Naidu','Nair','Gupta','Singh','Joshi','Mehta','Kapoor','Das','Bhat','Rao','Pillai','Menon','Chopra','Malhotra'];

export async function seedAuthUsers(transaction) {
    const roleRows = [
        ['admin','Admin'], ['manager','Manager'], ['cashier','Cashier'], ['employee','Employee'], ['customer','Customer'],
    ];
    for (const [id,name] of roleRows) await Role.findOrCreate({ where: { id }, defaults: { id, name }, transaction });

    const permissions = [
        ['customers:read','Read customers'], ['customers:create','Create customers'], ['customers:update','Update customers'],
        ['notifications:read','Read notifications'], ['notifications:create','Create notifications'],
        ['stock:read','Read stock'], ['stock:create','Create stock'], ['stock:update','Update stock'],
        ['menu:read','Read menu'], ['menu:update','Update menu'], ['production:read','Read production'],
        ['production:create','Create production'], ['billing:create','Create bills'], ['billing:read','Read bills'],
    ];
    for (const [id,description] of permissions) await Permission.findOrCreate({ where: { id }, defaults: { id, description }, transaction });
    for (const role of ['admin','manager']) {
        for (const [permissionId] of permissions) await RolePermission.findOrCreate({ where: { roleId: role, permissionId }, defaults: { roleId: role, permissionId }, transaction });
    }

    const passwordHash = await bcrypt.hash('Qa!123456', 12);
    let usersCreated = 0;
    let customersCreated = 0;
    let staffCreated = 0;

    for (let i = 0; i < 50; i += 1) {
        const firstName = firstNames[i];
        const lastName = lastNames[i % lastNames.length];
        const role = i === 0 ? 'admin' : i < 5 ? 'manager' : i < 15 ? 'cashier' : i < 40 ? 'employee' : 'customer';
        const email = `qa.real.${String(i + 1).padStart(2,'0')}@suryafodh.example`;
        const phoneNumber = `98${String(10000000 + i).padStart(8,'0')}`;
        const [user, created] = await User.findOrCreate({
            where: { email },
            defaults: { firstName, lastName, email, passwordHash, phoneNumber, role, isActive: true, status: 'active', isVerified: true, emailVerifiedAt: new Date(), phoneVerifiedAt: new Date(), isSubscribed: i % 3 === 0 },
            transaction,
        });
        if (created) usersCreated += 1;

        if (role !== 'customer') {
            const [profile, profileCreated] = await StaffProfile.findOrCreate({
                where: { userId: user.id },
                defaults: {
                    userId: user.id, address: `${100 + i}, Indiranagar, Bengaluru, Karnataka`,
                    department: role === 'manager' ? 'Operations' : role === 'cashier' ? 'Billing' : 'Restaurant Operations',
                    designation: role === 'manager' ? 'Restaurant Manager' : role === 'cashier' ? 'Cashier' : 'Kitchen Associate',
                    joiningDate: `202${4 - (i % 3)}-${String((i % 12) + 1).padStart(2,'0')}-${String((i % 27) + 1).padStart(2,'0')}`,
                    salary: role === 'manager' ? 45000 : role === 'cashier' ? 25000 : 22000,
                    employmentStatus: 'active', createdBy: user.id,
                },
                transaction,
            });
            if (profileCreated) staffCreated += 1;
        } else {
            const [customer, customerCreated] = await Customer.findOrCreate({
                where: { phoneNumber },
                defaults: {
                    userId: user.id, fullName: `${firstName} ${lastName}`, email,
                    phoneNumber, address: `${200 + i}, JP Nagar, Bengaluru, Karnataka`,
                    dateOfBirth: `199${i % 10}-${String((i % 12) + 1).padStart(2,'0')}-${String((i % 27) + 1).padStart(2,'0')}`,
                    status: 'active', totalPurchases: 0, totalSpending: 0,
                },
                transaction,
            });
            if (customerCreated) customersCreated += 1;
        }
    }

    let authAuditLogsCreated = 0;
    for (let i = 0; i < 50; i += 1) {
        const user = await User.findOne({ where: { email: `qa.real.${String(i + 1).padStart(2,'0')}@suryafodh.example` }, transaction });
        const [,created] = await AuthAuditLog.findOrCreate({
            where: { action: 'QA_REAL_DATA', details: { fixtureIndex: i + 1 } },
            defaults: { actorUserId: user?.id, subjectUserId: user?.id, action: 'QA_REAL_DATA', ipAddress: `10.20.30.${(i % 250) + 1}`, details: { fixtureIndex: i + 1, source: 'realistic-seeder' } },
            transaction,
        });
        if (created) authAuditLogsCreated += 1;
    }

    for (let i = 0; i < 50; i += 1) {
        const firstName = firstNames[(i + 13) % firstNames.length];
        const lastName = lastNames[(i + 7) % lastNames.length];
        const phoneNumber = `97${String(20000000 + i).padStart(8,'0')}`;
        const email = i < 10 ? `qa.real.${String(i + 1).padStart(2,'0')}@suryafodh.example` : `qa.customer.${String(i + 1).padStart(2,'0')}@suryafodh.example`;
        const [customer,created] = await Customer.findOrCreate({
            where:{ phoneNumber },
            defaults:{
                fullName:`${firstName} ${lastName}`,email,phoneNumber,
                address:`${300+i}, Koramangala, Bengaluru, Karnataka`,
                dateOfBirth:`198${i%10}-${String((i%12)+1).padStart(2,'0')}-${String((i%27)+1).padStart(2,'0')}`,
                status:'active',totalPurchases:2+(i%8),totalSpending:900+(i%15)*420,
            }, transaction,
        });
        if (created) customersCreated+=1;
    }

    return { usersCreated, customersCreated, staffCreated, authAuditLogsCreated };
}
