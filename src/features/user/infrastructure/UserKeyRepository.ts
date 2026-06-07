import {
    EncryptedPayload,
    EncryptedKeyRecordWithId,
} from '../../../core/types';
import { NotFoundError } from '../../../utils/errors';
import { EncryptedUserDataValidator } from '../domain/EncryptedUserDataValidator';
import {
    assertUserKeyRecordId,
    getUserKeysRef,
    USER_KEY_ITEMS_CHILD,
} from './userKeys/userKeyRefs';
import {
    createEmptyUserEncryptedKeyRecordSet,
    sanitizeUserEncryptedKeyItems,
    sanitizeUserEncryptedKeyRecordSet,
    toEncryptedKeyRecords,
    UserEncryptedKeysRecordSet,
} from './userKeys/userKeyRecordSet';

const readUserEncryptedKeyRecordSetFromDb = async (
    userId: string,
): Promise<UserEncryptedKeysRecordSet> => {
    const ref = getUserKeysRef(userId);
    const snapshot = await ref.get();
    const value = snapshot.val();

    if (value === null) {
        const empty = createEmptyUserEncryptedKeyRecordSet();
        await ref.set(empty);
        return empty;
    }

    return sanitizeUserEncryptedKeyRecordSet(value);
};

const refreshUserKeyCount = async (userId: string): Promise<number> => {
    const ref = getUserKeysRef(userId);
    const itemsSnapshot = await ref.child(USER_KEY_ITEMS_CHILD).get();
    const items = sanitizeUserEncryptedKeyItems(itemsSnapshot.val());
    const count = Object.keys(items).length;
    await ref.child('count').set(count);
    return count;
};

const readUserEncryptedKeyRecords = async (
    userId: string,
): Promise<EncryptedKeyRecordWithId[]> => {
    const value = await readUserEncryptedKeyRecordSetFromDb(userId);

    return toEncryptedKeyRecords(value.items);
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
): Promise<EncryptedPayload[]> => {
    const records = await readUserEncryptedKeyRecords(userId);
    return records.map(record => record.key);
};

export const initializeUserEncryptedKeyRecords = async (
    userId: string,
    keys: EncryptedPayload[] = [],
): Promise<EncryptedKeyRecordWithId[]> => {
    const ref = getUserKeysRef(userId);
    const sanitizedKeys = EncryptedUserDataValidator.sanitizeEncryptedKeys(keys);
    const itemsRef = ref.child(USER_KEY_ITEMS_CHILD);
    const items: Record<string, EncryptedPayload> = {};

    for (const key of sanitizedKeys) {
        const recordId = itemsRef.push().key;
        if (!recordId) {
            throw new Error('Failed to generate key record id');
        }
        assertUserKeyRecordId(recordId);
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
    key: EncryptedPayload,
): Promise<EncryptedKeyRecordWithId> => {
    await readUserEncryptedKeyRecordSetFromDb(userId);

    const sanitized = EncryptedUserDataValidator.sanitizeEncryptedKeyRecord(key, 'key');
    const ref = getUserKeysRef(userId);
    const recordRef = ref.child(USER_KEY_ITEMS_CHILD).push();
    const recordId = recordRef.key;
    if (!recordId) {
        throw new Error('Failed to generate key record id');
    }

    assertUserKeyRecordId(recordId);
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
    key: EncryptedPayload,
): Promise<EncryptedKeyRecordWithId> => {
    assertUserKeyRecordId(recordId);
    await readUserEncryptedKeyRecordSetFromDb(userId);

    const sanitized = EncryptedUserDataValidator.sanitizeEncryptedKeyRecord(key, 'key');
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
    assertUserKeyRecordId(recordId);
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
