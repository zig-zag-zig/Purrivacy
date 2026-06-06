import { AUTO_REGENERATE_THRESHOLD, RECOVERY_CODE_COUNT } from '../../../core/constants';
import { UserMfaSecurity } from '../../../core/types';
import { db } from '../../../infrastructure/firebase';
import { CryptoUtils } from '../../../utils/cryptoUtils';
import { MfaNotEnabledError, NotFoundError } from '../../../utils/errors';
import { UserService } from '../../user/application/UserService';
import { getMfaSecurityRef, getUserRef } from './mfaRefs';

export const regenerateMfaRecoveryCodes = async (userId: string): Promise<string[]> => {
    const { mfaEnabled } = await UserService.getUserMfaState(userId);
    if (!mfaEnabled) {
        throw new MfaNotEnabledError();
    }

    const mfaSecurityRef = getMfaSecurityRef(userId);
    const mfaSecurityDoc = await mfaSecurityRef.get();
    if (!mfaSecurityDoc.exists) {
        throw new MfaNotEnabledError();
    }

    const newRecoveryCodes = CryptoUtils.generateRecoveryCodes(RECOVERY_CODE_COUNT);
    await mfaSecurityRef.update({
        mfaRecoveryCodes: newRecoveryCodes.map(CryptoUtils.sha256),
    });

    return newRecoveryCodes;
};

export const getRemainingMfaRecoveryCodes = async (userId: string): Promise<number> => {
    const { mfaEnabled } = await UserService.getUserMfaState(userId);
    if (!mfaEnabled) {
        return 0;
    }

    const mfaSecurityDoc = await getMfaSecurityRef(userId).get();
    const mfaRecoveryCodes = mfaSecurityDoc.data()?.mfaRecoveryCodes;
    return Array.isArray(mfaRecoveryCodes) ? mfaRecoveryCodes.length : 0;
};

export const verifyAndConsumeRecoveryCode = async (
    userId: string,
    code: string,
): Promise<{ valid: boolean; newRecoveryCodes?: string[] }> => {
    const hashedCode = CryptoUtils.sha256(code);
    const userRef = getUserRef(userId);
    const mfaSecurityRef = getMfaSecurityRef(userId);

    return await db.runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists) {
            throw new NotFoundError('User not found');
        }

        const mfaSecurityDoc = await transaction.get(mfaSecurityRef);
        const userData = userDoc.data()!;
        const mfaSecurity = mfaSecurityDoc.data() as UserMfaSecurity | undefined;
        const storedCodes = Array.isArray(mfaSecurity?.mfaRecoveryCodes)
            ? mfaSecurity.mfaRecoveryCodes
            : [];

        if (!userData.mfaEnabled || !mfaSecurityDoc.exists || storedCodes.length === 0) {
            return { valid: false };
        }

        const codeIndex = storedCodes.indexOf(hashedCode);
        if (codeIndex === -1) {
            return { valid: false };
        }

        const updatedCodes = [...storedCodes];
        updatedCodes.splice(codeIndex, 1);

        if (updatedCodes.length <= AUTO_REGENERATE_THRESHOLD) {
            const newRecoveryCodes = CryptoUtils.generateRecoveryCodes(RECOVERY_CODE_COUNT);
            transaction.update(mfaSecurityRef, {
                mfaRecoveryCodes: newRecoveryCodes.map(CryptoUtils.sha256),
            });
            return {
                valid: true,
                newRecoveryCodes,
            };
        }

        transaction.update(mfaSecurityRef, {
            mfaRecoveryCodes: updatedCodes,
        });

        return { valid: true };
    });
};
