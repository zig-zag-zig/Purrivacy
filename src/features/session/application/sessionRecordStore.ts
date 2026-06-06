import { ACCESS_TOKEN_LIFETIME_MS } from '../../../core/constants';
import { RefreshTokenFamily, Session } from '../../../core/types';
import { CryptoUtils } from '../../../utils/cryptoUtils';
import { generateOpaqueToken, MAX_ACCESS_TOKEN_LENGTH } from './sessionTokenUtils';
import { isValidDate, toDate } from './firestoreDate';
import { sessionCollections } from './sessionCollections';

const getAccessTokenExpiresAt = (now: Date): Date => {
    return new Date(now.getTime() + ACCESS_TOKEN_LIFETIME_MS);
};

export const createAccessTokenForFamily = async (
    family: RefreshTokenFamily,
): Promise<{ accessToken: string; accessTokenExpiresAt: Date }> => {
    const accessToken = generateOpaqueToken();
    const accessTokenHash = CryptoUtils.sha256(accessToken);
    const now = new Date();
    const accessTokenExpiresAt = getAccessTokenExpiresAt(now);

    const sessionData: Session = {
        accessTokenHash,
        userId: family.userId,
        refreshTokenFamilyId: family.familyId,
        createdAt: now,
        expiresAt: accessTokenExpiresAt,
        userHasMfa: family.userHasMfa,
    };

    await sessionCollections.sessions.doc(accessTokenHash).set(sessionData);

    return { accessToken, accessTokenExpiresAt };
};

export const getValidActiveAccessSession = async (
    transaction: FirebaseFirestore.Transaction,
    currentAccessToken: string | undefined,
    family: RefreshTokenFamily,
    now: Date,
): Promise<Session | null> => {
    if (!currentAccessToken || currentAccessToken.length > MAX_ACCESS_TOKEN_LENGTH) {
        return null;
    }

    const accessTokenHash = CryptoUtils.sha256(currentAccessToken);
    const sessionRef = sessionCollections.sessions.doc(accessTokenHash);
    const sessionDoc = await transaction.get(sessionRef);
    if (!sessionDoc.exists) {
        return null;
    }

    const data = sessionDoc.data();
    if (!data) {
        return null;
    }

    const expiresAt = toDate(data.expiresAt);
    if (!isValidDate(expiresAt) || expiresAt <= now) {
        transaction.delete(sessionRef);
        return null;
    }

    if (data.userId !== family.userId || data.refreshTokenFamilyId !== family.familyId) {
        return null;
    }

    return {
        accessTokenHash,
        userId: data.userId,
        refreshTokenFamilyId: data.refreshTokenFamilyId,
        createdAt: toDate(data.createdAt),
        expiresAt,
        userHasMfa: data.userHasMfa,
    };
};

export const queueFamilyRecordDeletes = async (
    batch: FirebaseFirestore.WriteBatch,
    familyId: string,
    familyRef: FirebaseFirestore.DocumentReference,
): Promise<void> => {
    const [sessionsSnapshot, refreshTokensSnapshot] = await Promise.all([
        sessionCollections.sessions
            .where('refreshTokenFamilyId', '==', familyId)
            .get(),
        sessionCollections.refreshTokens
            .where('familyId', '==', familyId)
            .get(),
    ]);

    sessionsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
    refreshTokensSnapshot.docs.forEach(doc => batch.delete(doc.ref));
    batch.delete(familyRef);
};

export const queueStaleDeviceFamilyDeletes = async (
    batch: FirebaseFirestore.WriteBatch,
    userId: string,
    deviceId: string,
    newFamilyId: string,
): Promise<void> => {
    const familiesSnapshot = await sessionCollections.refreshTokenFamilies
        .where('deviceId', '==', deviceId)
        .get();

    const staleFamilyDocs = familiesSnapshot.docs.filter(doc => {
        const familyData = doc.data() as RefreshTokenFamily;
        return familyData.userId === userId && familyData.familyId !== newFamilyId;
    });

    await Promise.all(staleFamilyDocs.map(doc => {
        const familyData = doc.data() as RefreshTokenFamily;
        return queueFamilyRecordDeletes(batch, familyData.familyId || doc.id, doc.ref);
    }));
};
