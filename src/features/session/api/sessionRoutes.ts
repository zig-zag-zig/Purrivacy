import { Router } from 'express';
import { asyncHandler } from '../../../utils/asyncHandler';
import { ResponseUtils } from '../../../utils/responseUtils';
import { AuthSessionService } from '../application/AuthSessionService';
import { authenticate, verifySensitiveMfa } from '../../../api/middleware/authMiddleware';
import { SessionRevocationService } from '../application/SessionRevocationService';
import { SessionService } from '../application/SessionService';
import { rateLimiter } from '../../../api/middleware/rateLimiter';
import {
    requireAuthenticatedUserId,
    requireSessionFamilyId,
} from '../../../api/http/requestContext';
import { RecoveryAccessService } from '../../auth/recovery/RecoveryAccessService';
import {
    getBearerToken,
    parseCreateSessionRequest,
    parseRecoveryChallengeRequest,
    parseRecoveryTokenRequest,
    parseRefreshSessionRequest,
} from './sessionRequests';

const router = Router();

// Session creation endpoint
router.post('/session', rateLimiter.sessionCreationIp, authenticate('firebase'), rateLimiter.sessionCreation, asyncHandler(async (req, res) => {
    const { mfaCode, mfaTrusted, label, platform } = parseCreateSessionRequest(req.body);
    const { sessionResponse, newRecoveryCodes } = await AuthSessionService.createSession(requireAuthenticatedUserId(req), {
        mfaCode,
        mfaTrusted,
        label,
        platform,
        deviceId: req.deviceId,
    });

    ResponseUtils.success(res, {
        ...sessionResponse,
        ...(newRecoveryCodes ? { newRecoveryCodes } : {}),
    });
}));

// Session refresh endpoint
router.post('/session/refresh', rateLimiter.sessionRefresh, asyncHandler(async (req, res) => {
    const refreshToken = parseRefreshSessionRequest(req.body);
    const sessionResponse = await AuthSessionService.refreshSession(refreshToken, getBearerToken(req.headers.authorization));
    ResponseUtils.success(res, sessionResponse);
}));

router.post('/recovery/challenge', rateLimiter.authentication, asyncHandler(async (req, res) => {
    const username = parseRecoveryChallengeRequest(req.body);
    const challenge = await RecoveryAccessService.getChallenge(username);
    ResponseUtils.success(res, challenge);
}));

router.post('/recovery/token', rateLimiter.authentication, asyncHandler(async (req, res) => {
    const { username, recoveryVerifier } = parseRecoveryTokenRequest(req.body);
    const recoveryToken = await RecoveryAccessService.createRecoveryToken(username, recoveryVerifier);
    ResponseUtils.success(res, recoveryToken);
}));

// Revoke user tokens
router.post('/revoke-all-sessions', authenticate('session'), rateLimiter.mfaVerification, verifySensitiveMfa, rateLimiter.sensitiveOperations, asyncHandler(async (req, res) => {
    await SessionRevocationService.revokeAllUserSessions(requireAuthenticatedUserId(req), true);
    ResponseUtils.noContent(res);
}));

// Sign out - delete the current refresh-token family
router.post('/sign-out', authenticate('session'), rateLimiter.authenticatedWrite, asyncHandler(async (req, res) => {
    await SessionService.revokeFamily(requireSessionFamilyId(req), requireAuthenticatedUserId(req));
    ResponseUtils.noContent(res);
}));

export default router;
