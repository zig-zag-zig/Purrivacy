import { createFakeFirestore } from '../../../../helpers/fakeFirestore';

const fakeFs = createFakeFirestore();

jest.mock('../../../../../src/infrastructure/firebase/index.js', () => ({
    db: fakeFs.db,
}));

const loadModule = (): typeof import('../../../../../src/features/session/application/expiredSessionCleanup') => (
    require('../../../../../src/features/session/application/expiredSessionCleanup')
);

const ts = (date: Date) => ({ toDate: () => date });

describe('cleanupExpiredSessionRecords', () => {
    beforeEach(() => {
        fakeFs.reset();
    });

    it('removes expired sessions, tokens, and families while keeping active ones', async () => {
        const now = new Date();
        const past = new Date(now.getTime() - 3600_000);
        const future = new Date(now.getTime() + 3600_000);

        fakeFs.store.sessions = {
            'expired-session': { exists: true, data: { expiresAt: ts(past) } },
            'active-session': { exists: true, data: { expiresAt: ts(future) } },
        };
        fakeFs.store.refreshTokens = {
            'expired-rt': { exists: true, data: { expiresAt: ts(past) } },
        };
        fakeFs.store.refreshTokenFamilies = {
            'active-fam': { exists: true, data: { expiresAt: ts(future) } },
        };

        const { cleanupExpiredSessionRecords } = loadModule();
        const count = await cleanupExpiredSessionRecords();

        expect(count).toBe(2); // expired-session + expired-rt
        expect(fakeFs.store.sessions['expired-session'].exists).toBe(false);
        expect(fakeFs.store.sessions['active-session'].exists).toBe(true);
        expect(fakeFs.store.refreshTokens['expired-rt'].exists).toBe(false);
        expect(fakeFs.store.refreshTokenFamilies['active-fam'].exists).toBe(true);
    });

    it('returns 0 when nothing is expired', async () => {
        const future = new Date(Date.now() + 3600_000);
        fakeFs.store.sessions = { 's': { exists: true, data: { expiresAt: ts(future) } } };
        fakeFs.store.refreshTokens = { 'r': { exists: true, data: { expiresAt: ts(future) } } };
        fakeFs.store.refreshTokenFamilies = { 'f': { exists: true, data: { expiresAt: ts(future) } } };

        const { cleanupExpiredSessionRecords } = loadModule();
        const count = await cleanupExpiredSessionRecords();

        expect(count).toBe(0);
    });
});
