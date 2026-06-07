import { BadRequestError } from '../../../utils/errors';
import {
    requireBodyString,
    requireBodyValue,
} from '../../../api/http/requestParsing';

export const parseCreateUserRequest = (body: unknown): unknown => {
    return requireBodyValue(body, 'userData');
};

export const parseKeyRecordRequest = (body: unknown): unknown => {
    return requireBodyValue(body, 'key');
};

export const parseKeyRecordIdParam = (recordId: unknown): string => {
    if (typeof recordId !== 'string' || recordId.trim().length === 0) {
        throw new BadRequestError('recordId is required');
    }

    return recordId;
};

export const parseChangePasswordRequest = (body: unknown): unknown => {
    return requireBodyValue(body, 'dekPassword');
};

export const parseSavePushTokenRequest = (
    body: unknown,
    deviceId?: string,
): { pushToken: string; deviceId: string } => {
    const pushToken = requireBodyString(body, 'pushToken');

    if (typeof deviceId !== 'string' || !deviceId.trim()) {
        throw new BadRequestError('X-Device-ID header is required');
    }

    return { pushToken, deviceId };
};

export const parseDeletePushTokenRequest = (body: unknown): string => {
    return requireBodyString(body, 'pushToken');
};
