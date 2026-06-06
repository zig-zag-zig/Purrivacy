import { createRateLimiter } from '../rate-limit/createRateLimiter';
import { rateLimitKeys } from '../rate-limit/rateLimitKeys';

const MINUTE = 60 * 1000;

export const rateLimiter = {
    mfaVerification: createRateLimiter({
        name: 'mfaVerification',
        windowMs: 15 * MINUTE,
        maxRequests: 5,
        keyGenerator: rateLimitKeys.byUser(true),
        skipSuccessfulRequests: true,
        message: 'Too many MFA verification attempts. Please try again later.',
    }),

    authentication: createRateLimiter({
        name: 'authentication',
        windowMs: 60 * MINUTE,
        maxRequests: 10,
        keyGenerator: rateLimitKeys.byUsername(),
        message: 'Too many authentication attempts. Please try again later.',
    }),

    general: createRateLimiter({
        name: 'general',
        windowMs: 15 * MINUTE,
        maxRequests: 100,
        message: 'Too many requests. Please slow down.',
    }),

    authenticatedRead: createRateLimiter({
        name: 'authenticatedRead',
        windowMs: 15 * MINUTE,
        maxRequests: 120,
        keyGenerator: rateLimitKeys.byUser(),
        message: 'Too many requests. Please slow down.',
    }),

    authenticatedWrite: createRateLimiter({
        name: 'authenticatedWrite',
        windowMs: 15 * MINUTE,
        maxRequests: 30,
        keyGenerator: rateLimitKeys.byUser(),
        message: 'Too many updates. Please slow down.',
    }),

    sessionCreation: createRateLimiter({
        name: 'sessionCreation',
        windowMs: 15 * MINUTE,
        maxRequests: 5,
        keyGenerator: rateLimitKeys.byUser(),
        skipSuccessfulRequests: true,
        skipResponse: (_req, res) => {
            const details = res.locals.errorDetails;
            return res.statusCode === 403 && details?.mfaRequired === true && details?.wrongMfaCode !== true;
        },
        message: 'Too many login attempts. Please try again later.',
    }),

    sessionCreationIp: createRateLimiter({
        name: 'sessionCreationIp',
        windowMs: 15 * MINUTE,
        maxRequests: 30,
        message: 'Too many login attempts. Please try again later.',
    }),

    sessionRefresh: createRateLimiter({
        name: 'sessionRefresh',
        windowMs: 15 * MINUTE,
        maxRequests: 20,
        keyGenerator: rateLimitKeys.byRefreshToken(),
        skipSuccessfulRequests: true,
        message: 'Too many session refresh attempts. Please try again later.',
    }),

    sensitiveOperations: createRateLimiter({
        name: 'sensitiveOperations',
        windowMs: 15 * MINUTE,
        maxRequests: 5,
        keyGenerator: rateLimitKeys.byUser(true),
        message: 'Too many sensitive operations. Please try again later.',
    }),

    create: createRateLimiter,
};
