import { Router } from 'express';
import { UserService } from '../application/UserService';
import { authenticate, verifySensitiveMfa } from '../../../api/middleware/authMiddleware';
import { asyncHandler } from '../../../utils/asyncHandler';
import { ResponseUtils } from '../../../utils/responseUtils';
import { rateLimiter } from '../../../api/middleware/rateLimiter';
import {
    parseChangePasswordRequest,
    parseCreateUserRequest,
    parseDeletePushTokenRequest,
    parseSavePushTokenRequest,
    parseUpdateKeysRequest,
} from './userRequests';

const router = Router();


// Get user data
router.get('', authenticate('session'), rateLimiter.authenticatedRead, asyncHandler(async (req: any, res) => {
    const userId = req.userId;
    const user = await UserService.getEncryptedUser(userId);
    ResponseUtils.success(res, user);
}));

// Create a new user before the backend session exists.
router.post('', authenticate('firebase'), rateLimiter.authenticatedWrite, asyncHandler(async (req: any, res) => {
    const userData = parseCreateUserRequest(req.body);
    const response = await UserService.createUser(userData, req.userId);
    ResponseUtils.success(res, response, 201);
}));

// Update user keys
router.post('/update-keys', authenticate('session'), rateLimiter.authenticatedWrite, asyncHandler(async (req: any, res) => {
    const keys = parseUpdateKeysRequest(req.body);
    const response = await UserService.updateField(req.userId, "keys", keys);
    ResponseUtils.success(res, response);
}));

// Change DEK password
router.post('/change-password', authenticate('session'), rateLimiter.mfaVerification, verifySensitiveMfa, rateLimiter.sensitiveOperations, asyncHandler(async (req: any, res) => {
    const dekPassword = parseChangePasswordRequest(req.body);
    const response = await UserService.updateField(req.userId, "dekPassword", dekPassword);
    ResponseUtils.success(res, response);
}));

// Delete user
router.delete('', authenticate('session'), rateLimiter.mfaVerification, verifySensitiveMfa, rateLimiter.sensitiveOperations, asyncHandler(async (req: any, res) => {
    await UserService.deleteUser(req.userId);
    ResponseUtils.noContent(res);
}));

// Save push token
router.post('/save-push-token', authenticate('session'), rateLimiter.authenticatedWrite, asyncHandler(async (req: any, res) => {
    const { deviceId, pushToken } = parseSavePushTokenRequest(req.body, req.deviceId);
    await UserService.savePushToken(req.userId, deviceId, pushToken);
    ResponseUtils.noContent(res);
}));

// Delete push token
router.post('/delete-push-token', authenticate('firebase'), rateLimiter.authenticatedWrite, asyncHandler(async (req: any, res) => {
    const pushToken = parseDeletePushTokenRequest(req.body);
    await UserService.deletePushToken(req.userId, pushToken);
    ResponseUtils.noContent(res);
}));

export default router;
