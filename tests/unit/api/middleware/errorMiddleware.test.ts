import { NextFunction, Request, Response } from 'express';
import { errorMiddleware } from '../../../../src/api/middleware/errorMiddleware';
import { AppError, BadRequestError, NotFoundError } from '../../../../src/utils/errors';

type MockResponse = Response & {
    body?: unknown;
    ended?: boolean;
    headers: Record<string, string | number | readonly string[]>;
    statusCodeValue?: number;
};

const mockResponse = (): MockResponse => {
    const response = {
        headers: {},
        headersSent: false,
        locals: {},
        setHeader(name: string, value: string | number | readonly string[]) {
            this.headers[name] = value;
            return this;
        },
        status(statusCode: number) {
            this.statusCodeValue = statusCode;
            return this;
        },
        json(body: unknown) {
            this.body = body;
            return this;
        },
        end() {
            this.ended = true;
            return this;
        },
    };

    return response as MockResponse;
};

const mockRequest = (overrides: Partial<Request> = {}): Request => ({
    headers: {},
    method: 'GET',
    ...overrides,
} as Request);

describe('errorMiddleware', () => {
    it('preserves generated recovery codes on JSON error responses', () => {
        const req = mockRequest({ path: '/v1/user/change-password' });
        const res = mockResponse();
        res.locals.requestId = 'request-1';
        res.locals.newRecoveryCodes = ['CODE-123456'];
        const next: NextFunction = jest.fn();

        errorMiddleware(new BadRequestError('Operation failed'), req, res, next);

        expect(res.statusCodeValue).toBe(400);
        expect(res.body).toMatchObject({
            error: 'Operation failed',
            newRecoveryCodes: ['CODE-123456'],
            requestId: 'request-1',
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('returns 400 for SyntaxError with body property (invalid JSON)', () => {
        const req = mockRequest({ path: '/v1/user' });
        const res = mockResponse();
        res.locals.requestId = 'req-2';
        const next: NextFunction = jest.fn();

        const syntaxError = new SyntaxError('Unexpected token') as SyntaxError & { body?: unknown };
        syntaxError.body = undefined;

        errorMiddleware(syntaxError, req, res, next);

        expect(res.statusCodeValue).toBe(400);
        expect(res.body).toMatchObject({
            error: 'Invalid JSON request body',
            requestId: 'req-2',
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('returns 413 for entity.too.large errors', () => {
        const req = mockRequest({ path: '/v1/user' });
        const res = mockResponse();
        res.locals.requestId = 'req-3';
        const next: NextFunction = jest.fn();

        const tooLarge = { type: 'entity.too.large', status: 413 };

        errorMiddleware(tooLarge, req, res, next);

        expect(res.statusCodeValue).toBe(413);
        expect(res.body).toMatchObject({
            error: 'Request body is too large',
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('returns correct status for AppError subclasses like NotFoundError', () => {
        const req = mockRequest({ path: '/v1/user/abc' });
        const res = mockResponse();
        res.locals.requestId = 'req-4';
        const next: NextFunction = jest.fn();

        errorMiddleware(new NotFoundError('User not found'), req, res, next);

        expect(res.statusCodeValue).toBe(404);
        expect(res.body).toMatchObject({
            error: 'User not found',
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('returns 500 with safe message for generic Error', () => {
        const req = mockRequest({ path: '/v1/user' });
        const res = mockResponse();
        res.locals.requestId = 'req-5';
        const next: NextFunction = jest.fn();

        errorMiddleware(new Error('something broke internally'), req, res, next);

        expect(res.statusCodeValue).toBe(500);
        expect(res.body).toMatchObject({
            error: 'Internal server error',
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('returns 500 with safe message for non-Error thrown values', () => {
        const req = mockRequest({ path: '/v1/user' });
        const res = mockResponse();
        res.locals.requestId = 'req-6';
        const next: NextFunction = jest.fn();

        errorMiddleware('string error', req, res, next);

        expect(res.statusCodeValue).toBe(500);
        expect(res.body).toMatchObject({
            error: 'Internal server error',
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('delegates to next() when headers are already sent', () => {
        const req = mockRequest({ path: '/v1/user' });
        const res = mockResponse();
        (res as unknown as Record<string, unknown>).headersSent = true;
        const next: NextFunction = jest.fn();

        errorMiddleware(new BadRequestError('too late'), req, res, next);

        expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
        expect(res.statusCodeValue).toBeUndefined();
    });
});
