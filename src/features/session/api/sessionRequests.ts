import { BadRequestError } from '../../../utils/errors';

export type CreateSessionBody = {
    mfaCode?: string;
    mfaTrusted?: boolean;
    label?: string;
    platform?: string;
};

const MAX_REFRESH_TOKEN_LENGTH = 512;
const MAX_SESSION_LABEL_LENGTH = 120;
const MAX_SESSION_PLATFORM_LENGTH = 64;
const MFA_CODE_RE = /^(\d{6}|[A-Z0-9]{12})$/;

export const getBearerToken = (authHeader: string | undefined): string | undefined => {
    if (!authHeader?.startsWith('Bearer ')) {
        return undefined;
    }

    const token = authHeader.split('Bearer ')[1]?.trim();
    return token || undefined;
};

const parseOptionalString = (
    body: any,
    field: string,
    maxLength: number,
): string | undefined => {
    const value = body?.[field];
    if (value === undefined || value === null) {
        return undefined;
    }

    if (typeof value !== 'string') {
        throw new BadRequestError(`${field} must be a string`);
    }

    const normalized = value.trim();
    if (!normalized) {
        return undefined;
    }

    if (normalized.length > maxLength) {
        throw new BadRequestError(`${field} is too long`);
    }

    return normalized;
};

const parseOptionalMfaCode = (body: any): string | undefined => {
    const mfaCode = parseOptionalString(body, 'mfaCode', 12);
    if (mfaCode !== undefined && !MFA_CODE_RE.test(mfaCode)) {
        throw new BadRequestError('mfaCode has an invalid format');
    }

    return mfaCode;
};

export const parseCreateSessionRequest = (body: any): CreateSessionBody => {
    return {
        mfaCode: parseOptionalMfaCode(body),
        mfaTrusted: body?.mfaTrusted === true,
        label: parseOptionalString(body, 'label', MAX_SESSION_LABEL_LENGTH),
        platform: parseOptionalString(body, 'platform', MAX_SESSION_PLATFORM_LENGTH),
    };
};

export const parseRefreshSessionRequest = (body: any): string => {
    if (typeof body?.refreshToken !== 'string' || !body.refreshToken.trim()) {
        throw new BadRequestError('refreshToken is required');
    }

    const refreshToken = body.refreshToken.trim();
    if (refreshToken.length > MAX_REFRESH_TOKEN_LENGTH) {
        throw new BadRequestError('refreshToken is too long');
    }

    return refreshToken;
};

export const parseRecoveryChallengeRequest = (body: any): string => {
    if (typeof body?.username !== 'string' || !body.username.trim()) {
        throw new BadRequestError('username is required');
    }

    return body.username;
};

export const parseRecoveryTokenRequest = (body: any): {
    username: string;
    recoveryVerifier: string;
} => {
    if (typeof body?.username !== 'string' || !body.username.trim()) {
        throw new BadRequestError('username is required');
    }

    if (typeof body?.recoveryVerifier !== 'string' || !body.recoveryVerifier.trim()) {
        throw new BadRequestError('recoveryVerifier is required');
    }

    return {
        username: body.username,
        recoveryVerifier: body.recoveryVerifier,
    };
};
