import { db } from '../../../infrastructure/firebase';

const mfaSetupCollection = db.collection('mfaSetup');

export const getMfaSecurityRef = (userId: string) => {
    return db.collection('users').doc(userId).collection('security').doc('mfa');
};

export const getMfaSetupRef = (userId: string) => {
    return mfaSetupCollection.doc(userId);
};

export const getMfaSetupCollection = () => {
    return mfaSetupCollection;
};
