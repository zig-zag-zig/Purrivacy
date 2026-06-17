import { createFakeFirestore } from '../../../../helpers/fakeFirestore';

const fakeFs = createFakeFirestore();

jest.mock('../../../../../src/infrastructure/firebase/index.js', () => ({
    db: fakeFs.db,
    auth: {
        getUser: jest.fn(),
    },
}));

jest.mock('../../../../../src/features/user/application/UserService', () => ({
    UserService: { getUserMfaState: jest.fn() },
}));

jest.mock('../../../../../src/config/env', () => ({
    env: { mfaKek: 'test-mfa-kek-with-enough-entropy-for-local-test' },
}));

let encryptSecretMock = jest.fn(() => ({
    encryptedData: 'encrypted-base64-data',
    iv: 'abcdef0123456789abcdef01',
    tag: 'abcdef0123456789abcdef0123456789',
}));

jest.mock('../../../../../src/utils/cryptoUtils', () => ({
    CryptoUtils: {
        encryptSecret: (...args: unknown[]) => encryptSecretMock(...args),
        generateRecoveryCodes: jest.requireActual('../../../../../src/utils/cryptoUtils').CryptoUtils.generateRecoveryCodes,
        sha256: jest.requireActual('../../../../../src/utils/cryptoUtils').CryptoUtils.sha256,
        decryptSecret: jest.fn(),
        randomHex: jest.fn(),
        randomBase64Url: jest.fn(),
        randomInt: jest.fn(),
        timingSafeEqual: jest.fn(),
    },
}));

const loadModule = (): typeof import('../../../../../src/features/mfa/application/setupMfa') => (
    require('../../../../../src/features/mfa/application/setupMfa')
);

const getAuth = () => require('../../../../../src/infrastructure/firebase/index.js').auth;
const getUserService = () => require('../../../../../src/features/user/application/UserService').UserService;

describe('setupMfa', () => {
    beforeEach(() => {
        fakeFs.reset();
        jest.clearAllMocks();
    });

    it('throws MfaAlreadyEnabledError when MFA is already enabled', async () => {
        getUserService().getUserMfaState.mockResolvedValue({ mfaEnabled: true });
        const { setupMfa } = loadModule();
        await expect(setupMfa('user-1')).rejects.toThrow(/already enabled/);
    });

    it('generates TOTP secret and recovery codes, stores encrypted setup document', async () => {
        getUserService().getUserMfaState.mockResolvedValue({ mfaEnabled: false });
        getAuth().getUser.mockResolvedValue({ uid: 'user-1', email: 'alice@purrivacy.test' });
        const { setupMfa } = loadModule();

        const result = await setupMfa('user-1');

        expect(result.secret).toEqual(expect.any(String));
        expect(result.otpauthUrl).toEqual(expect.stringContaining('otpauth://totp/'));
        expect(result.recoveryCodes).toHaveLength(10);
        expect(result.recoveryCodes.every((c: string) => c.length > 0)).toBe(true);

        const setupDoc = fakeFs.store.mfaSetup['user-1'];
        expect(setupDoc.exists).toBe(true);
        expect(setupDoc.data!.encryptedSecret).toBe('encrypted-base64-data');
        expect(setupDoc.data!.hashedRecoveryCodes).toHaveLength(10);
    });

    it('uses userId as label when Firebase user has no email', async () => {
        getUserService().getUserMfaState.mockResolvedValue({ mfaEnabled: false });
        getAuth().getUser.mockResolvedValue({ uid: 'user-1' });
        const { setupMfa } = loadModule();

        const result = await setupMfa('user-1');

        expect(result.otpauthUrl).toContain('user-1');
    });
});
