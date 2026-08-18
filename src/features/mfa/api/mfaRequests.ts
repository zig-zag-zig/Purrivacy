import { SessionTrustRequest } from '../../../core/types';
import { BadRequestError } from '../../../utils/errors';
import { getBodyValue, requireBodyString } from '../../../api/http/requestParsing';

export const parseMfaEnableRequest = (body: unknown): {
    mfaCode: string;
    mfaTrusted: boolean;
} => {
    const mfaCode = requireBodyString(body, 'mfaCode', { trim: true });
    if (!/^\d{6}$/.test(mfaCode)) {
        throw new BadRequestError('mfaCode must be a 6-digit TOTP code');
    }

    return {
        mfaCode,
        mfaTrusted: getBodyValue(body, 'mfaTrusted') === true,
    };
};

/**
 * Extract the fresh-auth nonce required to start MFA setup (API-SEC-006).
 * Validation (presence, format, expiry, single-use, binding) happens in
 * consumeMfaSetupNonce and always maps to a 401 MfaSetupNonceError, so the
 * parser deliberately stays format-agnostic.
 */
export const parseMfaSetupNonceRequest = (body: unknown): unknown => {
    return getBodyValue(body, 'nonce');
};

export const parseSessionTrustRequest = (body: SessionTrustRequest): boolean => {
    if (typeof body?.mfaTrusted !== 'boolean') {
        throw new BadRequestError('mfaTrusted must be provided as a boolean');
    }

    return body.mfaTrusted;
};
