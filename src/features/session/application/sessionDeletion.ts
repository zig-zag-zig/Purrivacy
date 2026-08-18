import { CryptoUtils } from '../../../utils/cryptoUtils';
import { deletePagedQueryResults } from '../../../infrastructure/firebase/chunkedWrites';
import { sessionCollections } from './sessionCollections';

export const deleteAccessSession = async (accessToken: string): Promise<void> => {
    await sessionCollections.sessions.doc(CryptoUtils.sha256(accessToken)).delete();
};

/**
 * Delete every session, refresh token and refresh-token family record for a
 * user. Records are deleted in bounded, chunked pages so the operation works
 * regardless of how many records have accumulated (Firestore batches cap at
 * 500 writes). Idempotent by construction: a second run simply deletes what
 * remains.
 */
export const deleteAllUserSessions = async (userId: string): Promise<number> => {
    const queries = [
        sessionCollections.sessions.where('userId', '==', userId),
        sessionCollections.refreshTokens.where('userId', '==', userId),
        sessionCollections.refreshTokenFamilies.where('userId', '==', userId),
    ];

    let deletedCount = 0;
    for (const query of queries) {
        const result = await deletePagedQueryResults(query);
        deletedCount += result.deletedCount;
    }

    return deletedCount;
};
