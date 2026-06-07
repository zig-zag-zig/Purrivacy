import { NextFunction, Request, Response } from 'express';
import { errorMiddleware } from '../src/api/middleware/errorMiddleware';
import { requestMetadata } from '../src/api/middleware/requestMetadata';
import { BadRequestError } from '../src/utils/errors';
import { ResponseUtils } from '../src/utils/responseUtils';

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

describe('HTTP middleware and response helpers', () => {
  it('adds recovery codes only through the explicit response helper', () => {
    const defaultResponse = mockResponse();
    defaultResponse.locals.newRecoveryCodes = ['CODE-123456'];

    ResponseUtils.success(defaultResponse, { success: true });
    expect(defaultResponse.body).toEqual({ success: true });

    const explicitResponse = mockResponse();
    explicitResponse.locals.newRecoveryCodes = ['CODE-123456'];

    ResponseUtils.successWithRecoveryCodes(explicitResponse, { success: true });
    expect(explicitResponse.body).toEqual({
      success: true,
      newRecoveryCodes: ['CODE-123456'],
    });
  });

  it('sets device context, security headers, and allowed CORS origins', () => {
    process.env.ALLOWED_ORIGINS = 'https://app.example';
    jest.resetModules();
    const { requestMetadata: middleware } = require('../src/api/middleware/requestMetadata') as typeof import('../src/api/middleware/requestMetadata');
    const req = mockRequest({
      headers: {
        origin: 'https://app.example',
        'x-device-id': ['device-1', 'device-2'],
      },
    });
    const res = mockResponse();
    const next: NextFunction = jest.fn();

    middleware(req, res, next);

    expect(req.deviceId).toBe('device-1');
    expect(res.headers['X-Content-Type-Options']).toBe('nosniff');
    expect(res.headers['X-Frame-Options']).toBe('DENY');
    expect(res.headers['Access-Control-Allow-Origin']).toBe('https://app.example');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('responds to CORS preflight without continuing the middleware chain', () => {
    const req = mockRequest({ method: 'OPTIONS' });
    const res = mockResponse();
    const next: NextFunction = jest.fn();

    requestMetadata(req, res, next);

    expect(res.statusCodeValue).toBe(204);
    expect(res.ended).toBe(true);
    expect(next).not.toHaveBeenCalled();
  });

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
});
