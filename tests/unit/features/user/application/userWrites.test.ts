import { createFakeFirestore } from '../../../../helpers/fakeFirestore';
import { createSaltedEncryptedPayload } from '../../../../helpers/testFixtures';

const fakeFs = createFakeFirestore();

jest.mock('../../../../../src/infrastructure/firebase/index.js', () => ({
    db: fakeFs.db,
}));

jest.mock('../../../../../src/features/notification/application/NotificationService', () => ({
    NotificationService: { sendDataOnlyNotification: jest.fn(), sendDataOnlyNotificationSafe: jest.fn() },
}));

jest.mock('../../../../../src/features/user/infrastructure/UserKeyRepository', () => ({
    deleteUserEncryptedKeys: jest.fn(),
    initializeUserEncryptedKeyRecords: jest.fn(),
}));

jest.mock('../../../../../src/features/notification/infrastructure/pushTokenStore', () => ({
    deleteUserPushTokensFromDb: jest.fn(),
}));

const loadModule = (): typeof import('../../../../../src/features/user/application/userWrites') => (
    require('../../../../../src/features/user/application/userWrites')
);

const getNotificationService = () => require('../../../../../src/features/notification/application/NotificationService').NotificationService;
const getUserKeyRepo = () => require('../../../../../src/features/user/infrastructure/UserKeyRepository');
const getPushTokenStore = () => require('../../../../../src/features/notification/infrastructure/pushTokenStore');

describe('userWrites', () => {
    beforeEach(() => {
        fakeFs.reset();
        jest.clearAllMocks();
    });

    const validDekPassword = createSaltedEncryptedPayload('dek');

    describe('createUser', () => {
        const validPayload = {
            dekPassword: validDekPassword,
            dekSeed: createSaltedEncryptedPayload('seed'),
            keys: [],
            recoveryVerifierSalt: '1'.repeat(32),
            recoveryVerifierHash: '2'.repeat(64),
        };

        it('throws ConflictError when user already exists', async () => {
            fakeFs.store.users = { 'user-1': { exists: true, data: {} } };
            const { createUser } = loadModule();
            await expect(createUser(validPayload, 'user-1')).rejects.toThrow('User already exists');
        });

        it('creates a user, initializes keys, and sends notification', async () => {
            getUserKeyRepo().initializeUserEncryptedKeyRecords.mockResolvedValue(undefined);
            const { createUser } = loadModule();

            const result = await createUser(validPayload, 'user-1');

            expect(result).toEqual({ success: true });
            expect(fakeFs.store.users['user-1'].exists).toBe(true);
            expect(fakeFs.store.users['user-1'].data.dekPassword).toEqual(validDekPassword);
            expect(getUserKeyRepo().initializeUserEncryptedKeyRecords).toHaveBeenCalledWith('user-1', []);
            expect(getNotificationService().sendDataOnlyNotificationSafe).toHaveBeenCalledWith(
                'user-1', 'user', 'user update',
            );
        });
    });

    describe('changeDekPassword', () => {
        it('updates dekPassword and sends notification', async () => {
            fakeFs.store.users = { 'user-1': { exists: true, data: { mfaEnabled: false } } };
            const { changeDekPassword } = loadModule();

            const result = await changeDekPassword('user-1', validDekPassword);

            expect(result).toEqual({ success: true });
            expect(fakeFs.store.users['user-1'].data.dekPassword).toEqual(validDekPassword);
            expect(getNotificationService().sendDataOnlyNotificationSafe).toHaveBeenCalledWith(
                'user-1', 'user', 'user update',
            );
        });
    });

    describe('deleteUser', () => {
        it('deletes user, security subcollection, keys, and push tokens', async () => {
            const securityPath = 'users/user-1/security';
            fakeFs.store.users = { 'user-1': { exists: true, data: { mfaEnabled: true } } };
            fakeFs.store[securityPath] = { mfa: { exists: true, data: { mfaSecret: 's' } } };

            const { deleteUser } = loadModule();

            await deleteUser('user-1');

            expect(fakeFs.store.users['user-1'].exists).toBe(false);
            expect(fakeFs.store[securityPath].mfa.exists).toBe(false);
            expect(getUserKeyRepo().deleteUserEncryptedKeys).toHaveBeenCalledWith('user-1');
            expect(getPushTokenStore().deleteUserPushTokensFromDb).toHaveBeenCalledWith('user-1');
        });
    });
});
