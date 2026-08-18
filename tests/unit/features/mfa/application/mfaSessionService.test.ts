import { createFakeFirestore } from '../../../../helpers/fakeFirestore';
import { injectStepFailures } from '../../../../helpers/failureInjection';
import { CryptoUtils } from '../../../../../src/utils/cryptoUtils';
import { AuthError, NotFoundError, TransitionError } from '../../../../../src/utils/errors';
import { SessionResponse } from '../../../../../src/core/types';

const fakeFs = createFakeFirestore();

jest.mock('../../../../../src/infrastructure/firebase/index.js', () => ({
    db: fakeFs.db,
}));

jest.mock('../../../../../src/features/mfa/application/MfaService', () => ({
    MfaService: {
        verifyAndEnableMfa: jest.fn(),
        disableMfa: jest.fn(),
        verifyMfaCode: jest.fn(),
    },
}));

jest.mock('../../../../../src/features/session/application/SessionService', () => ({
    SessionService: {
        createSession: jest.fn(),
        revokeFamily: jest.fn(),
        setFamilyMfaTrust: jest.fn(),
        markFamilyMfaVerified: jest.fn(),
    },
}));

jest.mock('../../../../../src/features/session/application/SessionRevocationService', () => ({
    SessionRevocationService: { revokeAllUserSessions: jest.fn() },
}));

jest.mock('../../../../../src/features/user/application/UserService', () => ({
    UserService: { getUserMfaState: jest.fn() },
}));

const loadModule = (): typeof import('../../../../../src/features/mfa/application/MfaSessionService') => (
    require('../../../../../src/features/mfa/application/MfaSessionService')
);

const getMfaService = () => require('../../../../../src/features/mfa/application/MfaService').MfaService;
const getSessionService = () => require('../../../../../src/features/session/application/SessionService').SessionService;
const getRevocationService = () => require('../../../../../src/features/session/application/SessionRevocationService').SessionRevocationService;
const getUserService = () => require('../../../../../src/features/user/application/UserService').UserService;

const sessionResponse: SessionResponse = {
    accessToken: 'at', refreshToken: 'rt', accessTokenExpiresAt: 'x', refreshTokenExpiresAt: 'y',
    mfaTrusted: true, mfaEnabled: true, sessionFamilyId: 'fam-new',
};

const enableDocId = CryptoUtils.sha256('mfa-enable:user-1');
const disableDocId = CryptoUtils.sha256('mfa-disable:user-1');

const getStepTargets = (): Array<{ target: Record<string, unknown>; property: string }> => ([
    { target: getSessionService() as unknown as Record<string, unknown>, property: 'createSession' },
    { target: getMfaService() as unknown as Record<string, unknown>, property: 'verifyAndEnableMfa' },
    { target: getMfaService() as unknown as Record<string, unknown>, property: 'disableMfa' },
    { target: getRevocationService() as unknown as Record<string, unknown>, property: 'revokeAllUserSessions' },
]);

const seedCrashedEnable = async (): Promise<void> => {
    // Simulate a process crash after createSession committed but before the
    // MFA enable step completed (no compensation ran).
    const { MfaTransitionStore } = require('../../../../../src/features/mfa/application/mfaTransitionStore');
    const store = new MfaTransitionStore('mfa-enable:user-1', 'user-1');
    await store.complete('createSession', sessionResponse);
};

// injectStepFailures replaces module-namespace properties in place, so each
// test must start from fresh jest.fn() instances.
const resetMock = (obj: unknown, property: string): void => {
    (obj as Record<string, unknown>)[property] = jest.fn();
};

const resetAllMocks = (): void => {
    resetMock(getSessionService(), 'createSession');
    resetMock(getSessionService(), 'revokeFamily');
    resetMock(getSessionService(), 'setFamilyMfaTrust');
    resetMock(getSessionService(), 'markFamilyMfaVerified');
    resetMock(getMfaService(), 'verifyAndEnableMfa');
    resetMock(getMfaService(), 'disableMfa');
    resetMock(getMfaService(), 'verifyMfaCode');
    resetMock(getRevocationService(), 'revokeAllUserSessions');
    resetMock(getUserService(), 'getUserMfaState');
};

