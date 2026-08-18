import dotenv from 'dotenv';

dotenv.config();

const getRequiredEnv = (name: string): string => {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`[env] Missing required environment variable: ${name}`);
    }
    return value;
};

const parseNumberEnv = (name: string, fallback: number, min = 0): number => {
    const value = process.env[name]?.trim();
    if (!value) {
        return fallback;
    }

    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < min) {
        return fallback;
    }

    return parsed;
};

const parseCsvEnv = (name: string): string[] => (
    process.env[name] || ''
).split(',').map(value => value.trim()).filter(Boolean);

const parseBooleanEnv = (name: string, fallback = false): boolean => {
    const value = process.env[name]?.trim().toLowerCase();
    if (!value) {
        return fallback;
    }

    return value === 'true' || value === '1' || value === 'yes';
};

/**
 * Precise Express `trust proxy` configuration (API-SEC-009).
 *
 * Accepted values:
 * - `true` / `false` (legacy booleans)
 * - `loopback` (trust only the loopback subnet — the documented single-tunnel topology)
 * - a hop count, e.g. `1`
 * - a comma-separated list of trusted subnets/IPs, e.g. `10.0.0.0/8, 127.0.0.1`
 */
const parseTrustProxy = (value: string | undefined): boolean | number | string | string[] => {
    const raw = value?.trim();
    if (!raw) {
        return false;
    }

    const lower = raw.toLowerCase();
    if (lower === 'true' || lower === '1' || lower === 'yes') {
        return true;
    }
    if (lower === 'false' || lower === '0' || lower === 'no') {
        return false;
    }
    if (lower === 'loopback') {
        return 'loopback';
    }
    if (/^\d+$/.test(raw)) {
        const hops = Number.parseInt(raw, 10);
        if (Number.isFinite(hops) && hops >= 0) {
            return hops;
        }
    }

    const TRUSTED_SUBNET_RE = /^(?:loopback|linklocal|uniquelocal|[0-9a-f:.]+(?:\/\d{1,3})?)$/i;
    const subnets = raw.split(',').map(part => part.trim()).filter(Boolean);
    if (subnets.length > 0 && subnets.every(part => TRUSTED_SUBNET_RE.test(part))) {
        return subnets;
    }

    return false;
};

const parseFloatEnv = (name: string, fallback: number, min = 0, max = 1): number => {
    const value = process.env[name]?.trim();
    if (!value) {
        return fallback;
    }

    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
        return fallback;
    }

    return parsed;
};

const parseOptionalStringEnv = (name: string): string | undefined => {
    const value = process.env[name]?.trim();
    return value || undefined;
};

const parseAuthEmailDomain = (value: string): string => {
    const normalized = value.trim().toLowerCase();
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(normalized)) {
        throw new Error('[env] AUTH_EMAIL_DOMAIN must be a valid domain');
    }
    return normalized;
};

const parseRateLimitStore = (value: string | undefined): 'memory' | 'redis' => {
    return value?.trim().toLowerCase() === 'redis' ? 'redis' : 'memory';
};

const nodeEnv = process.env.NODE_ENV?.trim() || 'development';

export const env = {
    appEnv: parseOptionalStringEnv('APP_ENV') || nodeEnv,
    nodeEnv,
    logLevel: process.env.LOG_LEVEL?.trim().toLowerCase() || 'info',
    port: parseNumberEnv('PORT', 5000, 1),
    trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
    allowedOrigins: parseCsvEnv('ALLOWED_ORIGINS'),
    authEmailDomain: parseAuthEmailDomain(getRequiredEnv('AUTH_EMAIL_DOMAIN')),
    firebaseUseEmulator: parseBooleanEnv('FIREBASE_USE_EMULATOR'),
    firebaseServiceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
    firebaseCredentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    firebaseDatabaseUrl: process.env.FIREBASE_DATABASE_URL?.trim(),
    mfaKek: getRequiredEnv('MFA_KEK'),
    requestJsonLimit: process.env.REQUEST_JSON_LIMIT?.trim() || '10mb',
    requestFormLimit: process.env.REQUEST_FORM_LIMIT?.trim() || '1mb',
    rateLimitStore: parseRateLimitStore(process.env.RATE_LIMIT_STORE),
    redisUrl: parseOptionalStringEnv('REDIS_URL'),
    rateLimitFailClosed: parseBooleanEnv('RATE_LIMIT_FAIL_CLOSED', nodeEnv === 'production'),
    sentryDsn: parseOptionalStringEnv('SENTRY_DSN'),
    sentryEnabled: parseBooleanEnv('SENTRY_ENABLED', true),
    sentryEnvironment: parseOptionalStringEnv('SENTRY_ENVIRONMENT') || parseOptionalStringEnv('APP_ENV') || nodeEnv,
    sentryRelease: parseOptionalStringEnv('SENTRY_RELEASE'),
    sentryTracesSampleRate: parseFloatEnv('SENTRY_TRACES_SAMPLE_RATE', 0, 0, 1),
};
