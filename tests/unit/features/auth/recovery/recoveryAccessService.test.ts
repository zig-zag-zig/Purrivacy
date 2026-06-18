import { createFakeFirestore } from '../../../../helpers/fakeFirestore';
import { createSaltedEncryptedPayload } from '../../../../helpers/testFixtures';

const fakeFs = createFakeFirestore();

jest.mock('../../../../../src/infrastructure/firebase/index.js', () => ({
    db: fakeFs.db,
    auth: {
        getUserByEmail: jest.fn(),
        createCustomToken: jest.fn(),
    },
}));

const loadModule = (): typeof import('../../../../../src/features/auth/recovery/RecoveryAccessService') => (
    require('../../../../../src/features/auth/recovery/RecoveryAccessService')
);

const getAuth = () => require('../../../../../src/infrastructure/firebase/index.js').auth;

const seedUser = (userId: string, data: Record<string, unknown>) => {
    fakeFs.store.users = {
        [userId]: { exists: true, data },
    };
};

describe('RecoveryAccessService', () => {
    beforeEach(() => {
        fakeFs.reset();
        jest.clearAllMocks();
    });

    describe('getChallenge', () => {
        it('returns a fake salt for a non-existent user', async () => {
            getAuth().getUserByEmail.mockRejectedValue(new Error('not found'));
            const { RecoveryAccessService } = loadModule();

            const result = await RecoveryAccessService.getChallenge('alice');

            expect(result.recoveryVerifierSalt).toEqual(expect.any(String));
            expect(result.recoveryVerifierSalt.length).toBeGreaterThan(0);
        });

        it('returns a fake salt when user exists but has no recoveryVerifierSalt field', async () => {
            getAuth().getUserByEmail.mockResolvedValue({ uid: 'user-1' });
            seedUser('user-1', { mfaEnabled: false });
            const { RecoveryAccessService } = loadModule();

            const result = await RecoveryAccessService.getChallenge('alice');

            expect(result.recoveryVerifierSalt).toEqual(expect.any(String));
        });

        it('returns actual recoveryVerifierSalt when user has one', async () => {
            getAuth().getUserByEmail.mockResolvedValue({ uid: 'user-1' });
            seedUser('user-1', { recoveryVerifierSalt: 'salt-value-123' });
            const { RecoveryAccessService } = loadModule();

            const result = await RecoveryAccessService.getChallenge('alice');

            expect(result.recoveryVerifierSalt).toBe('salt-value-123');
        });
    });

    describe('createRecoveryToken', () => {
        it('throws BadRequestError when recovery verifier is not a 64-char hex string', async () => {
            getAuth().getUserByEmail.mockResolvedValue({ uid: 'user-1' });
            const { RecoveryAccessService } = loadModule();

            await expect(RecoveryAccessService.createRecoveryToken('alice', 'short')).rejects.toThrow(/Invalid recovery/);
            await expect(RecoveryAccessService.createRecoveryToken('alice', 123)).rejects.toThrow(/Invalid recovery/);
        });

        it('throws BadRequestError when user is not found', async () => {
            getAuth().getUserByEmail.mockRejectedValue(new Error('not found'));
            const { RecoveryAccessService } = loadModule();

            await expect(RecoveryAccessService.createRecoveryToken('alice', 'a'.repeat(64))).rejects.toThrow(/Invalid recovery/);
        });

        it('throws BadRequestError when user doc does not exist', async () => {
            getAuth().getUserByEmail.mockResolvedValue({ uid: 'user-1' });
            const { RecoveryAccessService } = loadModule();

            await expect(RecoveryAccessService.createRecoveryToken('alice', 'a'.repeat(64))).rejects.toThrow(/Invalid recovery/);
        });

        it('throws BadRequestError when recovery verifier hash does not match', async () => {
            getAuth().getUserByEmail.mockResolvedValue({ uid: 'user-1' });
            seedUser('user-1', {
                dekSeed: createSaltedEncryptedPayload('hash-mismatch'),
                recoveryVerifierHash: 'wrong-hash',
            });
            const { RecoveryAccessService } = loadModule();

            await expect(RecoveryAccessService.createRecoveryToken('alice', 'a'.repeat(64))).rejects.toThrow(/Invalid recovery/);
        });

        it('returns userId, encrypted user data, and a custom token on successful recovery', async () => {
            const verifier = '1'.repeat(64);
            const { createHash } = require('crypto');
            const expectedHash = createHash('sha256').update(verifier).digest('hex');
            const dekSeed = createSaltedEncryptedPayload('success');

            getAuth().getUserByEmail.mockResolvedValue({ uid: 'user-1' });
            seedUser('user-1', {
                dekSeed,
                recoveryVerifierHash: expectedHash,
            });
            getAuth().createCustomToken.mockResolvedValue('custom-token-abc');
            const { RecoveryAccessService } = loadModule();

            const result = await RecoveryAccessService.createRecoveryToken('alice', verifier);

            expect(result.userId).toBe('user-1');
            expect(result.tempToken).toBe('custom-token-abc');
            expect(result.userEncrypted).toHaveProperty('dekSeed');
            expect(result.userEncrypted.dekSeed.encryptedData).toBe(dekSeed.encryptedData);
        });
    });
});
