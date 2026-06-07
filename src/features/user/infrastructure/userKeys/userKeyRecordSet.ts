import {
    EncryptedKeyRecordWithId,
    EncryptedPayload,
} from '../../../../core/types';
import { isPlainObject } from '../../../../infrastructure/firebase/utils.js';
import { BadRequestError } from '../../../../utils/errors';
import { EncryptedUserDataValidator } from '../../domain/EncryptedUserDataValidator';
import {
    assertUserKeyRecordId,
    USER_KEY_ITEMS_CHILD,
} from './userKeyRefs';

export type UserEncryptedKeysRecordSet = {
    count: number;
    items: Record<string, EncryptedPayload>;
    updatedAt: number;
};

export const createEmptyUserEncryptedKeyRecordSet = (): UserEncryptedKeysRecordSet => ({
    count: 0,
    items: {},
    updatedAt: Date.now(),
});

export const sanitizeUserEncryptedKeyItems = (
    value: unknown,
): Record<string, EncryptedPayload> => {
    if (value === undefined || value === null) {
        return {};
    }

    if (!isPlainObject(value)) {
        throw new BadRequestError('User encrypted key items are invalid');
    }

    const items: Record<string, EncryptedPayload> = {};
    for (const [recordId, key] of Object.entries(value)) {
        assertUserKeyRecordId(recordId);
        items[recordId] = EncryptedUserDataValidator.sanitizeEncryptedKeyRecord(key, `keys.${recordId}`);
    }

    return items;
};

export const sanitizeUserEncryptedKeyRecordSet = (
    value: unknown,
): UserEncryptedKeysRecordSet => {
    if (!isPlainObject(value)) {
        throw new BadRequestError('User encrypted keys are invalid');
    }

    const items = sanitizeUserEncryptedKeyItems(value[USER_KEY_ITEMS_CHILD]);

    return {
        count: Object.keys(items).length,
        items,
        updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : 0,
    };
};

export const toEncryptedKeyRecords = (
    items: Record<string, EncryptedPayload>,
): EncryptedKeyRecordWithId[] => (
    Object.entries(items).map(([recordId, key]) => ({
        recordId,
        key,
    }))
);

