/**
 * Application constants
 */

// Session constants
export const ACCESS_TOKEN_LIFETIME_MS = 15 * 60 * 1000; // 15 minutes
export const REFRESH_TOKEN_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000; // 90 days, extended on rotation
export const UNTRUSTED_MFA_MAX_AGE_MS = 4 * 60 * 60 * 1000; // 4 hours
export const SESSION_ID_BYTES = 32;

// MFA constants
export const RECOVERY_CODE_COUNT = 10;
export const MFA_SETUP_EXPIRY_MINUTES = 10;
export const AUTO_REGENERATE_THRESHOLD = 2;
