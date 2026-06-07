import { Router } from 'express';
import { asyncHandler } from '../../../utils/asyncHandler';
import { ResponseUtils } from '../../../utils/responseUtils';
import { MfaService } from '../application/MfaService';
import { MfaSessionService } from '../application/MfaSessionService';
import { authenticate, verifySensitiveMfa } from '../../../api/middleware/authMiddleware';
import { rateLimiter } from '../../../api/middleware/rateLimiter';
import {
    requireAuthenticatedUserId,
    requireSessionFamilyId,
} from '../../../api/http/requestContext';
import {
    parseMfaEnableRequest,
    parseSessionTrustRequest,
} from './mfaRequests';

const router = Router();

// Setup MFA - generates secret and recovery codes
router.post('/setup', authenticate('session'), rateLimiter.sensitiveOperations, asyncHandler(async (req, res) => {
    const { secret, otpauthUrl, recoveryCodes } = await MfaService.setupMfa(requireAuthenticatedUserId(req));

    ResponseUtils.success(res, {
        secret,
        otpauthUrl,
        recoveryCodes,
        message: 'MFA setup initiated. Please verify with a code from your authenticator app to enable MFA.'
    });
}));

// Verify MFA code and enable MFA
router.post('/enable', authenticate('session'), rateLimiter.mfaVerification, rateLimiter.sensitiveOperations, asyncHandler(async (req, res) => {
    const { mfaCode, mfaTrusted } = parseMfaEnableRequest(req.body);
    const sessionResponse = await MfaSessionService.enableMfaAndCreateSession(requireAuthenticatedUserId(req), mfaCode, mfaTrusted, req.deviceId);
    ResponseUtils.success(res, sessionResponse);
}));

// Disable MFA using MFA code or recovery code
router.post('/disable', authenticate('session'), rateLimiter.mfaVerification, verifySensitiveMfa, rateLimiter.sensitiveOperations, asyncHandler(async (req, res) => {
    const sessionResponse = await MfaSessionService.disableMfaAndCreateSession(requireAuthenticatedUserId(req), req.deviceId);
    ResponseUtils.successWithRecoveryCodes(res, sessionResponse);
}));

// Manage MFA trust for the current session family.
router.post('/session/trust', authenticate('session'), rateLimiter.mfaVerification, verifySensitiveMfa, rateLimiter.sensitiveOperations, asyncHandler(async (req, res) => {
    const mfaTrusted = parseSessionTrustRequest(req.body);
    const sessionResponse = await MfaSessionService.manageSessionTrust(
        requireAuthenticatedUserId(req),
        requireSessionFamilyId(req),
        mfaTrusted,
    );
    ResponseUtils.successWithRecoveryCodes(res, sessionResponse);
}));

// Regenerate recovery codes
router.post('/recovery-codes/regenerate', authenticate('session'), rateLimiter.mfaVerification, verifySensitiveMfa, rateLimiter.sensitiveOperations, asyncHandler(async (req, res) => {
    const recoveryCodes = await MfaService.regenerateRecoveryCodes(requireAuthenticatedUserId(req));

    ResponseUtils.successWithRecoveryCodes(res, {
        recoveryCodes,
    });
}));

// Get remaining recovery codes count
router.get('/recovery-codes/remaining', authenticate('session'), rateLimiter.authenticatedRead, asyncHandler(async (req, res) => {
    const remainingCodes = await MfaService.getRemainingRecoveryCodes(requireAuthenticatedUserId(req));

    ResponseUtils.success(res, {
        remainingCodes,
    });
}));

export default router;
