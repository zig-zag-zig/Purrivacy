import { Session, SessionResponse } from '../../../core/types';
import { createBackendSession } from './createSession';
import { deleteAccessSession, deleteAllUserSessions } from './sessionDeletion';
import {
    markSessionFamilyMfaVerified,
    revokeSessionFamily,
    setSessionFamilyMfaTrust,
} from './sessionFamilyMutations';
import { CreateSessionOptions } from './sessionTypes';
import { rotateBackendRefreshToken } from './rotateRefreshToken';
import { validateBackendSession } from './validateSession';

/**
 * Public facade for backend access-token and refresh-token-family use cases.
 */
export class SessionService {
    static async createSession(
        userId: string,
        options: CreateSessionOptions = {},
    ): Promise<SessionResponse> {
        return createBackendSession(userId, options);
    }

    static async validateSession(accessToken: string): Promise<Session> {
        return validateBackendSession(accessToken);
    }

    static async rotateRefreshToken(
        refreshToken: string,
        currentAccessToken?: string,
    ): Promise<SessionResponse> {
        return rotateBackendRefreshToken(refreshToken, currentAccessToken);
    }

    static async setFamilyMfaTrust(
        familyId: string,
        userId: string,
        mfaTrusted: boolean,
    ): Promise<{ mfaTrusted: boolean }> {
        return setSessionFamilyMfaTrust(familyId, userId, mfaTrusted);
    }

    static async markFamilyMfaVerified(familyId: string, userId: string): Promise<void> {
        await markSessionFamilyMfaVerified(familyId, userId);
    }

    static async revokeFamily(familyId: string, userId: string): Promise<void> {
        await revokeSessionFamily(familyId, userId);
    }

    static async deleteSession(accessToken: string): Promise<void> {
        await deleteAccessSession(accessToken);
    }

    static async deleteAllUserSessions(userId: string, options: { excludeFamilyId?: string } = {}): Promise<void> {
        await deleteAllUserSessions(userId, options);
    }
}

