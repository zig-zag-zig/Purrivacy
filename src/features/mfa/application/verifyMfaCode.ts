import { env } from '../../../config/env';
import { UserMfaSecurity } from '../../../core/types';
import { CryptoUtils } from '../../../utils/cryptoUtils';
import { AuthError, MfaNotEnabledError } from '../../../utils/errors';
import { UserService } from '../../user/application/UserService';
import { getInvalidMfaError } from './mfaErrors';
import { getMfaSecurityRef } from './mfaRefs';
import { verifyMfaTotp } from './mfaTotp';
import { verifyAndConsumeRecoveryCode } from './mfaRecoveryCodes';

export const verifyMfaCode = async (
    userId: string,
    isSensitive: boolean,
    mfaCode?: unknown,
): Promise<string[] | undefined> => {
    if (typeof mfaCode !== 'string' || !mfaCode.trim()) {
        throw new AuthError('MFA code required', isSensitive ? { mfaRequiredSensitive: true } : { mfaRequired: true }, 403);
    }

    const normalizedMfaCode = mfaCode.trim();
    const isRecoveryCodeFormat = /^[A-Z0-9]{12}$/.test(normalizedMfaCode);
    const isTotpCodeFormat = /^\d{6}$/.test(normalizedMfaCode);

    if (isRecoveryCodeFormat) {
        const recoveryCodesResult = await verifyAndConsumeRecoveryCode(userId, normalizedMfaCode);
        if (!recoveryCodesResult.valid) {
            throw getInvalidMfaError(isSensitive);
        }
        return recoveryCodesResult.newRecoveryCodes;
    }

    if (!isTotpCodeFormat) {
        throw getInvalidMfaError(isSensitive);
    }

    const { mfaEnabled } = await UserService.getUserMfaState(userId);
    if (!mfaEnabled) {
        throw new MfaNotEnabledError();
    }

    const mfaSecurityDoc = await getMfaSecurityRef(userId).get();
    const mfaSecurity = mfaSecurityDoc.data() as UserMfaSecurity | undefined;
    if (mfaSecurity?.mfaSecret && mfaSecurity.mfaSecretIv && mfaSecurity.mfaSecretTag) {
        const secret = CryptoUtils.decryptSecret(
            mfaSecurity.mfaSecret,
            mfaSecurity.mfaSecretIv,
            mfaSecurity.mfaSecretTag,
            env.mfaKek,
        );
        if (verifyMfaTotp(secret, normalizedMfaCode)) {
            return undefined;
        }
    }

    throw getInvalidMfaError(isSensitive);
};
