import { db } from '../../../infrastructure/firebase';
import { env } from '../../../config/env';
import { ConflictError } from '../../../utils/errors';
import { createLogger } from '../../../utils/logger';
import { NotificationService } from '../../notification/application/NotificationService';
import { EncryptedUserDataValidator } from '../domain/EncryptedUserDataValidator';
import { deleteUserEncryptedKeys, initializeUserEncryptedKeyRecords } from '../infrastructure/UserKeyRepository';
import { getUserRef, getUserWithFieldMask } from '../infrastructure/UserRepository';
import { deleteUserPushTokensFromDb } from '../../notification/infrastructure/pushTokenStore';
import { pepperRecoveryVerifierHash } from '../../auth/recovery/recoveryVerifierHash';

const logger = createLogger('features.user.writes');

const notifyUserDataChanged = (userId: string): void => {
    void NotificationService.sendDataOnlyNotificationSafe(userId, 'user', 'user update');
};

export const queueUserMfaEnabledUpdate = (
    batch: FirebaseFirestore.WriteBatch,
    userId: string,
    mfaEnabled: boolean,
): void => {
    batch.update(getUserRef(userId), { mfaEnabled });
};

export const createUser = async (
    user: unknown,
    userId: string,
): Promise<{ success: boolean }> => {
    const userRef = getUserRef(userId);
    const doc = await userRef.get();
    if (doc.exists) {
        throw new ConflictError('User already exists');
    }

    const sanitizedUser = EncryptedUserDataValidator.sanitizeUserForCreate(user, env.userMaxKeyRecords);
    const { keys, ...userDocument } = sanitizedUser;
    // Store the recovery verifier hash server-side peppered and versioned (API-SEC-010).
    userDocument.recoveryVerifierHash = pepperRecoveryVerifierHash(userDocument.recoveryVerifierHash);
    await userRef.create(userDocument);

    try {
        await initializeUserEncryptedKeyRecords(userId, keys);
    } catch (error) {
        await userRef.delete().catch((deleteError) => (
            logger.warn('failed to roll back user after key storage failure', { userId, deleteError })
        ));
        throw error;
    }

    notifyUserDataChanged(userId);
    return { success: true };
};

export const changeDekPassword = async (
    userId: string,
    value: unknown,
): Promise<{ success: boolean }> => {
    await getUserWithFieldMask(userId, ['mfaEnabled']);

    const sanitizedValue = EncryptedUserDataValidator.sanitizeSaltedEncryptedPayload(value, 'dekPassword');
    await getUserRef(userId).update({ dekPassword: sanitizedValue });

    notifyUserDataChanged(userId);
    return { success: true };
};

export const deleteUser = async (userId: string): Promise<void> => {
    const userRef = getUserRef(userId);
    const batch = db.batch();
    batch.delete(userRef.collection('security').doc('mfa'));
    batch.delete(userRef);
    await batch.commit();
    await Promise.all([
        deleteUserEncryptedKeys(userId),
        deleteUserPushTokensFromDb(userId),
    ]);
};

const PASSPHRASE_STORAGE_FIELD = 'passphraseStorageEnabled';

export const setPassphraseStorage = async (
    userId: string,
    enabled: boolean,
    deviceId?: string,
): Promise<void> => {
    const userRef = getUserRef(userId);
    await userRef.update({ [PASSPHRASE_STORAGE_FIELD]: enabled });

    // Notify all user devices to re-fetch keys with updated passphrase state
    await NotificationService.sendDataOnlyNotificationSafe(
        userId,
        'user',
        'passphrase storage toggle',
        { enabled },
        { excludeDeviceId: deviceId },
    );
};
