import { AuthErrorDetails } from '../../../core/types';
import { AuthError } from '../../../utils/errors';

export const getInvalidMfaError = (isSensitive: boolean): AuthError => {
    const authErrorResponse: AuthErrorDetails = {
        wrongMfaCode: true,
    };
    if (isSensitive) {
        authErrorResponse.mfaRequiredSensitive = true;
    } else {
        authErrorResponse.mfaRequired = true;
    }
    return new AuthError('Invalid MFA code', authErrorResponse, 403);
};

