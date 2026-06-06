import { MfaService } from './MfaService';
import { SessionService } from '../../session/application/SessionService';
import { SessionResponse } from '../../../core/types';
import { SessionRevocationService } from '../../session/application/SessionRevocationService';

/**
 * Service for MFA-related session operations
 */
export class MfaSessionService {
    /**
     * Enable MFA and create new session
     */
    static async enableMfaAndCreateSession(
        userId: string,
        mfaCode: string,
        mfaTrusted: boolean = false,
        currentDeviceId?: string
    ): Promise<SessionResponse> {
        await MfaService.verifyAndEnableMfa(userId, mfaCode, currentDeviceId);

        await SessionRevocationService.revokeAllUserSessions(userId, false);
        return SessionService.createSession(userId, {
            userHasMfa: true,
            mfaTrusted,
            deviceId: currentDeviceId,
        });
    }

    /**
     * Disable MFA and create new non-MFA session
     */
    static async disableMfaAndCreateSession(
        userId: string,
        currentDeviceId?: string
    ): Promise<SessionResponse> {
        await MfaService.disableMfa(userId, currentDeviceId);
        await SessionRevocationService.revokeAllUserSessions(userId, false);
        return SessionService.createSession(userId, {
            userHasMfa: false,
            mfaTrusted: false,
            deviceId: currentDeviceId,
        });
    }

    /**
     * Manage MFA trust for the current refresh-token family.
     */
    static async manageSessionTrust(
        userId: string,
        sessionFamilyId: string,
        mfaTrusted: boolean
    ): Promise<{ mfaTrusted: boolean }> {
        return SessionService.setFamilyMfaTrust(sessionFamilyId, userId, mfaTrusted);
    }
}
