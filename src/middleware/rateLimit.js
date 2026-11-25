import { TOO_MANY_REQUESTS } from '../function/response.js';

export const createRateLimiter = ({ windowMs, max, message }) => {
    const requests = new Map();
    return (req, res, next) => {
        const now = Date.now();
        const key = req.ip || req.socket.remoteAddress || 'unknown';
        let entry = requests.get(key);
        if (!entry || entry.resetAt <= now) {
            entry = { count: 0, resetAt: now + windowMs };
            requests.set(key, entry);
        }
        entry.count += 1;
        if (requests.size > 10000) {
            for (const [address, value] of requests) {
                if (value.resetAt <= now) requests.delete(address);
            }
        }
        if (entry.count > max) {
            res.set('Retry-After', String(Math.max(1, Math.ceil((entry.resetAt - now) / 1000))));
            return res.status(429).json(TOO_MANY_REQUESTS(message));
        }
        return next();
    };
};

export const registrationRateLimit = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Too many registration attempts. Try again later.',
});
export const loginRateLimit = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Too many login attempts. Try again later.',
});
export const challengeRateLimit = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Too many verification attempts. Try again later.',
});
export const refreshRateLimit = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: 'Too many refresh requests. Try again later.',
});