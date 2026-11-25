import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { getAccessTokenExpiresIn, signAccessToken } from '../src/config/jwt.js';

test('uses the configured eight-hour access lifetime for every role token', () => {
    const previousConfigured = process.env.JWT_ACCESS_EXPIRES_IN;
    const previousLegacy = process.env.JWT_ACCESS_TTL;
    process.env.JWT_ACCESS_EXPIRES_IN = '8h';
    delete process.env.JWT_ACCESS_TTL;

    try {
        const secret = 'test-access-token-secret-at-least-32-bytes';
        for (const role of ['admin', 'manager', 'employee', 'customer']) {
            const token = signAccessToken({ role }, secret);
            const claims = jwt.verify(token, secret, {
                issuer: 'sfh-api',
                audience: 'sfh-client',
            });
            assert.equal(claims.exp - claims.iat, 28_800);
            assert.equal(claims.role, role);
            assert.doesNotThrow(() => jwt.verify(token, secret, {
                issuer: 'sfh-api',
                audience: 'sfh-client',
                clockTimestamp: claims.iat + 900,
            }));
            assert.throws(() => jwt.verify(token, secret, {
                issuer: 'sfh-api',
                audience: 'sfh-client',
                clockTimestamp: claims.iat + 28_800,
            }), (error) => error.name === 'TokenExpiredError');
        }
        assert.equal(getAccessTokenExpiresIn(), '8h');
    } finally {
        if (previousConfigured === undefined) delete process.env.JWT_ACCESS_EXPIRES_IN;
        else process.env.JWT_ACCESS_EXPIRES_IN = previousConfigured;
        if (previousLegacy === undefined) delete process.env.JWT_ACCESS_TTL;
        else process.env.JWT_ACCESS_TTL = previousLegacy;
    }
});

test('defaults to eight hours and supports the legacy access TTL name', () => {
    const previousConfigured = process.env.JWT_ACCESS_EXPIRES_IN;
    const previousLegacy = process.env.JWT_ACCESS_TTL;
    try {
        delete process.env.JWT_ACCESS_EXPIRES_IN;
        delete process.env.JWT_ACCESS_TTL;
        assert.equal(getAccessTokenExpiresIn(), '8h');

        process.env.JWT_ACCESS_TTL = '480m';
        assert.equal(getAccessTokenExpiresIn(), '480m');
    } finally {
        if (previousConfigured === undefined) delete process.env.JWT_ACCESS_EXPIRES_IN;
        else process.env.JWT_ACCESS_EXPIRES_IN = previousConfigured;
        if (previousLegacy === undefined) delete process.env.JWT_ACCESS_TTL;
        else process.env.JWT_ACCESS_TTL = previousLegacy;
    }
});
