import { createFakeFirestore } from '../../../../helpers/fakeFirestore';

const fakeFs = createFakeFirestore();

jest.mock('../../../../../src/infrastructure/firebase/index.js', () => ({
    db: fakeFs.db,
}));

jest.mock('../../../../../src/features/mfa/application/MfaService', () => ({
    MfaService: { verifyAndEnableMfa: jest.fn(), disableMfa: jest.fn() },
}));

jest.mock('../../../../../src/features/session/application/SessionService', () => ({
    SessionService: {
        createSession: jest.fn(),
        rotateRefreshToken: jest.fn(),
        setFamilyMfaTrust: jest.fn(),
        markFamilyMfaVerified: jest.fn(),
    },
}));

jest.mock('../../../../../src/features/session/application/SessionRevocationService', () => ({
    SessionRevocationService: { revokeAllUserSessions: jest.fn() },
}));

const loadModule = (): typeof import('../../../../../src/features/mfa/application/MfaSessionService') => (
    require('../../../../../src/features/mfa/application/MfaSessionService')
);

const getMfaService = () => require('../../../../../src/features/mfa/application/MfaService').MfaService;
const getSessionService = () => require('../../../../../src/features/session/application/SessionService').SessionService;
const getRevocationService = () => require('../../../../../src/features/session/application/SessionRevocationService').SessionRevocationService;

const sessionResponse = {
    accessToken: 'at', refreshToken: 'rt', accessTokenExpiresAt: 'x', refreshTokenExpiresAt: 'y',
    mfaTrusted: true, mfaEnabled: true,
};

describe('MfaSessionService', () => {
    beforeEach(() => {
        fakeFs.reset();
        jest.clearAllMocks();
    });

    describe('enableMfaAndCreateSession', () => {
        it('verifies MFA, revokes all sessions, and creates a new MFA session', async () => {
            getMfaService().verifyAndEnableMfa.mockResolvedValue(true);
            getRevocationService().revokeAllUserSessions.mockResolvedValue(undefined);
            getSessionService().createSession.mockResolvedValue(sessionResponse);
            const { MfaSessionService } = loadModule();

            const result = await MfaSessionService.enableMfaAndCreateSession('user-1', '123456', true, 'dev-1');

            expect(getMfaService().verifyAndEnableMfa).toHaveBeenCalledWith('user-1', '123456', 'dev-1');
            expect(getRevocationService().revokeAllUserSessions).toHaveBeenCalledWith('user-1', false);
            expect(getSessionService().createSession).toHaveBeenCalledWith('user-1', {
                userHasMfa: true, mfaTrusted: true, deviceId: 'dev-1',
            });
            expect(result).toEqual(sessionResponse);
        });
    });

    describe('disableMfaAndCreateSession', () => {
        it('disables MFA, revokes sessions, and creates a non-MFA session', async () => {
            getMfaService().disableMfa.mockResolvedValue(undefined);
            getRevocationService().revokeAllUserSessions.mockResolvedValue(undefined);
            getSessionService().createSession.mockResolvedValue({ ...sessionResponse, mfaEnabled: false, mfaTrusted: false });
            const { MfaSessionService } = loadModule();

            const result = await MfaSessionService.disableMfaAndCreateSession('user-1', 'dev-2');

            expect(getMfaService().disableMfa).toHaveBeenCalledWith('user-1', 'dev-2');
            expect(getRevocationService().revokeAllUserSessions).toHaveBeenCalledWith('user-1', false);
            expect(getSessionService().createSession).toHaveBeenCalledWith('user-1', {
                userHasMfa: false, mfaTrusted: false, deviceId: 'dev-2',
            });
            expect(result.mfaEnabled).toBe(false);
            expect(result.mfaTrusted).toBe(false);
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
