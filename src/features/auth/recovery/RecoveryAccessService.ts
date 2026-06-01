import { auth, db } from '../../../infrastructure/firebase';
import { UsernameIdentity } from '../identity/UsernameIdentity';
import { UserDataSecurity } from '../../user/domain/UserDataSecurity';
import { UserRecoveryEncryptedData } from '../../../core/types';
import { BadRequestError } from '../../../utils/errors';
import { CryptoUtils } from '../../../utils/cryptoUtils';

const FAKE_SALT_BYTES = 16;
const RECOVERY_VERIFIER_RE = /^[0-9a-f]{64}$/i;

export class RecoveryAccessService {
    private static usersCollection = db.collection('users');

    private static async getUserByUsername(username: string) {
        try {
            return await auth.getUserByEmail(UsernameIdentity.toFirebaseEmail(username));
        } catch {
            return null;
        }
    }

    private static fakeSalt(username: string): string {
        return CryptoUtils.sha256(`recovery:${username}`).slice(0, FAKE_SALT_BYTES * 2);
    }

    static async getChallenge(usernameInput: unknown): Promise<{ recoveryVerifierSalt: string }> {
        const username = UsernameIdentity.normalizeUsername(usernameInput);
        const user = await this.getUserByUsername(username);
        if (!user) {
            return { recoveryVerifierSalt: this.fakeSalt(username) };
        }

        const [doc] = await db.getAll(this.usersCollection.doc(user.uid), { fieldMask: ['recoveryVerifierSalt'] });
        const recoveryVerifierSalt = doc.exists ? doc.get('recoveryVerifierSalt') : null;
        if (typeof recoveryVerifierSalt !== 'string' || recoveryVerifierSalt.trim().length === 0) {
            return { recoveryVerifierSalt: this.fakeSalt(username) };
        }

        return { recoveryVerifierSalt };
    }

    static async createRecoveryToken(
        usernameInput: unknown,
        recoveryVerifierInput: unknown
    ): Promise<{ userId: string; userEncrypted: UserRecoveryEncryptedData; tempToken: string }> {
        const username = UsernameIdentity.normalizeUsername(usernameInput);
        if (typeof recoveryVerifierInput !== 'string' || !RECOVERY_VERIFIER_RE.test(recoveryVerifierInput)) {
            throw new BadRequestError('Invalid recovery credentials');
        }

        const user = await this.getUserByUsername(username);
        if (!user) {
            throw new BadRequestError('Invalid recovery credentials');
        }

        const [doc] = await db.getAll(this.usersCollection.doc(user.uid), {
            fieldMask: ['dekSeed', 'recoveryVerifierHash'],
        });
        if (!doc.exists) {
            throw new BadRequestError('Invalid recovery credentials');
        }

        const expectedHash = doc.get('recoveryVerifierHash');
        const incomingHash = CryptoUtils.sha256(recoveryVerifierInput.toLowerCase());
        if (typeof expectedHash !== 'string' || !CryptoUtils.timingSafeEqual(expectedHash, incomingHash)) {
            throw new BadRequestError('Invalid recovery credentials');
        }

        const userEncrypted = {
            dekSeed: UserDataSecurity.sanitizeEncryption(doc.get('dekSeed'), 'dekSeed'),
        };
        const tempToken = await auth.createCustomToken(user.uid, { signInMethod: 'customToken' });

        return {
            userId: user.uid,
            userEncrypted,
            tempToken,
        };
    }
}
