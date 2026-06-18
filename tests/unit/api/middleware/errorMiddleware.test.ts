import { NextFunction, Request } from 'express';
import { errorMiddleware } from '../../../../src/api/middleware/errorMiddleware';
import { BadRequestError, NotFoundError } from '../../../../src/utils/errors';
import { createMockRequest, createMockResponse, MockResponse } from '../../../helpers/testFixtures';

describe('errorMiddleware', () => {
    it('preserves generated recovery codes on JSON error responses', () => {
        const req = createMockRequest({ path: '/v1/user/change-password' });
        const res = createMockResponse();
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
        const req = createMockRequest({ path: '/v1/user' });
        const res = createMockResponse();
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
        const req = createMockRequest({ path: '/v1/user' });
        const res = createMockResponse();
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
        const req = createMockRequest({ path: '/v1/user/abc' });
        const res = createMockResponse();
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
        const req = createMockRequest({ path: '/v1/user' });
        const res = createMockResponse();
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
        const req = createMockRequest({ path: '/v1/user' });
        const res = createMockResponse();
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
        const req = createMockRequest({ path: '/v1/user' });
        const res = createMockResponse();
        (res as unknown as Record<string, unknown>).headersSent = true;
        const next: NextFunction = jest.fn();

        errorMiddleware(new BadRequestError('too late'), req, res, next);

        expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
        expect(res.statusCodeValue).toBeUndefined();
    });
});
