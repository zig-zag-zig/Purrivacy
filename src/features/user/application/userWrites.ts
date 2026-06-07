import { db } from '../../../infrastructure/firebase';
import { ConflictError } from '../../../utils/errors';
import { createLogger } from '../../../utils/logger';
import { NotificationService } from '../../notification/application/NotificationService';
import { EncryptedUserDataValidator } from '../domain/EncryptedUserDataValidator';
import { deleteUserEncryptedKeys, initializeUserEncryptedKeyRecords } from '../infrastructure/UserKeyRepository';
import { getUserRef, getUserWithFieldMask } from '../infrastructure/UserRepository';
import { deleteUserPushTokensFromDb } from '../../notification/infrastructure/pushTokenStore';

const logger = createLogger('features.user.writes');

const notifyUserDataChanged = (userId: string): void => {
    void NotificationService.sendDataOnlyNotification(userId, 'user')
        .catch((error) => logger.warn('user update notification failed', { userId, error }));
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

    const sanitizedUser = EncryptedUserDataValidator.sanitizeUserForCreate(user);
    const { keys, ...userDocument } = sanitizedUser;
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
