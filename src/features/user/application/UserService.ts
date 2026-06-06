import {
    EncryptionBase,
    User,
    UserEncryptedData,
    UserEncryptedKeyRecordsResponse,
} from '../../../core/types';
import { createUser, deleteUser, updateUserField } from './userWrites';
import { deleteUserPushToken, saveUserPushToken } from './userPushTokens';
import { getEncryptedUser, getUser, getUserMfaState } from './userReads';
import {
    addUserEncryptedKeyRecord,
    deleteUserEncryptedKeyRecord,
    readUserEncryptedKeyRecordSet,
    updateUserEncryptedKeyRecord,
} from '../infrastructure/UserKeyRepository';

const flattenKeyRecord = (
    record: { recordId: string; key: EncryptionBase },
): EncryptionBase & { recordId: string } => ({
    recordId: record.recordId,
    ...record.key,
});

/**
 * Public facade for user feature use cases.
 */
export class UserService {
    static async getUser(userId: string): Promise<User> {
        return getUser(userId);
    }

    static async getUserMfaState(userId: string): Promise<{ mfaEnabled: boolean }> {
        return getUserMfaState(userId);
    }

    static async getEncryptedUser(userId: string): Promise<UserEncryptedData> {
        return getEncryptedUser(userId);
    }

    static async createUser(user: unknown, userId: string): Promise<{ success: boolean }> {
        return createUser(user, userId);
    }

    static async updateField(
        userId: string,
        fieldName: string,
        value: any,
    ): Promise<{ success: boolean }> {
        return updateUserField(userId, fieldName, value);
    }

    static async deleteUser(userId: string): Promise<void> {
        await deleteUser(userId);
    }

    static async savePushToken(
        userId: string,
        deviceId: string,
        pushToken: string,
    ): Promise<void> {
        await saveUserPushToken(userId, deviceId, pushToken);
    }

    static async deletePushToken(
        userId: string,
        pushToken: string,
    ): Promise<void> {
        await deleteUserPushToken(userId, pushToken);
    }

    static async getEncryptedKeyRecords(
        userId: string,
    ): Promise<UserEncryptedKeyRecordsResponse> {
        const recordSet = await readUserEncryptedKeyRecordSet(userId);
        return {
            keys: recordSet.keys.map(flattenKeyRecord),
        };
    }

    static async addEncryptedKeyRecord(
        userId: string,
        key: EncryptionBase,
    ): Promise<EncryptionBase & { recordId: string }> {
        return flattenKeyRecord(await addUserEncryptedKeyRecord(userId, key));
    }

    static async updateEncryptedKeyRecord(
        userId: string,
        recordId: string,
        key: EncryptionBase,
    ): Promise<EncryptionBase & { recordId: string }> {
        return flattenKeyRecord(await updateUserEncryptedKeyRecord(userId, recordId, key));
    }

    static async deleteEncryptedKeyRecord(
        userId: string,
        recordId: string,
    ): Promise<void> {
        await deleteUserEncryptedKeyRecord(userId, recordId);
    }
}
