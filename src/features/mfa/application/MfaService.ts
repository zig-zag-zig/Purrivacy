import { disableMfa } from './disableMfa';
import { verifyAndEnableMfa } from './enableMfa';
import {
    getRemainingMfaRecoveryCodes,
    regenerateMfaRecoveryCodes,
} from './mfaRecoveryCodes';
import { mintMfaSetupNonce } from './mfaSetupNonce';
import { setupMfa } from './setupMfa';
import { verifyMfaCode } from './verifyMfaCode';

/**
 * Public facade for MFA use cases.
 */
export class MfaService {
    static async setupMfa(
        userId: string,
        sessionFamilyId: string,
        nonce: unknown,
    ): Promise<{ secret: string; otpauthUrl: string; recoveryCodes: string[] }> {
        return setupMfa(userId, sessionFamilyId, nonce);
    }

    static async mintMfaSetupNonce(
        userId: string,
        sessionFamilyId: string,
        mfaCode?: string,
    ): Promise<{ nonce: string; expiresAt: string }> {
        return mintMfaSetupNonce(userId, sessionFamilyId, mfaCode);
    }

    static async verifyAndEnableMfa(
        userId: string,
        code: string,
        currentDeviceId?: string,
    ): Promise<boolean> {
        return verifyAndEnableMfa(userId, code, currentDeviceId);
    }

    static async verifyMfaCode(
        userId: string,
        isSensitive: boolean,
        mfaCode?: string,
    ): Promise<string[] | undefined> {
        return verifyMfaCode(userId, isSensitive, mfaCode);
    }

    static async disableMfa(userId: string, currentDeviceId?: string): Promise<void> {
        await disableMfa(userId, currentDeviceId);
    }

    static async regenerateRecoveryCodes(userId: string): Promise<string[]> {
        return regenerateMfaRecoveryCodes(userId);
    }

    static async getRemainingRecoveryCodes(userId: string): Promise<number> {
        return getRemainingMfaRecoveryCodes(userId);
    }
}

