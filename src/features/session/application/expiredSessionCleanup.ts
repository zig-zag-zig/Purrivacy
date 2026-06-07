import { db } from '../../../infrastructure/firebase';
import { createLogger } from '../../../utils/logger';
import { sessionCollections } from './sessionCollections';

const logger = createLogger('features.session.cleanup');

export const cleanupExpiredSessionRecords = async (): Promise<number> => {
    try {
        const now = new Date();
        const [
            expiredSessions,
            expiredRefreshTokens,
            expiredRefreshTokenFamilies,
        ] = await Promise.all([
            sessionCollections.sessions.where('expiresAt', '<', now).get(),
            sessionCollections.refreshTokens.where('expiresAt', '<', now).get(),
            sessionCollections.refreshTokenFamilies.where('expiresAt', '<', now).get(),
        ]);

        const batch = db.batch();
        expiredSessions.docs.forEach(doc => batch.delete(doc.ref));
        expiredRefreshTokens.docs.forEach(doc => batch.delete(doc.ref));
        expiredRefreshTokenFamilies.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();

        const count = expiredSessions.size + expiredRefreshTokens.size + expiredRefreshTokenFamilies.size;
        logger.info('expired session records cleaned up', { count });
        return count;
    } catch (error) {
        logger.error('failed to clean up expired session records', { error });
        throw error;
    }
};

