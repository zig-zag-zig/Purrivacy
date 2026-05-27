import { BadRequestError } from '../../../utils/errors';

const requireBodyValue = (body: any, field: string): unknown => {
    const value = body?.[field];
    if (!value) {
        throw new BadRequestError(`${field} is required`);
    }

    return value;
};

export const parseCreateUserRequest = (body: any): unknown => {
    const userData = body?.userData ?? body?.user;
    if (!userData) {
        throw new BadRequestError('userData is required');
    }

    return userData;
};

export const parseUpdateKeysRequest = (body: any): unknown => {
    return requireBodyValue(body, 'keys');
};

export const parseChangePasswordRequest = (body: any): unknown => {
    return requireBodyValue(body, 'dekPassword');
};

export const parseSavePushTokenRequest = (
    body: any,
    deviceId?: string,
): { pushToken: string; deviceId: string } => {
    const pushToken = requireBodyValue(body, 'pushToken');
    if (typeof pushToken !== 'string') {
        throw new BadRequestError('pushToken must be a string');
    }

    if (typeof deviceId !== 'string' || !deviceId.trim()) {
        throw new BadRequestError('x-device-id in header is required');
    }

    return { pushToken, deviceId };
};

export const parseDeletePushTokenRequest = (body: any): string => {
    const pushToken = requireBodyValue(body, 'pushToken');
    if (typeof pushToken !== 'string') {
        throw new BadRequestError('pushToken must be a string');
    }

    return pushToken;
};
