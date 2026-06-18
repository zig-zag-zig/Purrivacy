import { createFakeFirestore } from '../../../../helpers/fakeFirestore';
import { CryptoUtils } from '../../../../../src/utils/cryptoUtils';

const fakeFs = createFakeFirestore();

jest.mock('../../../../../src/infrastructure/firebase/index.js', () => ({
    db: fakeFs.db,
}), { virtual: true });

const loadDeletion = (): typeof import('../../../../../src/features/session/application/sessionDeletion') => (
    require('../../../../../src/features/session/application/sessionDeletion')
);

describe('sessionDeletion', () => {
    beforeEach(() => {
        fakeFs.reset();
    });

    it('deleteAccessSession removes the session document by hashed token', async () => {
        const { deleteAccessSession } = loadDeletion();
        const accessToken = 'test-access-token-123';
        const hash = CryptoUtils.sha256(accessToken);

        // Seed a session
        fakeFs.store.sessions = {
            [hash]: { exists: true, data: { userId: 'user-1', accessTokenHash: hash } },
        };

        await deleteAccessSession(accessToken);

        expect(fakeFs.store.sessions[hash].exists).toBe(false);
    });

    it('deleteAllUserSessions removes sessions, refresh tokens, and families for a user', async () => {
        const { deleteAllUserSessions } = loadDeletion();

        // Seed data for user-1 and user-2
        fakeFs.store.sessions = {
            'sess-1': { exists: true, data: { userId: 'user-1' } },
            'sess-2': { exists: true, data: { userId: 'user-2' } },
            'sess-3': { exists: true, data: { userId: 'user-1' } },
        };
        fakeFs.store.refreshTokens = {
            'rt-1': { exists: true, data: { userId: 'user-1' } },
            'rt-2': { exists: true, data: { userId: 'user-2' } },
        };
        fakeFs.store.refreshTokenFamilies = {
            'fam-1': { exists: true, data: { userId: 'user-1' } },
            'fam-2': { exists: true, data: { userId: 'user-2' } },
        };

        await deleteAllUserSessions('user-1');

        // user-1 records should be deleted
        expect(fakeFs.store.sessions['sess-1'].exists).toBe(false);
        expect(fakeFs.store.sessions['sess-3'].exists).toBe(false);
        expect(fakeFs.store.refreshTokens['rt-1'].exists).toBe(false);
        expect(fakeFs.store.refreshTokenFamilies['fam-1'].exists).toBe(false);

        // user-2 records should remain
        expect(fakeFs.store.sessions['sess-2'].exists).toBe(true);
        expect(fakeFs.store.refreshTokens['rt-2'].exists).toBe(true);
        expect(fakeFs.store.refreshTokenFamilies['fam-2'].exists).toBe(true);
    });
});
