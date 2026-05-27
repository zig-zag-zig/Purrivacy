import { Router } from 'express';
import { asyncHandler } from '../../../utils/asyncHandler';
import { ResponseUtils } from '../../../utils/responseUtils';
import { MfaService } from '../application/MfaService';
import { MfaSessionService } from '../application/MfaSessionService';
import { authenticate, verifySensitiveMfa } from '../../../api/middleware/authMiddleware';
import { rateLimiter } from '../../../api/middleware/rateLimiter';
import {
    parseMfaEnableRequest,
    parseSessionTrustRequest,
} from './mfaRequests';

const router = Router();

// Setup MFA - generates secret and recovery codes
router.post('/setup', authenticate('session'), rateLimiter.sensitiveOperations, asyncHandler(async (req: any, res) => {
    const { secret, otpauthUrl, recoveryCodes } = await MfaService.setupMfa(req.userId);

    ResponseUtils.success(res, {
        secret,
        otpauthUrl,
        recoveryCodes,
        message: 'MFA setup initiated. Please verify with a code from your authenticator app to enable MFA.'
    });
}));

// Verify MFA code and enable MFA
router.post('/enable', authenticate('session'), rateLimiter.mfaVerification, rateLimiter.sensitiveOperations, asyncHandler(async (req: any, res) => {
    const { mfaCode, mfaTrusted } = parseMfaEnableRequest(req.body);
    const sessionResponse = await MfaSessionService.enableMfaAndCreateSession(req.userId, mfaCode, mfaTrusted, req.deviceId);
    ResponseUtils.success(res, sessionResponse);
}));

// Disable MFA using MFA code or recovery code
router.post('/disable', authenticate('session'), rateLimiter.mfaVerification, verifySensitiveMfa, rateLimiter.sensitiveOperations, asyncHandler(async (req: any, res) => {
    const sessionResponse = await MfaSessionService.disableMfaAndCreateSession(req.userId, req.deviceId);
    ResponseUtils.success(res, sessionResponse);
}));

// Manage MFA trust for the current session family.
router.post('/session/trust', authenticate('session'), rateLimiter.mfaVerification, verifySensitiveMfa, rateLimiter.sensitiveOperations, asyncHandler(async (req: any, res) => {
    const mfaTrusted = parseSessionTrustRequest(req.body);
    const sessionResponse = await MfaSessionService.manageSessionTrust(req.userId, req.sessionFamilyId, mfaTrusted);
    ResponseUtils.success(res, sessionResponse);
}));

// Regenerate recovery codes
router.post('/recovery-codes/regenerate', authenticate('session'), rateLimiter.mfaVerification, verifySensitiveMfa, rateLimiter.sensitiveOperations, asyncHandler(async (req: any, res) => {
    const recoveryCodes = await MfaService.regenerateRecoveryCodes(req.userId);

    ResponseUtils.success(res, {
        recoveryCodes,
    });
}));

// Get remaining recovery codes count
router.get('/recovery-codes/remaining', authenticate('session'), rateLimiter.authenticatedRead, asyncHandler(async (req: any, res) => {
    const remainingCodes = await MfaService.getRemainingRecoveryCodes(req.userId);

    ResponseUtils.success(res, {
        remainingCodes,
    });
}));

export default router;
