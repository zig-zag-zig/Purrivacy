import { db } from '../../../infrastructure/firebase';
import { REFRESH_TOKEN_LIFETIME_MS } from '../../../core/constants';
import { RefreshToken, RefreshTokenFamily, SessionResponse } from '../../../core/types';
import { CryptoUtils } from '../../../utils/cryptoUtils';
import { sessionCollections } from './sessionCollections';
import { buildSessionResponse } from './sessionResponse';
import { createAccessTokenForFamily, queueStaleDeviceFamilyDeletes } from './sessionRecordStore';
import { CreateSessionOptions } from './sessionTypes';
import {
    generateRefreshToken,
    normalizeDeviceId,
    TOKEN_ID_HEX_LENGTH,
} from './sessionTokenUtils';

export const createBackendSession = async (
    userId: string,
    options: CreateSessionOptions = {},
): Promise<SessionResponse> => {
    const familyId = CryptoUtils.randomHex(TOKEN_ID_HEX_LENGTH);
    const refreshToken = generateRefreshToken();
    const now = new Date();
    const refreshTokenExpiresAt = new Date(now.getTime() + REFRESH_TOKEN_LIFETIME_MS);
    const mfaTrusted = options.userHasMfa === true && options.mfaTrusted === true;
    const deviceId = normalizeDeviceId(options.deviceId);

    const family: RefreshTokenFamily = {
        familyId,
        userId,
        ...(deviceId ? { deviceId } : {}),
        createdAt: now,
        lastUsedAt: now,
        expiresAt: refreshTokenExpiresAt,
        userHasMfa: options.userHasMfa === true,
        mfaTrusted,
        mfaVerifiedAt: options.userHasMfa === true ? now : null,
        label: options.label,
        platform: options.platform,
    };

    const refreshTokenData: RefreshToken = {
        tokenId: refreshToken.tokenId,
        familyId,
        userId,
        tokenHash: refreshToken.tokenHash,
        createdAt: now,
        expiresAt: refreshTokenExpiresAt,
    };

    const batch = db.batch();
    if (deviceId) {
        await queueStaleDeviceFamilyDeletes(batch, userId, deviceId, familyId);
    }
    batch.set(sessionCollections.refreshTokenFamilies.doc(familyId), family);
    batch.set(sessionCollections.refreshTokens.doc(refreshToken.tokenId), refreshTokenData);
    await batch.commit();

    const access = await createAccessTokenForFamily(family);

    return buildSessionResponse(
        access.accessToken,
        access.accessTokenExpiresAt,
        refreshToken.rawToken,
        refreshTokenExpiresAt,
        family,
    );
};

