import { db } from '../../../infrastructure/firebase';
import { createLogger } from '../../../utils/logger';
import { getMfaSetupCollection } from './mfaRefs';

const logger = createLogger('features.mfa.cleanup');

export const cleanupExpiredMfaSetups = async (): Promise<number> => {
    try {
        const expiredSetups = await getMfaSetupCollection()
            .where('expiresAt', '<', new Date())
            .get();

        const batch = db.batch();
        expiredSetups.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();

        logger.info('expired mfa setup records cleaned up', { count: expiredSetups.size });
        return expiredSetups.size;
    } catch (error) {
        logger.error('failed to clean up expired mfa setups', { error });
        throw error;
    }
};

