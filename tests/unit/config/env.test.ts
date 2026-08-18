// The env parsing functions are module-private. We test them indirectly by
// manipulating process.env and re-importing the module with jest.resetModules().
// The parsers are: parseNumberEnv, parseCsvEnv, parseBooleanEnv, parseFloatEnv, parseAuthEmailDomain.

describe('env parsing functions', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    describe('parseNumberEnv', () => {
        it('returns fallback when env is not set', () => {
            jest.resetModules();
            delete process.env.PORT;
            const { env } = require('../../../src/config/env') as typeof import('../../../src/config/env');
            expect(env.port).toBe(5000);
        });

        it('parses a valid number', () => {
            jest.resetModules();
            process.env.PORT = '3000';
            const { env } = require('../../../src/config/env') as typeof import('../../../src/config/env');
            expect(env.port).toBe(3000);
        });

        it('returns fallback for non-numeric value', () => {
            jest.resetModules();
            process.env.PORT = 'abc';
            const { env } = require('../../../src/config/env') as typeof import('../../../src/config/env');
            expect(env.port).toBe(5000);
        });

        it('returns fallback for value below min', () => {
            jest.resetModules();
            process.env.PORT = '0';
            const { env } = require('../../../src/config/env') as typeof import('../../../src/config/env');
            expect(env.port).toBe(5000);
        });
    });

    describe('parseBooleanEnv', () => {
        it('parses "true" as true', () => {
            jest.resetModules();
            process.env.TRUST_PROXY = 'true';
            const { env } = require('../../../src/config/env') as typeof import('../../../src/config/env');
            expect(env.trustProxy).toBe(true);
        });

        it('parses "1" as true', () => {
            jest.resetModules();
            process.env.TRUST_PROXY = '1';
            const { env } = require('../../../src/config/env') as typeof import('../../../src/config/env');
            expect(env.trustProxy).toBe(true);
        });

        it('parses "yes" as true', () => {
            jest.resetModules();
            process.env.TRUST_PROXY = 'yes';
            const { env } = require('../../../src/config/env') as typeof import('../../../src/config/env');
            expect(env.trustProxy).toBe(true);
        });

        it('parses "false" as false', () => {
            jest.resetModules();
            process.env.TRUST_PROXY = 'false';
            const { env } = require('../../../src/config/env') as typeof import('../../../src/config/env');
            expect(env.trustProxy).toBe(false);
        });

        it('returns fallback when not set', () => {
            jest.resetModules();
            delete process.env.TRUST_PROXY;
            const { env } = require('../../../src/config/env') as typeof import('../../../src/config/env');
            expect(env.trustProxy).toBe(false);
        });
    });

    describe('parseCsvEnv', () => {
        it('parses comma-separated values', () => {
            jest.resetModules();
            process.env.ALLOWED_ORIGINS = 'https://a.com, https://b.com';
            const { env } = require('../../../src/config/env') as typeof import('../../../src/config/env');
            expect(env.allowedOrigins).toEqual(['https://a.com', 'https://b.com']);
        });

        it('returns empty array when not set', () => {
            jest.resetModules();
            delete process.env.ALLOWED_ORIGINS;
            const { env } = require('../../../src/config/env') as typeof import('../../../src/config/env');
            expect(env.allowedOrigins).toEqual([]);
        });

        it('filters empty segments', () => {
            jest.resetModules();
            process.env.ALLOWED_ORIGINS = 'https://a.com,,https://b.com,';
            const { env } = require('../../../src/config/env') as typeof import('../../../src/config/env');
            expect(env.allowedOrigins).toEqual(['https://a.com', 'https://b.com']);
        });
    });

    describe('parseFloatEnv', () => {
        it('parses a valid float', () => {
            jest.resetModules();
            process.env.SENTRY_TRACES_SAMPLE_RATE = '0.5';
            const { env } = require('../../../src/config/env') as typeof import('../../../src/config/env');
            expect(env.sentryTracesSampleRate).toBe(0.5);
        });

        it('returns fallback for out-of-range value', () => {
            jest.resetModules();
            process.env.SENTRY_TRACES_SAMPLE_RATE = '1.5';
            const { env } = require('../../../src/config/env') as typeof import('../../../src/config/env');
            expect(env.sentryTracesSampleRate).toBe(0);
        });

        it('returns fallback for non-finite value', () => {
            jest.resetModules();
            process.env.SENTRY_TRACES_SAMPLE_RATE = 'Infinity';
            const { env } = require('../../../src/config/env') as typeof import('../../../src/config/env');
            expect(env.sentryTracesSampleRate).toBe(0);
        });
    });

    describe('parseAuthEmailDomain', () => {
        it('accepts a valid domain', () => {
            jest.resetModules();
            process.env.AUTH_EMAIL_DOMAIN = 'example.com';
            const { env } = require('../../../src/config/env') as typeof import('../../../src/config/env');
            expect(env.authEmailDomain).toBe('example.com');
        });

        it('rejects an invalid domain format', () => {
            jest.resetModules();
            process.env.AUTH_EMAIL_DOMAIN = 'not-a-domain';
            expect(() => require('../../../src/config/env')).toThrow(/AUTH_EMAIL_DOMAIN must be a valid domain/);
        });

        it('normalizes to lowercase', () => {
            jest.resetModules();
            process.env.AUTH_EMAIL_DOMAIN = 'Example.COM';
            const { env } = require('../../../src/config/env') as typeof import('../../../src/config/env');
            expect(env.authEmailDomain).toBe('example.com');
        });
    });

    describe('parseTrustProxy', () => {
        it('accepts legacy boolean values', () => {
            jest.resetModules();
            process.env.TRUST_PROXY = 'true';
            expect(require('../../../src/config/env').env.trustProxy).toBe(true);

            jest.resetModules();
            process.env.TRUST_PROXY = 'false';
            expect(require('../../../src/config/env').env.trustProxy).toBe(false);
        });

        it('accepts loopback', () => {
            jest.resetModules();
            process.env.TRUST_PROXY = 'loopback';
            expect(require('../../../src/config/env').env.trustProxy).toBe('loopback');
        });

        it('accepts a hop count', () => {
            jest.resetModules();
            process.env.TRUST_PROXY = '2';
            expect(require('../../../src/config/env').env.trustProxy).toBe(2);
        });

        it('accepts a comma-separated list of trusted subnets', () => {
            jest.resetModules();
            process.env.TRUST_PROXY = '10.0.0.0/8, 127.0.0.1';
            expect(require('../../../src/config/env').env.trustProxy).toEqual(['10.0.0.0/8', '127.0.0.1']);
        });

        it('falls back to false for unrecognized values', () => {
            jest.resetModules();
            process.env.TRUST_PROXY = 'garbage-value';
            expect(require('../../../src/config/env').env.trustProxy).toBe(false);
        });
    });

    describe('userMaxKeyRecords', () => {
        it('defaults to 1000 when unset', () => {
            jest.resetModules();
            delete process.env.USER_MAX_KEY_RECORDS;
            expect(require('../../../src/config/env').env.userMaxKeyRecords).toBe(1000);
        });

        it('parses a valid configured value', () => {
            jest.resetModules();
            process.env.USER_MAX_KEY_RECORDS = '250';
            expect(require('../../../src/config/env').env.userMaxKeyRecords).toBe(250);
        });

        it('clamps values above the hard ceiling of 5000', () => {
            jest.resetModules();
            process.env.USER_MAX_KEY_RECORDS = '99999';
            expect(require('../../../src/config/env').env.userMaxKeyRecords).toBe(5000);
        });

        it('returns the fallback for values below 1', () => {
            jest.resetModules();
            process.env.USER_MAX_KEY_RECORDS = '0';
            expect(require('../../../src/config/env').env.userMaxKeyRecords).toBe(1000);
        });

        it('returns the fallback for non-numeric values', () => {
            jest.resetModules();
            process.env.USER_MAX_KEY_RECORDS = 'many';
            expect(require('../../../src/config/env').env.userMaxKeyRecords).toBe(1000);
        });
    });

    describe('rate limit store configuration', () => {
        it('defaults to the memory store', () => {
            jest.resetModules();
            delete process.env.RATE_LIMIT_STORE;
            expect(require('../../../src/config/env').env.rateLimitStore).toBe('memory');
        });

        it('selects the redis store', () => {
            jest.resetModules();
            process.env.RATE_LIMIT_STORE = 'redis';
            expect(require('../../../src/config/env').env.rateLimitStore).toBe('redis');
        });

        it('parses REDIS_URL', () => {
            jest.resetModules();
            process.env.REDIS_URL = 'redis://cache:6379';
            expect(require('../../../src/config/env').env.redisUrl).toBe('redis://cache:6379');
        });

        it('defaults RATE_LIMIT_FAIL_CLOSED to true in production', () => {
            jest.resetModules();
            process.env.NODE_ENV = 'production';
            delete process.env.RATE_LIMIT_FAIL_CLOSED;
            expect(require('../../../src/config/env').env.rateLimitFailClosed).toBe(true);
        });

        it('defaults RATE_LIMIT_FAIL_CLOSED to false outside production', () => {
            jest.resetModules();
            process.env.NODE_ENV = 'test';
            delete process.env.RATE_LIMIT_FAIL_CLOSED;
            expect(require('../../../src/config/env').env.rateLimitFailClosed).toBe(false);
        });

        it('honors an explicit RATE_LIMIT_FAIL_CLOSED value', () => {
            jest.resetModules();
            process.env.NODE_ENV = 'test';
            process.env.RATE_LIMIT_FAIL_CLOSED = 'true';
            expect(require('../../../src/config/env').env.rateLimitFailClosed).toBe(true);
        });
    });
});
