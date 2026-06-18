import { createFakeFirestore } from '../../../../helpers/fakeFirestore';

const fakeFs = createFakeFirestore();

jest.mock('../../../../../src/infrastructure/firebase/index.js', () => ({
    db: fakeFs.db,
}));

const loadModule = (): typeof import('../../../../../src/features/mfa/application/expiredMfaSetupCleanup') => (
    require('../../../../../src/features/mfa/application/expiredMfaSetupCleanup')
);

const ts = (date: Date) => ({ toDate: () => date });

describe('cleanupExpiredMfaSetups', () => {
    beforeEach(() => {
        fakeFs.reset();
    });

    it('removes expired MFA setup documents while keeping active ones', async () => {
        const now = new Date();
        const past = new Date(now.getTime() - 3600_000);
        const future = new Date(now.getTime() + 3600_000);

        fakeFs.store.mfaSetup = {
            'user-1': { exists: true, data: { expiresAt: ts(past) } },
            'user-2': { exists: true, data: { expiresAt: ts(future) } },
            'user-3': { exists: true, data: { expiresAt: ts(past) } },
        };

        const { cleanupExpiredMfaSetups } = loadModule();
        const count = await cleanupExpiredMfaSetups();

        expect(count).toBe(2);
        expect(fakeFs.store.mfaSetup['user-1'].exists).toBe(false);
        expect(fakeFs.store.mfaSetup['user-2'].exists).toBe(true);
        expect(fakeFs.store.mfaSetup['user-3'].exists).toBe(false);
    });

    it('returns 0 when nothing is expired', async () => {
        const future = new Date(Date.now() + 3600_000);
        fakeFs.store.mfaSetup = {
            'user-1': { exists: true, data: { expiresAt: ts(future) } },
        };

        const { cleanupExpiredMfaSetups } = loadModule();
        const count = await cleanupExpiredMfaSetups();

        expect(count).toBe(0);
        expect(fakeFs.store.mfaSetup['user-1'].exists).toBe(true);
    });
});
