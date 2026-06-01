import { EncryptionBase } from '../../../core/types';
import { rtdb } from '../../../infrastructure/firebase/index.js';
import { assertRtdbKey, encodeRtdbKeySegment } from '../../../infrastructure/firebase/rtdbKeys.js';
import { isPlainObject } from '../../../infrastructure/firebase/utils.js';
import { UserDataSecurity } from '../domain/UserDataSecurity';

const USER_KEYS_ROOT = 'userKeys';
const USER_KEY_ITEMS_CHILD = 'items';
const KEY_SLOT_WIDTH = 6;

const getUserKeysRef = (userId: string) => {
    const encodedUserId = encodeRtdbKeySegment(userId);
    assertRtdbKey('encodedUserId', encodedUserId);
    return rtdb.ref(`${USER_KEYS_ROOT}/${encodedUserId}`);
};

const keySlotForIndex = (index: number): string => (
    index.toString().padStart(KEY_SLOT_WIDTH, '0')
);

export const encryptedKeysToRtdbItems = (
    keys: EncryptionBase[],
): Record<string, EncryptionBase> => (
    keys.reduce<Record<string, EncryptionBase>>((items, key, index) => {
        items[keySlotForIndex(index)] = key;
        return items;
    }, {})
);

export const rtdbItemsToEncryptedKeyValues = (value: unknown): unknown[] => {
    if (!isPlainObject(value)) {
        return [];
    }

    return Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([, key]) => key);
};

export const readUserEncryptedKeys = async (
    userId: string,
): Promise<EncryptionBase[]> => {
    const snapshot = await getUserKeysRef(userId).get();
    const value = snapshot.val();
    if (value === null) {
        return [];
    }

    if (!isPlainObject(value)) {
        return [];
    }

    return UserDataSecurity.sanitizeEncryptedKeys(
        rtdbItemsToEncryptedKeyValues(value[USER_KEY_ITEMS_CHILD]),
    );
};

export const replaceUserEncryptedKeys = async (
    userId: string,
    keys: EncryptionBase[],
): Promise<EncryptionBase[]> => {
    const sanitizedKeys = UserDataSecurity.sanitizeEncryptedKeys(keys);
    await getUserKeysRef(userId).set({
        count: sanitizedKeys.length,
        [USER_KEY_ITEMS_CHILD]: encryptedKeysToRtdbItems(sanitizedKeys),
        updatedAt: Date.now(),
    });

    return sanitizedKeys;
};

export const deleteUserEncryptedKeys = async (userId: string): Promise<void> => {
    await getUserKeysRef(userId).remove();
};
