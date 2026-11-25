import bcrypt from 'bcryptjs';
import { Op, Sequelize } from 'sequelize';
import User from '../models/user.model.js';
import { normalizeEmail, normalizePhone } from '../validators/registrationValidator.js';

const PASSWORD_ROUNDS = 12;

export class DuplicateAccountError extends Error {
    constructor() {
        super('An account with this email or phone number already exists.');
        this.name = 'DuplicateAccountError';
    }
}

export const registerUser = async ({ firstName, lastName, email, password, phoneNumber, role }) => {
    const identifiers = [];
    const normalizedEmail = email ? normalizeEmail(email) : null;
    const normalizedPhone = phoneNumber ? normalizePhone(phoneNumber) : null;
    if (normalizedEmail) {
        identifiers.push(Sequelize.where(
            Sequelize.fn('lower', Sequelize.col('email')),
            normalizedEmail,
        ));
    }
    if (normalizedPhone) {
        identifiers.push(Sequelize.where(
            Sequelize.fn('regexp_replace', Sequelize.col('phoneNumber'), '[^0-9]', '', 'g'),
            normalizedPhone,
        ));
    }

    const existing = await User.findOne({
        where: { [Op.or]: identifiers },
        attributes: ['id'],
    });
    if (existing) throw new DuplicateAccountError();

    return User.create({
        firstName,
        lastName,
        email: normalizedEmail,
        passwordHash: await bcrypt.hash(password, PASSWORD_ROUNDS),
        phoneNumber: normalizedPhone,
        role,
    });
};
