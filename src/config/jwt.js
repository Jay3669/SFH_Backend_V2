import jwt from 'jsonwebtoken';

export const getAccessTokenExpiresIn = () =>
    process.env.JWT_ACCESS_EXPIRES_IN || process.env.JWT_ACCESS_TTL || '8h';

export const signAccessToken = (payload, secret, expiresIn = getAccessTokenExpiresIn()) =>
    jwt.sign(payload, secret, {
        expiresIn,
        issuer: 'sfh-api',
        audience: 'sfh-client',
    });