describe('MfaSessionService', () => {
    beforeEach(() => {
        fakeFs.reset();
        jest.clearAllMocks();
        resetAllMocks();
    });

    describe('enableMfaAndCreateSession', () => {
        it('creates the new session first, enables MFA, then revokes old sessions (excluding the new family)', async () => {
            getUserService().getUserMfaState.mockResolvedValue({ mfaEnabled: false });
            getMfaService().verifyAndEnableMfa.mockResolvedValue(true);
            getSessionService().createSession.mockResolvedValue(sessionResponse);
            getRevocationService().revokeAllUserSessions.mockResolvedValue(undefined);
            const { MfaSessionService } = loadModule();

            const result = await MfaSessionService.enableMfaAndCreateSession('user-1', '123456', true, 'dev-1');

            expect(getSessionService().createSession).toHaveBeenCalledWith('user-1', {
                userHasMfa: true, mfaTrusted: true, deviceId: 'dev-1',
            });
            expect(getMfaService().verifyAndEnableMfa).toHaveBeenCalledWith('user-1', '123456', 'dev-1');
            expect(getRevocationService().revokeAllUserSessions).toHaveBeenCalledWith('user-1', false, {
                excludeFamilyId: 'fam-new',
            });
            expect(result).toEqual(sessionResponse);
            // The transition progress is cleared on success.
            expect(fakeFs.store.mfaTransitions[enableDocId].exists).toBe(false);
        });

        it('fails at session creation with no side effects and no compensation', async () => {
            getSessionService().createSession.mockRejectedValue(new Error('session creation failed'));
            getMfaService().verifyAndEnableMfa.mockResolvedValue(true);
            getRevocationService().revokeAllUserSessions.mockResolvedValue(undefined);
            const { MfaSessionService } = loadModule();

            await expect(MfaSessionService.enableMfaAndCreateSession('user-1', '123456', true, 'dev-1'))
                .rejects.toMatchObject({
                    details: { failedStep: 'createSession', retryable: true },
                });

            expect(getMfaService().verifyAndEnableMfa).not.toHaveBeenCalled();
            expect(getSessionService().revokeFamily).not.toHaveBeenCalled();
            expect(getRevocationService().revokeAllUserSessions).not.toHaveBeenCalled();
        });

        it('fails at the MFA step: rethrows the original error, compensates by revoking the new family, and clears progress', async () => {
            getUserService().getUserMfaState.mockResolvedValue({ mfaEnabled: false });
            getMfaService().verifyAndEnableMfa.mockRejectedValue(
                new AuthError('Invalid MFA code', { wrongMfaCode: true, mfaRequired: true }, 403),
            );
            getSessionService().createSession.mockResolvedValue(sessionResponse);
            getSessionService().revokeFamily.mockResolvedValue(undefined);
            getRevocationService().revokeAllUserSessions.mockResolvedValue(undefined);
            const { MfaSessionService } = loadModule();

            await expect(MfaSessionService.enableMfaAndCreateSession('user-1', '123456', true, 'dev-1'))
                .rejects.toMatchObject({ statusCode: 403, details: { wrongMfaCode: true } });

            // Compensation: the orphan session family is revoked, old
            // sessions are untouched, and the progress is cleared so a retry
            // starts fresh.
            expect(getSessionService().revokeFamily).toHaveBeenCalledWith('fam-new', 'user-1');
            expect(getRevocationService().revokeAllUserSessions).not.toHaveBeenCalled();
            expect(fakeFs.store.mfaTransitions[enableDocId].exists).toBe(false);

            // Retry after the user supplies the correct code creates a fresh session.
            getMfaService().verifyAndEnableMfa.mockResolvedValue(true);
            const result = await MfaSessionService.enableMfaAndCreateSession('user-1', '654321', true, 'dev-1');
            expect(result).toEqual(sessionResponse);
            expect(getSessionService().createSession).toHaveBeenCalledTimes(2);
        });

        it('fails at the revoke step: session and MFA state stay consistent, error is retryable, no compensation', async () => {
            getUserService().getUserMfaState.mockResolvedValue({ mfaEnabled: false });
            getMfaService().verifyAndEnableMfa.mockResolvedValue(true);
            getSessionService().createSession.mockResolvedValue(sessionResponse);
            const revokeMock = getRevocationService().revokeAllUserSessions.mockResolvedValue(undefined);
            injectStepFailures(
                getStepTargets(),
                { revokeAllUserSessions: 1 },
            );
            const { MfaSessionService } = loadModule();

            await expect(MfaSessionService.enableMfaAndCreateSession('user-1', '123456', true, 'dev-1'))
                .rejects.toMatchObject({
                    details: { failedStep: 'revokeOldSessions', retryable: true },
                });

            // The new session must survive — no compensation revocation.
            expect(getSessionService().revokeFamily).not.toHaveBeenCalled();
            // The injected failure threw before delegating, so no revocation
            // was performed by the first attempt.
            expect(revokeMock).not.toHaveBeenCalled();
        });

        it('retry after a revoke-step failure resumes: no duplicate session, no re-verification, same stored session returned', async () => {
            getUserService().getUserMfaState.mockResolvedValue({ mfaEnabled: false });
            getMfaService().verifyAndEnableMfa.mockResolvedValue(true);
            const createMock = getSessionService().createSession.mockResolvedValue(sessionResponse);
            const revokeMock = getRevocationService().revokeAllUserSessions.mockResolvedValue(undefined);
            injectStepFailures(
                getStepTargets(),
                { revokeAllUserSessions: 1 },
            );
            const { MfaSessionService } = loadModule();

            await expect(MfaSessionService.enableMfaAndCreateSession('user-1', '123456', true, 'dev-1'))
                .rejects.toThrow(TransitionError);

            const result = await MfaSessionService.enableMfaAndCreateSession('user-1', '123456', true, 'dev-1');

            expect(result).toEqual(sessionResponse);
            expect(createMock).toHaveBeenCalledTimes(1);
            expect(getMfaService().verifyAndEnableMfa).toHaveBeenCalledTimes(1);
            // Call 1 was the injected failure; call 2 (the resume) delegated.
            expect(revokeMock).toHaveBeenCalledTimes(1);
            expect(revokeMock).toHaveBeenCalledWith('user-1', false, { excludeFamilyId: 'fam-new' });
        });

        it('resumes a crashed enable (session created, MFA already enabled) by proving current MFA possession', async () => {
            await seedCrashedEnable();
            // The crashed attempt had committed MFA before dying.
            getUserService().getUserMfaState.mockResolvedValue({ mfaEnabled: true });
            getMfaService().verifyMfaCode.mockResolvedValue(undefined);
            getRevocationService().revokeAllUserSessions.mockResolvedValue(undefined);
            const { MfaSessionService } = loadModule();

            const result = await MfaSessionService.enableMfaAndCreateSession('user-1', '123456', true, 'dev-1');

            expect(result).toEqual(sessionResponse);
            expect(getSessionService().createSession).not.toHaveBeenCalled();
            expect(getMfaService().verifyAndEnableMfa).not.toHaveBeenCalled();
            expect(getMfaService().verifyMfaCode).toHaveBeenCalledWith('user-1', true, '123456');
            expect(getRevocationService().revokeAllUserSessions).toHaveBeenCalledWith('user-1', false, {
                excludeFamilyId: 'fam-new',
            });
        });

        it('fresh attempt on an already-enabled account keeps failing setup verification (no MFA-proof shortcut)', async () => {
            getUserService().getUserMfaState.mockResolvedValue({ mfaEnabled: true });
            getMfaService().verifyAndEnableMfa.mockRejectedValue(
                new NotFoundError('No MFA setup found. Please start setup again.'),
            );
            getSessionService().createSession.mockResolvedValue(sessionResponse);
            const { MfaSessionService } = loadModule();

            await expect(MfaSessionService.enableMfaAndCreateSession('user-1', '123456', true, 'dev-1'))
                .rejects.toMatchObject({
                    statusCode: 404,
                    message: 'No MFA setup found. Please start setup again.',
                });

            expect(getMfaService().verifyMfaCode).not.toHaveBeenCalled();
            expect(getSessionService().revokeFamily).toHaveBeenCalledWith('fam-new', 'user-1');
        });
    });

    describe('disableMfaAndCreateSession', () => {
        const disabledSession: SessionResponse = {
            ...sessionResponse, mfaTrusted: false, mfaEnabled: false,
        };

        it('creates the new session first, disables MFA, then revokes old sessions (excluding the new family)', async () => {
            getMfaService().disableMfa.mockResolvedValue(undefined);
            getSessionService().createSession.mockResolvedValue(disabledSession);
            getRevocationService().revokeAllUserSessions.mockResolvedValue(undefined);
            const { MfaSessionService } = loadModule();

            const result = await MfaSessionService.disableMfaAndCreateSession('user-1', 'dev-2');

            expect(getSessionService().createSession).toHaveBeenCalledWith('user-1', {
                userHasMfa: false, mfaTrusted: false, deviceId: 'dev-2',
            });
            expect(getMfaService().disableMfa).toHaveBeenCalledWith('user-1', 'dev-2');
            expect(getRevocationService().revokeAllUserSessions).toHaveBeenCalledWith('user-1', false, {
                excludeFamilyId: 'fam-new',
            });
            expect(result).toEqual(disabledSession);
            expect(fakeFs.store.mfaTransitions[disableDocId].exists).toBe(false);
        });

        it('fails at the disable step: rethrows the original error and compensates by revoking the new family', async () => {
            getMfaService().disableMfa.mockRejectedValue(new NotFoundError('disable failed'));
            getSessionService().createSession.mockResolvedValue(disabledSession);
            getSessionService().revokeFamily.mockResolvedValue(undefined);
            getRevocationService().revokeAllUserSessions.mockResolvedValue(undefined);
            const { MfaSessionService } = loadModule();

            await expect(MfaSessionService.disableMfaAndCreateSession('user-1', 'dev-2'))
                .rejects.toMatchObject({ statusCode: 404, message: 'disable failed' });

            expect(getSessionService().revokeFamily).toHaveBeenCalledWith('fam-new', 'user-1');
            expect(getRevocationService().revokeAllUserSessions).not.toHaveBeenCalled();
        });

        it('fails at the revoke step: retryable error, retry resumes and returns the same stored session', async () => {
            getMfaService().disableMfa.mockResolvedValue(undefined);
            const createMock = getSessionService().createSession.mockResolvedValue(disabledSession);
            const revokeMock = getRevocationService().revokeAllUserSessions.mockResolvedValue(undefined);
            injectStepFailures(
                getStepTargets(),
                { revokeAllUserSessions: 1 },
            );
            const { MfaSessionService } = loadModule();

            await expect(MfaSessionService.disableMfaAndCreateSession('user-1', 'dev-2'))
                .rejects.toMatchObject({
                    details: { failedStep: 'revokeOldSessions', retryable: true },
                });
            expect(getSessionService().revokeFamily).not.toHaveBeenCalled();

            const result = await MfaSessionService.disableMfaAndCreateSession('user-1', 'dev-2');

            expect(result).toEqual(disabledSession);
            expect(createMock).toHaveBeenCalledTimes(1);
            expect(getMfaService().disableMfa).toHaveBeenCalledTimes(1);
            // Call 1 was the injected failure; call 2 (the resume) delegated.
            expect(revokeMock).toHaveBeenCalledTimes(1);
        });
    });

    describe('manageSessionTrust', () => {
        it('delegates to SessionService.setFamilyMfaTrust', async () => {
            getSessionService().setFamilyMfaTrust.mockResolvedValue({ mfaTrusted: false });
            const { MfaSessionService } = loadModule();

            const result = await MfaSessionService.manageSessionTrust('user-1', 'fam-1', false);

            expect(getSessionService().setFamilyMfaTrust).toHaveBeenCalledWith('fam-1', 'user-1', false);
            expect(result).toEqual({ mfaTrusted: false });
        });
    });
});
