import { SessionTrustRequest } from '../../../core/types';
import { BadRequestError } from '../../../utils/errors';

export const parseMfaEnableRequest = (body: any): {
    mfaCode: string;
    mfaTrusted: boolean;
} => {
    if (typeof body?.mfaCode !== 'string' || !body.mfaCode.trim()) {
        throw new BadRequestError('mfaCode is required');
    }

    const mfaCode = body.mfaCode.trim();
    if (!/^\d{6}$/.test(mfaCode)) {
        throw new BadRequestError('mfaCode must be a 6-digit TOTP code');
    }

    return {
        mfaCode,
        mfaTrusted: body.mfaTrusted === true,
    };
};

export const parseSessionTrustRequest = (body: SessionTrustRequest): boolean => {
    if (typeof body?.mfaTrusted !== 'boolean') {
        throw new BadRequestError('mfaTrusted must be provided as a boolean');
    }

    return body.mfaTrusted;
};
