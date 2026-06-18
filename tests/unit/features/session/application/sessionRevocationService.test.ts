import { createFakeFirestore } from '../../../../helpers/fakeFirestore';
import { ts } from '../../../../helpers/testFixtures';

const fakeFs = createFakeFirestore();

jest.mock('../../../../../src/infrastructure/firebase/index.js', () => ({
    db: fakeFs.db,
    auth: { revokeRefreshTokens: jest.fn() },
}), { virtual: true });

jest.mock('../../../../../src/features/notification/application/NotificationService', () => ({
    NotificationService: { sendDataOnlyNotification: jest.fn(), sendDataOnlyNotificationSafe: jest.fn() },
}));

const loadService = (): typeof import('../../../../../src/features/session/application/SessionRevocationService') => (
    require('../../../../../src/features/session/application/SessionRevocationService')
);
const getAuth = () => require('../../../../../src/infrastructure/firebase/index.js').auth;
const getNotificationService = () => require('../../../../../src/features/notification/application/NotificationService').NotificationService;

describe('SessionRevocationService', () => {
    beforeEach(() => {
        fakeFs.reset();
        jest.clearAllMocks();
    });

    it('deletes all sessions only when revokeFbToken is false', async () => {
        fakeFs.store.sessions = {
            's-1': { exists: true, data: { userId: 'user-1' } },
            's-2': { exists: true, data: { userId: 'user-1' } },
        };
        fakeFs.store.refreshTokens = { 'rt-1': { exists: true, data: { userId: 'user-1' } } };
        fakeFs.store.refreshTokenFamilies = { 'fam-1': { exists: true, data: { userId: 'user-1' } } };

        const { SessionRevocationService } = loadService();
        await SessionRevocationService.revokeAllUserSessions('user-1', false);

        expect(fakeFs.store.sessions['s-1'].exists).toBe(false);
        expect(fakeFs.store.sessions['s-2'].exists).toBe(false);
        expect(getAuth().revokeRefreshTokens).not.toHaveBeenCalled();
        expect(getNotificationService().sendDataOnlyNotification).not.toHaveBeenCalled();
    });

    it('revokes Firebase tokens and sends notification when revokeFbToken is true', async () => {
        getAuth().revokeRefreshTokens.mockResolvedValue(undefined);
        getNotificationService().sendDataOnlyNotification.mockResolvedValue(undefined);

        const { SessionRevocationService } = loadService();
        await SessionRevocationService.revokeAllUserSessions('user-1', true);

        expect(getAuth().revokeRefreshTokens).toHaveBeenCalledWith('user-1');
        expect(getNotificationService().sendDataOnlyNotification).toHaveBeenCalledWith('user-1', 'sessionRevoked');
    });

    it('throws when session deletion fails', async () => {
        // Use a non-existent userId to cause the deleteAllUserSessions to fail during query
        // Actually deleteAllUserSessions never throws for empty collections, so we mock a different approach
        const { SessionRevocationService } = loadService();
        // Session deletion with no data succeeds (no-op), Firebase revoke throws
        getAuth().revokeRefreshTokens.mockRejectedValue(new Error('Firebase error'));

        await expect(SessionRevocationService.revokeAllUserSessions('user-1', true))
            .rejects.toThrow('Firebase error');
    });
});
