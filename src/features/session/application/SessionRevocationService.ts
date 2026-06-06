import { auth, db } from '../../../infrastructure/firebase';
import { SessionService } from './SessionService';
import { NotificationService } from '../../notification/application/NotificationService';
import { createLogger } from '../../../utils/logger';

const logger = createLogger('features.session.revocation');

/**
 * Service for handling session revocation and user logout operations
 */
export class SessionRevocationService {
    /**
     * Delete all sessions for a user and send session revoked notification
     * This should be called when Firebase auth token is revoked
     */
    static async revokeAllUserSessions(userId: string, revokeFbTokenAndSendDataOnlyNotification: boolean): Promise<void> {
        try {
            // 1. Delete all sessions from Firestore
            await SessionService.deleteAllUserSessions(userId);

            if (revokeFbTokenAndSendDataOnlyNotification) {
                // 2. Revoke all firebase refresh tokens
                await auth.revokeRefreshTokens(userId);

                // 3. Send data-only notification to client
                await NotificationService.sendDataOnlyNotification(
                    userId,
                    'sessionRevoked',
                );
            }

            logger.info('all user sessions revoked', { userId });
        } catch (error) {
            logger.error('failed to revoke user sessions', { userId, error });
            throw error;
        }
    }

    /**
     * Clean up expired sessions and refresh-token records periodically
     * This should be called by a scheduled task/cron job
     */
    static async cleanupExpiredSessions(): Promise<number> {
        try {
            const now = new Date();
            const expiredSessions = await db.collection('sessions')
                .where('expiresAt', '<', now)
                .get();
            const expiredRefreshTokens = await db.collection('refreshTokens')
                .where('expiresAt', '<', now)
                .get();
            const expiredRefreshTokenFamilies = await db.collection('refreshTokenFamilies')
                .where('expiresAt', '<', now)
                .get();

            const batch = db.batch();
            expiredSessions.docs.forEach(doc => batch.delete(doc.ref));
            expiredRefreshTokens.docs.forEach(doc => batch.delete(doc.ref));
            expiredRefreshTokenFamilies.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();

            const count = expiredSessions.size + expiredRefreshTokens.size + expiredRefreshTokenFamilies.size;
            logger.info('expired session records cleaned up', { count });
            return count;
        } catch (error) {
            logger.error('failed to clean up expired sessions', { error });
            throw error;
        }
    }

    /**
     * Clean up expired MFA setup documents
     * This should be called by a scheduled task/cron job
     */
    static async cleanupExpiredMfaSetups(): Promise<number> {
        try {
            const now = new Date();
            const expiredSetups = await db.collection('mfaSetup')
                .where('expiresAt', '<', now)
                .get();

            const batch = db.batch();
            expiredSetups.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();

            const count = expiredSetups.size;
            logger.info('expired mfa setup records cleaned up', { count });
            return count;
        } catch (error) {
            logger.error('failed to clean up expired mfa setups', { error });
            throw error;
        }
    }
}
