import { User, UserEncryptedData } from '../../../core/types';
import { UserDataSecurity } from '../domain/UserDataSecurity';
import { getUserDoc, getUserWithFieldMask } from '../infrastructure/UserRepository';

export const getUser = async (userId: string): Promise<User> => {
    const doc = await getUserDoc(userId);
    return doc.data() as User;
};

export const getUserMfaState = async (userId: string): Promise<{ mfaEnabled: boolean }> => {
    const doc = await getUserWithFieldMask(userId, ['mfaEnabled']);
    return { mfaEnabled: doc.get('mfaEnabled') === true };
};

export const getEncryptedUser = async (userId: string): Promise<UserEncryptedData> => {
    const doc = await getUserWithFieldMask(userId, ['dekPassword', 'dekSeed', 'keys']);
    return UserDataSecurity.sanitizeUserEncryptedData(doc.data());
};

