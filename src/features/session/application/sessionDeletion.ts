import { db } from '../../../infrastructure/firebase';
import { CryptoUtils } from '../../../utils/cryptoUtils';
import { sessionCollections } from './sessionCollections';

export const deleteAccessSession = async (accessToken: string): Promise<void> => {
    await sessionCollections.sessions.doc(CryptoUtils.sha256(accessToken)).delete();
};

export const deleteAllUserSessions = async (userId: string): Promise<void> => {
    const sessionsSnapshot = await sessionCollections.sessions
        .where('userId', '==', userId)
        .get();
    const refreshTokensSnapshot = await sessionCollections.refreshTokens
        .where('userId', '==', userId)
        .get();
    const familiesSnapshot = await sessionCollections.refreshTokenFamilies
        .where('userId', '==', userId)
        .get();

    const batch = db.batch();
    sessionsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
    refreshTokensSnapshot.docs.forEach(doc => batch.delete(doc.ref));
    familiesSnapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
};

