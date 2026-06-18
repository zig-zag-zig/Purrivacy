import { BadRequestError } from '../../../../../src/utils/errors';
import {
    parseCreateUserRequest,
    parseKeyRecordRequest,
    parseSavePushTokenRequest,
    parseDeletePushTokenRequest,
} from '../../../../../src/features/user/api/userRequests';
import { MAX_PUSH_TOKEN_LENGTH } from '../../../../../src/core/constants';

describe('userRequests', () => {
    describe('parseCreateUserRequest', () => {
        it('extracts userData from body', () => {
            const data = { dekPassword: {} };
            expect(parseCreateUserRequest({ userData: data })).toBe(data);
        });

        it('throws when userData is missing', () => {
            expect(() => parseCreateUserRequest({ user: {} })).toThrow(BadRequestError);
        });
    });

    describe('parseKeyRecordRequest', () => {
        it('extracts key from body', () => {
            const key = { encryptedData: 'x', iv: 'y', tag: 'z' };
            expect(parseKeyRecordRequest({ key })).toBe(key);
        });

        it('throws when key is missing', () => {
            expect(() => parseKeyRecordRequest({})).toThrow(BadRequestError);
        });
    });

    describe('parseSavePushTokenRequest', () => {
        it('returns pushToken and deviceId', () => {
            expect(parseSavePushTokenRequest({ pushToken: ' ExpoPushToken[test] ' }, ' device-1 ')).toEqual({
                pushToken: ' ExpoPushToken[test] ',
                deviceId: ' device-1 ',
            });
        });

        it('throws when pushToken is not a string', () => {
            expect(() => parseSavePushTokenRequest({ pushToken: 1 }, 'dev')).toThrow(BadRequestError);
        });

        it('throws when deviceId is empty or whitespace', () => {
            expect(() => parseSavePushTokenRequest({ pushToken: 'tok' }, '   ')).toThrow(BadRequestError);
        });
    });

    describe('parseDeletePushTokenRequest', () => {
        it('returns pushToken', () => {
            expect(parseDeletePushTokenRequest({ pushToken: 'tok' })).toBe('tok');
        });

        it('throws when pushToken is missing', () => {
            expect(() => parseDeletePushTokenRequest({})).toThrow(BadRequestError);
        });
    });
});
