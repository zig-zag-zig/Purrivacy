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

export const env = {
    appEnv: parseOptionalStringEnv('APP_ENV') || process.env.NODE_ENV?.trim() || 'development',
    nodeEnv: process.env.NODE_ENV?.trim() || 'development',
    logLevel: process.env.LOG_LEVEL?.trim().toLowerCase() || 'info',
    port: parseNumberEnv('PORT', 5000, 1),
    trustProxy: parseBooleanEnv('TRUST_PROXY'),
    allowedOrigins: parseCsvEnv('ALLOWED_ORIGINS'),
    authEmailDomain: parseAuthEmailDomain(getRequiredEnv('AUTH_EMAIL_DOMAIN')),
    firebaseUseEmulator: parseBooleanEnv('FIREBASE_USE_EMULATOR'),
    firebaseServiceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
    firebaseCredentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    firebaseDatabaseUrl: process.env.FIREBASE_DATABASE_URL?.trim(),
    mfaKek: getRequiredEnv('MFA_KEK'),
    requestJsonLimit: process.env.REQUEST_JSON_LIMIT?.trim() || '10mb',
    requestFormLimit: process.env.REQUEST_FORM_LIMIT?.trim() || '1mb',
    sentryDsn: parseOptionalStringEnv('SENTRY_DSN'),
    sentryEnabled: parseBooleanEnv('SENTRY_ENABLED', true),
    sentryEnvironment: parseOptionalStringEnv('SENTRY_ENVIRONMENT') || parseOptionalStringEnv('APP_ENV') || process.env.NODE_ENV?.trim() || 'development',
    sentryRelease: parseOptionalStringEnv('SENTRY_RELEASE'),
    sentryTracesSampleRate: parseFloatEnv('SENTRY_TRACES_SAMPLE_RATE', 0, 0, 1),
};
