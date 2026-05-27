import { db } from '../../../infrastructure/firebase';

const usersCollection = db.collection('users');

export const getUserRef = (userId: string) => {
    return usersCollection.doc(userId);
};

export const getMfaSecurityRef = (userId: string) => {
    return getUserRef(userId).collection('security').doc('mfa');
};

export const getMfaSetupRef = (userId: string) => {
    return db.collection('mfaSetup').doc(userId);
};

