import { Encryption, EncryptionBase, User, UserEncryptedData } from '../../../core/types';
import { BadRequestError } from '../../../utils/errors';

const MAX_KEYS_PER_USER = 200;
const MAX_ENCRYPTED_DATA_LENGTH = 1_000_000;
const HEX_RE = /^[0-9a-f]+$/i;
const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;
const RECOVERY_VERIFIER_SALT_BYTES = 16;
const RECOVERY_VERIFIER_HASH_BYTES = 32;

function assertRecord(value: unknown, name: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new BadRequestError(`${name} must be an object`);
    }

    return value as Record<string, unknown>;
}

function assertString(value: unknown, name: string, maxLength: number): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new BadRequestError(`${name} must be a non-empty string`);
    }

    if (value.length > maxLength) {
        throw new BadRequestError(`${name} is too large`);
    }

    return value;
}

function assertHex(value: unknown, name: string, expectedBytes: number): string {
    const stringValue = assertString(value, name, expectedBytes * 2);
    if (stringValue.length !== expectedBytes * 2 || !HEX_RE.test(stringValue)) {
        throw new BadRequestError(`${name} has an invalid format`);
    }

    return stringValue;
}

function assertBase64(value: unknown, name: string): string {
    const stringValue = assertString(value, name, MAX_ENCRYPTED_DATA_LENGTH);
    if (!BASE64_RE.test(stringValue) || stringValue.length % 4 !== 0) {
        throw new BadRequestError(`${name} has an invalid format`);
    }

    return stringValue;
}

export class UserDataSecurity {
    static sanitizeEncryptionBase(value: unknown, name: string): EncryptionBase {
        const record = assertRecord(value, name);

        return {
            encryptedData: assertBase64(record.encryptedData, `${name}.encryptedData`),
            iv: assertHex(record.iv, `${name}.iv`, 12),
            tag: assertHex(record.tag, `${name}.tag`, 16),
        };
    }

    static sanitizeEncryption(value: unknown, name: string): Encryption {
        const record = assertRecord(value, name);
        const base = UserDataSecurity.sanitizeEncryptionBase(record, name);

        return {
            ...base,
            salt: assertHex(record.salt, `${name}.salt`, 16),
        };
    }

    static sanitizeEncryptedKeys(value: unknown): EncryptionBase[] {
        if (!Array.isArray(value)) {
            throw new BadRequestError('keys must be an array');
        }

        if (value.length > MAX_KEYS_PER_USER) {
            throw new BadRequestError('Too many keys');
        }

        return value.map((key, index) => (
            UserDataSecurity.sanitizeEncryptionBase(key, `keys[${index}]`)
        ));
    }

    static sanitizeUserEncryptedData(value: unknown): UserEncryptedData {
        const record = assertRecord(value, 'userData');

        return {
            dekPassword: UserDataSecurity.sanitizeEncryption(record.dekPassword, 'dekPassword'),
            dekSeed: UserDataSecurity.sanitizeEncryption(record.dekSeed, 'dekSeed'),
            keys: UserDataSecurity.sanitizeEncryptedKeys(record.keys),
        };
    }

    static sanitizeUserForCreate(value: unknown): User {
        const record = assertRecord(value, 'userData');
        return {
            ...UserDataSecurity.sanitizeUserEncryptedData(record),
            recoveryVerifierSalt: assertHex(record.recoveryVerifierSalt, 'recoveryVerifierSalt', RECOVERY_VERIFIER_SALT_BYTES),
            recoveryVerifierHash: assertHex(record.recoveryVerifierHash, 'recoveryVerifierHash', RECOVERY_VERIFIER_HASH_BYTES),
            mfaEnabled: false,
        };
    }
}
