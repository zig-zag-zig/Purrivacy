import { auth } from '../../../infrastructure/firebase';
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
}
