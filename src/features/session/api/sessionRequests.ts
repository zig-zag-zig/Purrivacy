import { BadRequestError } from '../../../utils/errors';
import {
    getBearerToken,
    getBodyValue,
    parseOptionalTrimmedString,
} from '../../../api/http/requestParsing';

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

export { getBearerToken };

const parseOptionalMfaCode = (body: unknown): string | undefined => {
    const mfaCode = parseOptionalTrimmedString(body, 'mfaCode', 12);
    if (mfaCode !== undefined && !MFA_CODE_RE.test(mfaCode)) {
        throw new BadRequestError('mfaCode has an invalid format');
    }

    return mfaCode;
};

export const parseCreateSessionRequest = (body: unknown): CreateSessionBody => {
    return {
        mfaCode: parseOptionalMfaCode(body),
        mfaTrusted: getBodyValue(body, 'mfaTrusted') === true,
        label: parseOptionalTrimmedString(body, 'label', MAX_SESSION_LABEL_LENGTH),
        platform: parseOptionalTrimmedString(body, 'platform', MAX_SESSION_PLATFORM_LENGTH),
    };
};

export const parseRefreshSessionRequest = (body: unknown): string => {
    const refreshTokenValue = getBodyValue(body, 'refreshToken');
    if (typeof refreshTokenValue !== 'string' || !refreshTokenValue.trim()) {
        throw new BadRequestError('refreshToken is required');
    }

    const refreshToken = refreshTokenValue.trim();
    if (refreshToken.length > MAX_REFRESH_TOKEN_LENGTH) {
        throw new BadRequestError('refreshToken is too long');
    }

    return refreshToken;
};

export const parseRecoveryChallengeRequest = (body: unknown): string => {
    const username = getBodyValue(body, 'username');
    if (typeof username !== 'string' || !username.trim()) {
        throw new BadRequestError('username is required');
    }

    return username;
};

export const parseRecoveryTokenRequest = (body: unknown): {
    username: string;
    recoveryVerifier: string;
} => {
    const username = getBodyValue(body, 'username');
    if (typeof username !== 'string' || !username.trim()) {
        throw new BadRequestError('username is required');
    }

    const recoveryVerifier = getBodyValue(body, 'recoveryVerifier');
    if (typeof recoveryVerifier !== 'string' || !recoveryVerifier.trim()) {
        throw new BadRequestError('recoveryVerifier is required');
    }

    return {
        username,
        recoveryVerifier,
    };
};
