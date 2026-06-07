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

export const parseSessionTrustRequest = (body: SessionTrustRequest): boolean => {
    if (typeof body?.mfaTrusted !== 'boolean') {
        throw new BadRequestError('mfaTrusted must be provided as a boolean');
    }

    return body.mfaTrusted;
};
