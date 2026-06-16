import { NextFunction, Request, Response } from 'express';

describe('requestMetadata', () => {
    it('sets device context, security headers, and allowed CORS origins', () => {
        process.env.ALLOWED_ORIGINS = 'https://app.example';
        jest.resetModules();
        const { requestMetadata: middleware } = require('../../../../src/api/middleware/requestMetadata') as typeof import('../../../../src/api/middleware/requestMetadata');
        const req = {
            headers: { origin: 'https://app.example', 'x-device-id': ['device-1', 'device-2'] },
            method: 'GET',
        } as Request;
        const res = {
            headers: {}, headersSent: false, locals: {},
            setHeader(name: string, value: string | number | readonly string[]) {
                (this as Record<string, unknown>).headers[name] = value;
                return this;
            },
            status(statusCode: number) {
                (this as Record<string, unknown>).statusCodeValue = statusCode;
                return this;
            },
            end() { (this as Record<string, unknown>).ended = true; return this; },
        } as unknown as Response & { headers: Record<string, string | number | readonly string[]>; statusCodeValue?: number; ended?: boolean };
        const next: NextFunction = jest.fn();

        middleware(req, res, next);

        expect((req as Record<string, unknown>).deviceId).toBe('device-1');
        expect(res.headers['X-Content-Type-Options']).toBe('nosniff');
        expect(res.headers['X-Frame-Options']).toBe('DENY');
        expect(res.headers['Access-Control-Allow-Origin']).toBe('https://app.example');
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('responds to CORS preflight without continuing the middleware chain', () => {
        const req = { headers: {}, method: 'OPTIONS' } as Request;
        const res = {
            headers: {}, headersSent: false, locals: {},
            setHeader(name: string, value: string | number | readonly string[]) {
                (this as Record<string, unknown>).headers[name] = value;
                return this;
            },
            status(statusCode: number) {
                (this as Record<string, unknown>).statusCodeValue = statusCode;
                return this;
            },
            end() { (this as Record<string, unknown>).ended = true; return this; },
        } as unknown as Response & { headers: Record<string, string | number | readonly string[]>; statusCodeValue?: number; ended?: boolean };
        const next: NextFunction = jest.fn();

        const { requestMetadata } = require('../../../../src/api/middleware/requestMetadata') as typeof import('../../../../src/api/middleware/requestMetadata');
        requestMetadata(req, res, next);

        expect(res.statusCodeValue).toBe(204);
        expect(res.ended).toBe(true);
        expect(next).not.toHaveBeenCalled();
    });
});
