import { createLogger } from '../../../utils/logger';
import { deletePagedQueryResults } from '../../../infrastructure/firebase/chunkedWrites';
import { getMfaSetupCollection } from './mfaRefs';

const logger = createLogger('features.mfa.cleanup');

/**
 * Delete all expired MFA setup records in bounded, chunked pages. If more
 * expired records exist than the per-run page budget, the remainder is left
 * for the next maintenance run (the loop is resumable because it re-queries
 * until empty).
 */
export const cleanupExpiredMfaSetups = async (): Promise<number> => {
    try {
        const result = await deletePagedQueryResults(
            getMfaSetupCollection().where('expiresAt', '<', new Date()),
        );

        logger.info('expired mfa setup records cleaned up', {
            count: result.deletedCount,
            truncated: result.truncated,
        });
        return result.deletedCount;
    } catch (error) {
        logger.error('failed to clean up expired mfa setups', { error });
        throw error;
    }
};
