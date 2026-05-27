import { User, UserEncryptedData } from '../../../core/types';
import { createUser, deleteUser, updateUserField } from './userWrites';
import { deleteUserPushToken, saveUserPushToken } from './userPushTokens';
import { getEncryptedUser, getUser, getUserMfaState } from './userReads';

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
}

