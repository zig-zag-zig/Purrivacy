import { Request, Response, NextFunction } from 'express';
import { SessionService } from '../../features/session/application/SessionService';
import { AuthError } from '../../utils/errors';
import { MfaService } from '../../features/mfa/application/MfaService';
import { AuthSessionService } from '../../features/session/application/AuthSessionService';
import { UserService } from '../../features/user/application/UserService';
import { createLogger } from '../../utils/logger';

const logger = createLogger('api.auth');

/**
 * Express middleware for session-based authentication with optional MFA verification.
 */
export function authenticate(method: 'firebase' | 'session' | 'sessionSensitive') {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            if (method === "firebase") {
                const userId = await AuthSessionService.extractUserIdFromToken(req.headers.authorization);
                (req as any).userId = userId;
                next();
                return;
            }

            const accessToken = req.headers.authorization?.startsWith('Bearer ')
                ? req.headers.authorization.split('Bearer ')[1]
                : undefined;

            if (!accessToken) {
                throw new AuthError('Bearer access token was not provided', { sessionHeaderMissing: true }, 401);
            }

            const session = await SessionService.validateSession(accessToken);
            (req as any).userId = session.userId;
            (req as any).sessionFamilyId = session.refreshTokenFamilyId;

            try {
                (req as any).userData = await UserService.getUserMfaState(session.userId);
            } catch (error) {
                if ((error as any)?.statusCode === 404) {
                    await SessionService.deleteSession(accessToken);
                }
                throw error;
            }

            if (method === "session") {
                next();
                return;
            }

            await verifySensitiveMfa(req, res, next);
        } catch (error) {
            logger.warn('session authentication failed', {
                requestId: res.locals.requestId,
                path: req.path,
                method: req.method,
                error,
            });
            next(error);
        }
    };
}

export async function verifySensitiveMfa(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const userId = (req as any).userId;
        if (!userId) {
            throw new AuthError('Session authentication required', { sessionInvalid: true }, 401);
        }

        let userData = (req as any).userData;
        if (!userData) {
            userData = await UserService.getUserMfaState(userId);
            (req as any).userData = userData;
        }

        if (userData.mfaEnabled !== true) {
            next();
            return;
        }

        res.locals.newRecoveryCodes = await MfaService.verifyMfaCode(userId, true, req.body.mfaCode);
        const sessionFamilyId = (req as any).sessionFamilyId;
        if (sessionFamilyId) {
            await SessionService.markFamilyMfaVerified(sessionFamilyId, userId);
        }
        next();
    } catch (error) {
        logger.warn('sensitive mfa verification failed', {
            requestId: res.locals.requestId,
            path: req.path,
            method: req.method,
            userId: (req as any).userId,
            error,
        });
        next(error);
    }
}
