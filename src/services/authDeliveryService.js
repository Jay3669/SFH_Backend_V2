import nodemailer from 'nodemailer';

const deliveryError = (message) => Object.assign(new Error(message), {
    statusCode: 503,
    code: 'DELIVERY_UNAVAILABLE',
});

export const isEmailDeliveryConfigured = () => {
    const port = Number(process.env.SMTP_PORT || 587);
    const hasUser = Boolean(process.env.SMTP_USER);
    const hasPassword = Boolean(process.env.SMTP_PASSWORD);
    return Boolean(process.env.SMTP_HOST && process.env.EMAIL_FROM) &&
        Number.isInteger(port) && port > 0 && port <= 65535 &&
        hasUser === hasPassword;
};

export const sendAuthEmail = async (to, subject, text) => {
    if (!isEmailDeliveryConfigured()) {
        throw deliveryError('Email delivery is not configured.');
    }

    const port = Number(process.env.SMTP_PORT || 587);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw deliveryError('Email delivery is not configured correctly.');
    }
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASSWORD;
    if (Boolean(user) !== Boolean(pass)) {
        throw deliveryError('Email delivery is not configured correctly.');
    }

    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: process.env.SMTP_SECURE === 'true' || port === 465,
        ...(user ? { auth: { user, pass } } : {}),
    });
    await transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to,
        subject,
        text,
    });
};