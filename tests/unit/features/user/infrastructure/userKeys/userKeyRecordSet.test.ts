import {
    createEmptyUserEncryptedKeyRecordSet,
    sanitizeUserEncryptedKeyItems,
    sanitizeUserEncryptedKeyRecordSet,
    toEncryptedKeyRecords,
} from '../../../../../../src/features/user/infrastructure/userKeys/userKeyRecordSet';
import { BadRequestError } from '../../../../../../src/utils/errors';

// Need this mock because userKeyRecordSet imports userKeyRefs which imports firebase
jest.mock('../../../../../../src/infrastructure/firebase/index.js', () => ({
    rtdb: { ref: jest.fn() },
}), { virtual: true });

const validPayload = (suffix: string) => ({
    encryptedData: Buffer.from(`payload-${suffix}`, 'utf8').toString('base64'),
    iv: 'a'.repeat(24),
    tag: 'b'.repeat(32),
});

describe('userKeyRecordSet', () => {
    describe('createEmptyUserEncryptedKeyRecordSet', () => {
        it('returns count 0 and empty items', () => {
            const set = createEmptyUserEncryptedKeyRecordSet();
            expect(set.count).toBe(0);
            expect(set.items).toEqual({});
            expect(typeof set.updatedAt).toBe('number');
        });
    });

    describe('sanitizeUserEncryptedKeyItems', () => {
        it('returns empty object for undefined', () => {
            expect(sanitizeUserEncryptedKeyItems(undefined)).toEqual({});
        });

        it('returns empty object for null', () => {
            expect(sanitizeUserEncryptedKeyItems(null)).toEqual({});
        });

        it('throws for non-object values', () => {
            expect(() => sanitizeUserEncryptedKeyItems('string')).toThrow(BadRequestError);
            expect(() => sanitizeUserEncryptedKeyItems(123)).toThrow(BadRequestError);
        });

        it('throws for array values', () => {
            expect(() => sanitizeUserEncryptedKeyItems([1, 2, 3])).toThrow(BadRequestError);
        });

        it('sanitizes valid key records and validates record IDs', () => {
            const items = sanitizeUserEncryptedKeyItems({
                validKey: validPayload('AA'),
            });
            expect(items.validKey).toEqual(validPayload('AA'));
        });

        it('throws for invalid record IDs', () => {
            expect(() => sanitizeUserEncryptedKeyItems({
                'bad.key': validPayload('AA'),
            })).toThrow(BadRequestError);
        });
    });

    describe('sanitizeUserEncryptedKeyRecordSet', () => {
        it('throws for non-object', () => {
            expect(() => sanitizeUserEncryptedKeyRecordSet(null)).toThrow(BadRequestError);
        });

        it('derives count from items length', () => {
            const set = sanitizeUserEncryptedKeyRecordSet({
                items: { k1: validPayload('1'), k2: validPayload('2') },
                updatedAt: 1000,
            });
            expect(set.count).toBe(2);
            expect(set.updatedAt).toBe(1000);
        });

        it('defaults updatedAt to 0 when not a number', () => {
            const set = sanitizeUserEncryptedKeyRecordSet({
                items: {},
                updatedAt: 'invalid',
            });
            expect(set.updatedAt).toBe(0);
        });
    });

    describe('toEncryptedKeyRecords', () => {
        it('converts items record to array of EncryptedKeyRecordWithId', () => {
            const p1 = validPayload('AA');
            const p2 = validPayload('BB');
            const records = toEncryptedKeyRecords({
                k1: p1,
                k2: p2,
            });
            expect(records).toEqual([
                { recordId: 'k1', key: p1 },
                { recordId: 'k2', key: p2 },
            ]);
        });

        it('returns empty array for empty items', () => {
            expect(toEncryptedKeyRecords({})).toEqual([]);
        });
    });
});
