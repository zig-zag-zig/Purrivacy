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
    parseKeyRecordIdParam,
    parseKeyRecordRequest,
    parseSavePushTokenRequest,
} from './userRequests';
import { UserDataSecurity } from '../domain/UserDataSecurity';

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

router.get('/key-records', authenticate('session'), rateLimiter.authenticatedRead, asyncHandler(async (req: any, res) => {
    const response = await UserService.getEncryptedKeyRecords(req.userId);
    ResponseUtils.success(res, response);
}));

router.post('/key-records', authenticate('session'), rateLimiter.authenticatedWrite, asyncHandler(async (req: any, res) => {
    const key = UserDataSecurity.sanitizeEncryptedKeyRecord(parseKeyRecordRequest(req.body), 'key');
    const response = await UserService.addEncryptedKeyRecord(req.userId, key);
    ResponseUtils.success(res, response, 201);
}));

router.put('/key-records/:recordId', authenticate('session'), rateLimiter.authenticatedWrite, asyncHandler(async (req: any, res) => {
    const recordId = parseKeyRecordIdParam(req.params.recordId);
    const key = UserDataSecurity.sanitizeEncryptedKeyRecord(parseKeyRecordRequest(req.body), 'key');
    const response = await UserService.updateEncryptedKeyRecord(req.userId, recordId, key);
    ResponseUtils.success(res, response);
}));

router.delete('/key-records/:recordId', authenticate('session'), rateLimiter.authenticatedWrite, asyncHandler(async (req: any, res) => {
    const recordId = parseKeyRecordIdParam(req.params.recordId);
    await UserService.deleteEncryptedKeyRecord(req.userId, recordId);
    ResponseUtils.noContent(res);
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
