import {
    EncryptionBase,
    EncryptedKeyRecordWithId,
} from '../../../core/types';
import { rtdb } from '../../../infrastructure/firebase/index.js';
import { assertRtdbKey, encodeRtdbKeySegment } from '../../../infrastructure/firebase/rtdbKeys.js';
import { isPlainObject } from '../../../infrastructure/firebase/utils.js';
import { BadRequestError, NotFoundError } from '../../../utils/errors';
import { UserDataSecurity } from '../domain/UserDataSecurity';

const USER_KEYS_ROOT = 'userKeys';
const USER_KEY_ITEMS_CHILD = 'items';

type UserEncryptedKeysRecordSet = {
    count: number;
    items: Record<string, EncryptionBase>;
    updatedAt: number;
};

const assertRecordId = (recordId: string): void => {
    try {
        assertRtdbKey('recordId', recordId);
    } catch {
        throw new BadRequestError('recordId is not a valid key record id');
    }
};

const getUserKeysRef = (userId: string) => {
    const encodedUserId = encodeRtdbKeySegment(userId);
    assertRtdbKey('encodedUserId', encodedUserId);
    return rtdb.ref(`${USER_KEYS_ROOT}/${encodedUserId}`);
};

const emptyUserEncryptedKeys = (): UserEncryptedKeysRecordSet => ({
    count: 0,
    items: {},
    updatedAt: Date.now(),
});

const sanitizeItems = (
    value: unknown,
): Record<string, EncryptionBase> => {
    if (value === undefined || value === null) {
        return {};
    }

    if (!isPlainObject(value)) {
        throw new BadRequestError('User encrypted key items are invalid');
    }

    const items: Record<string, EncryptionBase> = {};
    for (const [recordId, key] of Object.entries(value)) {
        assertRecordId(recordId);
        items[recordId] = UserDataSecurity.sanitizeEncryptedKeyRecord(key, `keys.${recordId}`);
    }

    return items;
};

const readUserEncryptedKeyRecordSetFromDb = async (
    userId: string,
): Promise<UserEncryptedKeysRecordSet> => {
    const ref = getUserKeysRef(userId);
    const snapshot = await ref.get();
    const value = snapshot.val();

    if (value === null) {
        const empty = emptyUserEncryptedKeys();
        await ref.set(empty);
        return empty;
    }

    if (!isPlainObject(value)) {
        throw new BadRequestError('User encrypted keys are invalid');
    }

    const items = sanitizeItems(value[USER_KEY_ITEMS_CHILD]);

    return {
        count: Object.keys(items).length,
        items,
        updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : 0,
    };
};

const refreshUserKeyCount = async (userId: string): Promise<number> => {
    const ref = getUserKeysRef(userId);
    const itemsSnapshot = await ref.child(USER_KEY_ITEMS_CHILD).get();
    const items = sanitizeItems(itemsSnapshot.val());
    const count = Object.keys(items).length;
    await ref.child('count').set(count);
    return count;
};

export const readUserEncryptedKeyRecords = async (
    userId: string,
): Promise<EncryptedKeyRecordWithId[]> => {
    const value = await readUserEncryptedKeyRecordSetFromDb(userId);

    return Object.entries(value.items).map(([recordId, key]) => ({
        recordId,
        key,
    }));
};

export const readUserEncryptedKeyRecordSet = async (
    userId: string,
): Promise<{
    keys: EncryptedKeyRecordWithId[];
}> => ({
    keys: await readUserEncryptedKeyRecords(userId),
});

export const readUserEncryptedKeys = async (
    userId: string,
): Promise<EncryptionBase[]> => {
    const records = await readUserEncryptedKeyRecords(userId);
    return records.map(record => record.key);
};

export const initializeUserEncryptedKeyRecords = async (
    userId: string,
    keys: EncryptionBase[] = [],
): Promise<EncryptedKeyRecordWithId[]> => {
    const ref = getUserKeysRef(userId);
    const sanitizedKeys = UserDataSecurity.sanitizeEncryptedKeys(keys);
    const itemsRef = ref.child(USER_KEY_ITEMS_CHILD);
    const items: Record<string, EncryptionBase> = {};

    for (const key of sanitizedKeys) {
        const recordId = itemsRef.push().key;
        if (!recordId) {
            throw new Error('Failed to generate key record id');
        }
        assertRecordId(recordId);
        items[recordId] = key;
    }

    await ref.set({
        count: sanitizedKeys.length,
        items,
        updatedAt: Date.now(),
    } satisfies UserEncryptedKeysRecordSet);

    return Object.entries(items).map(([recordId, key]) => ({ recordId, key }));
};

export const addUserEncryptedKeyRecord = async (
    userId: string,
    key: EncryptionBase,
): Promise<EncryptedKeyRecordWithId> => {
    await readUserEncryptedKeyRecordSetFromDb(userId);

    const sanitized = UserDataSecurity.sanitizeEncryptedKeyRecord(key, 'key');
    const ref = getUserKeysRef(userId);
    const recordRef = ref.child(USER_KEY_ITEMS_CHILD).push();
    const recordId = recordRef.key;
    if (!recordId) {
        throw new Error('Failed to generate key record id');
    }

    assertRecordId(recordId);
    await ref.update({
        updatedAt: Date.now(),
        [`${USER_KEY_ITEMS_CHILD}/${recordId}`]: sanitized,
    });
    await refreshUserKeyCount(userId);

    return { recordId, key: sanitized };
};

export const updateUserEncryptedKeyRecord = async (
    userId: string,
    recordId: string,
    key: EncryptionBase,
): Promise<EncryptedKeyRecordWithId> => {
    assertRecordId(recordId);
    await readUserEncryptedKeyRecordSetFromDb(userId);

    const sanitized = UserDataSecurity.sanitizeEncryptedKeyRecord(key, 'key');
    const ref = getUserKeysRef(userId);
    const existingSnapshot = await ref.child(`${USER_KEY_ITEMS_CHILD}/${recordId}`).get();
    if (!existingSnapshot.exists()) {
        throw new NotFoundError('Key record not found');
    }

    await ref.update({
        updatedAt: Date.now(),
        [`${USER_KEY_ITEMS_CHILD}/${recordId}`]: sanitized,
    });

    return { recordId, key: sanitized };
};

export const deleteUserEncryptedKeyRecord = async (
    userId: string,
    recordId: string,
): Promise<void> => {
    assertRecordId(recordId);
    const value = await readUserEncryptedKeyRecordSetFromDb(userId);
    if (!value.items[recordId]) {
        throw new NotFoundError('Key record not found');
    }

    await getUserKeysRef(userId).update({
        updatedAt: Date.now(),
        [`${USER_KEY_ITEMS_CHILD}/${recordId}`]: null,
    });
    await refreshUserKeyCount(userId);
};

export const deleteUserEncryptedKeys = async (userId: string): Promise<void> => {
    await getUserKeysRef(userId).remove();
};
