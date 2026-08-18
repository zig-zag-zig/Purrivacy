import dotenv from 'dotenv';
import * as crypto from 'crypto';
import * as fs from 'fs';
import {
    DEFAULT_MAX_KEYS_PER_USER,
    MAX_KEYS_PER_USER,
} from '../core/constants';

dotenv.config();

const warn = (message: string): void => {
    console.warn(`[env] ${message}`);
};

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

const parseBoundedNumberEnv = (name: string, fallback: number, min: number, max: number): number => {
    const value = process.env[name]?.trim();
    if (!value) {
        return fallback;
    }

    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < min) {
        return fallback;
    }

    return Math.min(parsed, max);
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

/**
 * Selecting the shared Redis store requires an explicit REDIS_URL: refusing
 * to start beats silently defaulting to a local Redis instance and surfacing
 * the misconfiguration as 503s on the first request (quality review HQ-01).
 */
const parseRateLimitStoreSelection = (
    storeValue: string | undefined,
    redisUrlValue: string | undefined,
): 'memory' | 'redis' => {
    const store = parseRateLimitStore(storeValue);
    if (store === 'redis' && !redisUrlValue?.trim()) {
        throw new Error('[env] RATE_LIMIT_STORE=redis requires REDIS_URL to be set');
    }
    return store;
};

const HEX_64_RE = /^[0-9a-f]{64}$/i;
const BYTE_SIZE_RE = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/i;
const DEFAULT_REQUEST_JSON_LIMIT = '10mb';
const DEFAULT_REQUEST_FORM_LIMIT = '1mb';
const MAX_REQUEST_JSON_LIMIT_BYTES = 15 * 1024 * 1024;
const MAX_REQUEST_FORM_LIMIT_BYTES = 2 * 1024 * 1024;

const parseByteSizeToBytes = (raw: string): number => {
    const match = BYTE_SIZE_RE.exec(raw);
    if (!match) {
        return Number.NaN;
    }

    const unit = (match[2] || 'b').toLowerCase();
    const multiplier = unit === 'gb'
        ? 1024 * 1024 * 1024
        : unit === 'mb'
            ? 1024 * 1024
            : unit === 'kb'
                ? 1024
                : 1;
    return Math.round(Number.parseFloat(match[1]) * multiplier);
};

/**
 * Parse a byte-size body limit (e.g. `10mb`, `512kb`). Outside production an
 * invalid or oversized value falls back to the default; in production it fails
 * startup (API-SEC-007).
 */
const parseBodyLimitEnv = (name: string, fallback: string, maxBytes: number): { limit: string; limitBytes: number } => {
    const fallbackBytes = parseByteSizeToBytes(fallback);
    const raw = process.env[name]?.trim();
    if (!raw) {
        return { limit: fallback, limitBytes: fallbackBytes };
    }

    const bytes = parseByteSizeToBytes(raw);
    if (!Number.isFinite(bytes)) {
        if (isProduction) {
            throw new Error(`[env] ${name} must be a byte size such as '10mb', got '${raw}'`);
        }
        if (!isTestEnv) {
            warn(`${name} '${raw}' is not a valid byte size; using default '${fallback}'`);
        }
        return { limit: fallback, limitBytes: fallbackBytes };
    }

    if (bytes > maxBytes) {
        if (isProduction) {
            throw new Error(`[env] ${name} must not exceed ${maxBytes / (1024 * 1024)}mb in production, got '${raw}'`);
        }
        if (!isTestEnv) {
            warn(`${name} '${raw}' exceeds the ${maxBytes / (1024 * 1024)}mb maximum; using default '${fallback}'`);
        }
        return { limit: fallback, limitBytes: fallbackBytes };
    }

    return { limit: raw, limitBytes: bytes };
};

const nodeEnv = process.env.NODE_ENV?.trim() || 'development';
const isProduction = nodeEnv === 'production';
const isTestEnv = nodeEnv === 'test';

