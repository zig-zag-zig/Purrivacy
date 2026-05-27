import { db } from '../../../infrastructure/firebase';
import { createLogger } from '../../../utils/logger';
import { NotificationService } from '../../notification/application/NotificationService';
import { getMfaSecurityRef, getUserRef } from './mfaRefs';

const logger = createLogger('features.mfa.disable');

export const disableMfa = async (userId: string, currentDeviceId?: string): Promise<void> => {
    const batch = db.batch();
    batch.update(getUserRef(userId), { mfaEnabled: false });
    batch.delete(getMfaSecurityRef(userId));
    await batch.commit();

    await NotificationService.sendDataOnlyNotification(
        userId,
        'mfaState',
        { mfaEnabled: false, mfaTrusted: false },
        { excludeDeviceId: currentDeviceId },
    ).catch((error) => logger.warn('mfa disable notification failed', { userId, error }));
};
