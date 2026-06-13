import { NextFunction, Request, Response } from 'express';
import { createRateLimiter } from '../src/api/rate-limit/createRateLimiter';
import { RateLimitError } from '../src/utils/errors';
import { RateLimitConfig } from '../src/api/rate-limit/rateLimitTypes';

const mockReq = (overrides: Partial<Request> = {}): Request => ({
    headers: {},
    method: 'GET',
    path: '/test',
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    connection: { remoteAddress: '127.0.0.1' },
    ...overrides,
} as unknown as Request);

const mockRes = (): Response & { headers: Record<string, string>; statusCodeValue?: number; finishListeners: Array<() => void> } => {
    const res = {
        headers: {} as Record<string, string>,
        locals: {},
        statusCodeValue: 200,
        finishListeners: [] as Array<() => void>,
        setHeader(name: string, value: string) {
            res.headers[name] = value;
            return res;
        },
        get statusCode() {
            return res.statusCodeValue;
        },
        set statusCode(val: number) {
            res.statusCodeValue = val;
        },
        writeHead(statusCode: number) {
            res.statusCodeValue = statusCode;
            return res;
        },
        once(event: string, fn: () => void) {
            if (event === 'finish') {
                res.finishListeners.push(fn);
            }
            return res;
        },
    } as unknown as Response & { headers: Record<string, string>; statusCodeValue?: number; finishListeners: Array<() => void> };
    return res;
};

const defaultConfig: RateLimitConfig = {
    windowMs: 1000,
    maxRequests: 3,
};

describe('createRateLimiter', () => {
    it('allows requests under the limit', () => {
        const limiter = createRateLimiter(defaultConfig);
        const req = mockReq();
        const res = mockRes();
        const next = jest.fn();

        limiter(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
    });

    it('throws RateLimitError at the limit', () => {
        const limiter = createRateLimiter({ ...defaultConfig, maxRequests: 2 });
        const req = mockReq();
        const res = mockRes();
        const next = jest.fn();

        limiter(req, res, next);
        limiter(req, res, next);

        expect(() => limiter(req, res, next)).toThrow(RateLimitError);
    });

    it('resets count after window expires', async () => {
        const limiter = createRateLimiter({ ...defaultConfig, windowMs: 50, maxRequests: 1 });
        const req = mockReq();
        const res = mockRes();
        const next = jest.fn();

        limiter(req, res, next);
        expect(() => limiter(req, res, next)).toThrow(RateLimitError);

        // Wait for window to expire
        await new Promise(resolve => setTimeout(resolve, 60));

        const res2 = mockRes();
        limiter(req, res2, next);
        expect(next).toHaveBeenCalledTimes(2);
    });

    it('sets correct X-RateLimit headers', () => {
        const limiter = createRateLimiter({ ...defaultConfig, maxRequests: 5 });
        const req = mockReq();
        const res = mockRes();
        const next = jest.fn();

        limiter(req, res, next);

        expect(res.headers['X-RateLimit-Limit']).toBe('5');
        expect(res.headers['X-RateLimit-Remaining']).toBe('4');
        expect(res.headers['X-RateLimit-Reset']).toBeDefined();
        expect(res.headers['X-RateLimit-Policy']).toBe('5;w=1');
    });

    it('sets Retry-After header on rate limit exceeded', () => {
        const limiter = createRateLimiter({ ...defaultConfig, maxRequests: 1 });
        const req = mockReq();
        const res = mockRes();
        const next = jest.fn();

        limiter(req, res, next);

        try {
            limiter(req, res, next);
        } catch (err) {
            expect(err).toBeInstanceOf(RateLimitError);
            expect(res.headers['Retry-After']).toBeDefined();
        }
    });

    it('uses custom keyGenerator when provided', () => {
        const limiter = createRateLimiter({
            ...defaultConfig,
            maxRequests: 1,
            keyGenerator: () => 'custom-key',
        });
        const req1 = mockReq({ path: '/a' });
        const req2 = mockReq({ path: '/b' });
        const res1 = mockRes();
        const res2 = mockRes();
        const next = jest.fn();

        limiter(req1, res1, next);

        // Different request but same key → should be rate limited
        expect(() => limiter(req2, res2, next)).toThrow(RateLimitError);
    });

    it('provides correct error details on rate limit exceeded', () => {
        const limiter = createRateLimiter({ ...defaultConfig, maxRequests: 1, message: 'Custom limit message' });
        const req = mockReq();
        const res = mockRes();
        const next = jest.fn();

        limiter(req, res, next);

        try {
            limiter(req, res, next);
        } catch (err) {
            expect(err).toBeInstanceOf(RateLimitError);
            expect((err as RateLimitError).message).toBe('Custom limit message');
            expect((err as RateLimitError).details).toMatchObject({
                limit: 1,
                window: 1,
            });
        }
    });
});