/**
 * MFA_KEK — required everywhere, strictly validated as 64 hex characters in
 * production so a typo cannot silently weaken AES key derivation (API-SEC-007).
 */
const mfaKek = (() => {
    const value = getRequiredEnv('MFA_KEK');
    if (HEX_64_RE.test(value)) {
        return value;
    }
    if (isProduction) {
        throw new Error('[env] MFA_KEK must be exactly 64 hex characters (generate with `openssl rand -hex 32`)');
    }
    if (!isTestEnv) {
        warn('MFA_KEK is not 64 hex characters; this is only acceptable outside production');
    }
    return value;
})();

/**
 * Recovery pepper secrets. Required (64 hex, distinct from MFA_KEK and each
 * other) in production; outside production an unset pepper is replaced by a
 * stable derived development value (API-SEC-004, API-SEC-010).
 */
const parseRecoveryPepperEnv = (name: string, domainSeparator: string, kek: string): string => {
    const value = process.env[name]?.trim();
    if (value) {
        if (!HEX_64_RE.test(value)) {
            if (isProduction) {
                throw new Error(`[env] ${name} must be exactly 64 hex characters (generate with \`openssl rand -hex 32\`)`);
            }
            if (!isTestEnv) {
                warn(`${name} is not 64 hex characters; this is only acceptable outside production`);
            }
        }
        return value;
    }

    if (isProduction) {
        throw new Error(`[env] Missing required environment variable: ${name}`);
    }
    if (!isTestEnv) {
        warn(`${name} is not set; using a derived development value`);
    }
    return crypto.createHash('sha256').update(`dev:${domainSeparator}:${kek}`).digest('hex');
};

const assertDistinctSecrets = (first: string, firstName: string, second: string, secondName: string): void => {
    if (first === second) {
        throw new Error(`[env] ${firstName} must be distinct from ${secondName}`);
    }
};

/**
 * Fail-fast production configuration invariants (API-SEC-007).
 */
const validateProductionEnvironment = (config: {
    firebaseUseEmulator: boolean;
    firebaseServiceAccountJson: string | undefined;
    firebaseCredentialsPath: string | undefined;
    firebaseDatabaseUrl: string | undefined;
    trustProxyRaw: string | undefined;
    sentryEnabled: boolean;
    sentryDsn: string | undefined;
}): void => {
    if (config.firebaseUseEmulator) {
        throw new Error('[env] FIREBASE_USE_EMULATOR must be disabled in production');
    }

    if (!config.firebaseServiceAccountJson && !config.firebaseCredentialsPath) {
        throw new Error('[env] FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS is required in production');
    }
    if (config.firebaseServiceAccountJson) {
        try {
            const parsed = JSON.parse(config.firebaseServiceAccountJson) as Record<string, unknown>;
            if (!parsed || typeof parsed !== 'object' || !parsed.project_id || !parsed.private_key) {
                throw new Error('invalid service account shape');
            }
        } catch {
            throw new Error('[env] FIREBASE_SERVICE_ACCOUNT_JSON must be valid Firebase service-account JSON in production');
        }
    }
    if (config.firebaseCredentialsPath && !fs.existsSync(config.firebaseCredentialsPath)) {
        throw new Error(`[env] GOOGLE_APPLICATION_CREDENTIALS file does not exist: ${config.firebaseCredentialsPath}`);
    }

    if (!config.firebaseDatabaseUrl) {
        throw new Error('[env] FIREBASE_DATABASE_URL is required in production');
    }

    if (!config.trustProxyRaw) {
        throw new Error('[env] TRUST_PROXY must be explicitly configured in production (e.g. loopback, a hop count, or trusted subnets)');
    }

    if (config.sentryEnabled && !config.sentryDsn) {
        throw new Error('[env] SENTRY_DSN is required when SENTRY_ENABLED is true in production');
    }
};

const firebaseServiceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const firebaseCredentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const firebaseDatabaseUrl = process.env.FIREBASE_DATABASE_URL?.trim();
const trustProxyRaw = process.env.TRUST_PROXY?.trim();
const firebaseUseEmulator = parseBooleanEnv('FIREBASE_USE_EMULATOR');
const sentryEnabled = parseBooleanEnv('SENTRY_ENABLED', true);
const sentryDsn = parseOptionalStringEnv('SENTRY_DSN');

const jsonBodyLimit = parseBodyLimitEnv('REQUEST_JSON_LIMIT', DEFAULT_REQUEST_JSON_LIMIT, MAX_REQUEST_JSON_LIMIT_BYTES);
const formBodyLimit = parseBodyLimitEnv('REQUEST_FORM_LIMIT', DEFAULT_REQUEST_FORM_LIMIT, MAX_REQUEST_FORM_LIMIT_BYTES);

const recoveryEnumerationPepper = parseRecoveryPepperEnv('RECOVERY_ENUMERATION_PEPPER', 'recovery-enumeration', mfaKek);
const recoveryVerifierPepper = parseRecoveryPepperEnv('RECOVERY_VERIFIER_PEPPER', 'recovery-verifier', mfaKek);

assertDistinctSecrets(recoveryEnumerationPepper, 'RECOVERY_ENUMERATION_PEPPER', mfaKek, 'MFA_KEK');
assertDistinctSecrets(recoveryVerifierPepper, 'RECOVERY_VERIFIER_PEPPER', mfaKek, 'MFA_KEK');
assertDistinctSecrets(recoveryVerifierPepper, 'RECOVERY_VERIFIER_PEPPER', recoveryEnumerationPepper, 'RECOVERY_ENUMERATION_PEPPER');

if (isProduction) {
    validateProductionEnvironment({
        firebaseUseEmulator,
        firebaseServiceAccountJson,
        firebaseCredentialsPath,
        firebaseDatabaseUrl,
        trustProxyRaw,
        sentryEnabled,
        sentryDsn,
    });
}

export const env = {
    appEnv: parseOptionalStringEnv('APP_ENV') || nodeEnv,
    nodeEnv,
    logLevel: process.env.LOG_LEVEL?.trim().toLowerCase() || 'info',
    port: parseNumberEnv('PORT', 5000, 1),
    trustProxy: parseTrustProxy(trustProxyRaw),
    allowedOrigins: parseCsvEnv('ALLOWED_ORIGINS'),
    authEmailDomain: parseAuthEmailDomain(getRequiredEnv('AUTH_EMAIL_DOMAIN')),
    firebaseUseEmulator,
    firebaseServiceAccountJson,
    firebaseCredentialsPath,
    firebaseDatabaseUrl,
    mfaKek,
    recoveryEnumerationPepper,
    recoveryVerifierPepper,
    requestJsonLimit: jsonBodyLimit.limit,
    requestJsonLimitBytes: jsonBodyLimit.limitBytes,
    requestFormLimit: formBodyLimit.limit,
    requestFormLimitBytes: formBodyLimit.limitBytes,
    rateLimitStore: parseRateLimitStoreSelection(process.env.RATE_LIMIT_STORE, process.env.REDIS_URL),
    redisUrl: parseOptionalStringEnv('REDIS_URL'),
    rateLimitFailClosed: parseBooleanEnv('RATE_LIMIT_FAIL_CLOSED', isProduction),
    userMaxKeyRecords: parseBoundedNumberEnv('USER_MAX_KEY_RECORDS', DEFAULT_MAX_KEYS_PER_USER, 1, MAX_KEYS_PER_USER),
    sentryDsn,
    sentryEnabled,
    sentryEnvironment: parseOptionalStringEnv('SENTRY_ENVIRONMENT') || parseOptionalStringEnv('APP_ENV') || nodeEnv,
    sentryRelease: parseOptionalStringEnv('SENTRY_RELEASE'),
    sentryTracesSampleRate: parseFloatEnv('SENTRY_TRACES_SAMPLE_RATE', 0, 0, 1),
};
