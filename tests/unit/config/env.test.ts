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
});
