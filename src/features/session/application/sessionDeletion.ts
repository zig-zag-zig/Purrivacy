import { CryptoUtils } from '../../../utils/cryptoUtils';
import { deletePagedQueryResults } from '../../../infrastructure/firebase/chunkedWrites';
import { sessionCollections } from './sessionCollections';

export const deleteAccessSession = async (accessToken: string): Promise<void> => {
    await sessionCollections.sessions.doc(CryptoUtils.sha256(accessToken)).delete();
};

/**
 * Delete every session, refresh token and refresh-token family record for a
 * user, optionally keeping the records of one refresh-token family (used by
 * MFA state transitions that create the post-transition session before
 * revoking the old ones). Records are deleted in bounded, chunked pages so
 * the operation works regardless of how many records have accumulated
 * (Firestore batches cap at 500 writes). Idempotent by construction: a
 * second run simply deletes what remains.
 *
 * The excluded family's records are filtered at query level ('!='), so the
 * paged sweep always makes progress and cannot spin on excluded pages.
 */
export const deleteAllUserSessions = async (
    userId: string,
    options: { excludeFamilyId?: string } = {},
): Promise<number> => {
    const { excludeFamilyId } = options;

    let sessionsQuery = sessionCollections.sessions.where('userId', '==', userId);
    let refreshTokensQuery = sessionCollections.refreshTokens.where('userId', '==', userId);
    let familiesQuery = sessionCollections.refreshTokenFamilies.where('userId', '==', userId);

    if (excludeFamilyId) {
        sessionsQuery = sessionsQuery.where('refreshTokenFamilyId', '!=', excludeFamilyId);
        refreshTokensQuery = refreshTokensQuery.where('familyId', '!=', excludeFamilyId);
        familiesQuery = familiesQuery.where('familyId', '!=', excludeFamilyId);
    }

    const queries = [sessionsQuery, refreshTokensQuery, familiesQuery];

    let deletedCount = 0;
    for (const query of queries) {
        const result = await deletePagedQueryResults(query);
        deletedCount += result.deletedCount;
    }

    return deletedCount;
};
