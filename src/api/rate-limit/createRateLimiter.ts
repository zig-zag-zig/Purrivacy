import { Request, Response, NextFunction } from 'express';
import { RateLimitError } from '../../utils/errors';
import { createLogger } from '../../utils/logger';
import { getClientIp } from './clientIp';
import { rateLimitKeys } from './rateLimitKeys';
import { RateLimitConfig, RateLimitEntry } from './rateLimitTypes';

const logger = createLogger('api.rateLimit');

const cleanupExpiredEntries = (store: Map<string, RateLimitEntry>): void => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
        if (entry.resetTime <= now) {
            store.delete(key);
        }
    }
};

const setHeaders = (
    res: Response,
    config: RateLimitConfig,
    entry: RateLimitEntry,
    remaining: number,
): void => {
    res.setHeader('X-RateLimit-Limit', config.maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', Math.max(0, remaining).toString());
    res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetTime / 1000).toString());
    res.setHeader('X-RateLimit-Policy', `${config.maxRequests};w=${config.windowMs / 1000}`);
};

const throwLimitExceeded = (
    req: Request,
    res: Response,
    config: RateLimitConfig,
    entry: RateLimitEntry,
): never => {
    const retryAfter = Math.ceil((entry.resetTime - Date.now()) / 1000);
    logger.warn('rate limit exceeded', {
        requestId: res.locals.requestId,
        limiter: config.name || req.path,
        method: req.method,
        path: req.path,
        ip: getClientIp(req),
        userId: (req as any).userId,
        hasDeviceId: Boolean((req as any).deviceId || req.headers['x-device-id']),
        retryAfter,
        limit: config.maxRequests,
        windowSeconds: config.windowMs / 1000,
    });

    res.setHeader('Retry-After', retryAfter.toString());
    setHeaders(res, config, entry, 0);

    throw new RateLimitError(config.message || 'Too many requests', {
        retryAfter,
        limit: config.maxRequests,
        window: config.windowMs / 1000,
    });
};

const attachResponseAdjustment = (
    req: Request,
    res: Response,
    store: Map<string, RateLimitEntry>,
    key: string,
    config: RateLimitConfig,
    entry: RateLimitEntry,
): void => {
    let adjustedCount = entry.count;
    const originalWriteHead = res.writeHead;

    res.writeHead = function (statusCode: number, headers?: any): any {
        setHeaders(res, config, entry, config.maxRequests - adjustedCount);
        return headers === undefined
            ? originalWriteHead.call(this, statusCode)
            : originalWriteHead.call(this, statusCode, headers);
    };

    res.once('finish', () => {
        const shouldSkip =
            (config.skipSuccessfulRequests && res.statusCode >= 200 && res.statusCode < 300) ||
            config.skipResponse?.(req, res) === true;

        if (!shouldSkip) {
            return;
        }

        const latestEntry = store.get(key);
        if (latestEntry && latestEntry.count > 0) {
            latestEntry.count--;
            adjustedCount = latestEntry.count;
        }
    });
};

export const createRateLimiter = (config: RateLimitConfig) => {
    const store = new Map<string, RateLimitEntry>();
    let cleanupCounter = 0;

    return (req: Request, res: Response, next: NextFunction): void => {
        const key = config.keyGenerator ? config.keyGenerator(req) : rateLimitKeys.default(req);
        const now = Date.now();
        const existingEntry = store.get(key);

        if (existingEntry && existingEntry.resetTime > now) {
            if (existingEntry.count >= config.maxRequests) {
                throwLimitExceeded(req, res, config, existingEntry);
            }
            existingEntry.count++;
        } else {
            store.set(key, {
                count: 1,
                resetTime: now + config.windowMs,
            });
        }

        const currentEntry = store.get(key)!;
        if (config.skipSuccessfulRequests || config.skipResponse) {
            attachResponseAdjustment(req, res, store, key, config, currentEntry);
        } else {
            setHeaders(res, config, currentEntry, config.maxRequests - currentEntry.count);
        }

        cleanupCounter++;
        if (cleanupCounter % 100 === 0) {
            cleanupExpiredEntries(store);
        }

        next();
    };
};
