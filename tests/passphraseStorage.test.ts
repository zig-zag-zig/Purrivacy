import { describe, expect, it, jest, beforeEach } from '@jest/globals';

jest.mock('../src/infrastructure/firebase', () => ({
    db: {
        collection: jest.fn().mockReturnThis(),
        doc: jest.fn().mockReturnThis(),
        getAll: jest.fn(),
        batch: jest.fn(),
    },
}));

jest.mock('../src/features/notification/application/NotificationService', () => ({
    NotificationService: {
        sendDataOnlyNotification: jest.fn(),
        sendDataOnlyNotificationSafe: jest.fn(),
    },
}));

jest.mock('../src/features/user/infrastructure/UserRepository', () => ({
    getUserRef: jest.fn(),
    getUserWithFieldMask: jest.fn(),
    getUserDoc: jest.fn(),
}));

import { UserService } from '../src/features/user/application/UserService';
import { NotificationService } from '../src/features/notification/application/NotificationService';
import { getUserRef, getUserWithFieldMask } from '../src/features/user/infrastructure/UserRepository';

describe('Passphrase storage sync', () => {
    let mockUpdate: jest.Mock;
    let mockRef: Record<string, unknown>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockUpdate = jest.fn<() => Promise<undefined>>().mockResolvedValue(undefined);
        mockRef = { update: mockUpdate };
        (getUserRef as jest.Mock).mockReturnValue(mockRef);
    });

    describe('setPassphraseStorage', () => {
        it('sets passphraseStorageEnabled on user document', async () => {
            await UserService.setPassphraseStorage('user-1', true, 'device-1');
            expect(mockUpdate).toHaveBeenCalledWith({ passphraseStorageEnabled: true });
        });

        it('clears stored passphrases when disabling', async () => {
            await UserService.setPassphraseStorage('user-1', false, 'device-1');
            expect(mockUpdate).toHaveBeenCalledWith({ passphraseStorageEnabled: false });
            expect(mockUpdate).toHaveBeenCalledWith({ passphraseStore: null });
        });

        it('sends FCM notification to other devices', async () => {
            await UserService.setPassphraseStorage('user-1', true, 'device-1');
            expect(NotificationService.sendDataOnlyNotificationSafe).toHaveBeenCalledWith(
                'user-1',
                'passphraseStorageChanged',
                'passphrase storage toggle',
                { enabled: true },
                { excludeDeviceId: 'device-1' },
            );
        });
    });

    describe('syncPassphrase', () => {
        it('stores passphrase at fingerprint path', async () => {
            await UserService.syncPassphrase('user-1', 'fp-abc', 'secret', 'device-1');
            expect(mockUpdate).toHaveBeenCalledWith({ 'passphraseStore.fp-abc': 'secret' });
        });

        it('sends FCM notification with fingerprint and passphrase', async () => {
            await UserService.syncPassphrase('user-1', 'fp-abc', 'secret', 'device-1');
            expect(NotificationService.sendDataOnlyNotificationSafe).toHaveBeenCalledWith(
                'user-1',
                'passphraseSynced',
                'passphrase sync',
                { fingerprint: 'fp-abc', passphrase: 'secret' },
                { excludeDeviceId: 'device-1' },
            );
        });
    });

    describe('deleteStoredPassphrase', () => {
        it('removes passphrase at fingerprint path', async () => {
            await UserService.deleteStoredPassphrase('user-1', 'fp-abc', 'device-1');
            expect(mockUpdate).toHaveBeenCalledWith({ 'passphraseStore.fp-abc': null });
        });

        it('sends FCM notification with fingerprint', async () => {
            await UserService.deleteStoredPassphrase('user-1', 'fp-abc', 'device-1');
            expect(NotificationService.sendDataOnlyNotificationSafe).toHaveBeenCalledWith(
                'user-1',
                'passphraseDeleted',
                'passphrase delete',
                { fingerprint: 'fp-abc' },
                { excludeDeviceId: 'device-1' },
            );
        });
    });

    describe('getStoredPassphrases', () => {
        it('reads passphraseStore field from user document', async () => {
            const mockDoc = {
                exists: true,
                get: jest.fn().mockReturnValue({ 'fp-abc': 'secret1', 'fp-def': 'secret2' }),
                data: jest.fn(),
            };
            (getUserWithFieldMask as any).mockResolvedValueOnce(mockDoc);

            const result = await UserService.getStoredPassphrases('user-1');
            expect(getUserWithFieldMask).toHaveBeenCalledWith('user-1', ['passphraseStore']);
            expect(mockDoc.get).toHaveBeenCalledWith('passphraseStore');
            expect(result).toEqual({ 'fp-abc': 'secret1', 'fp-def': 'secret2' });
        });

        it('returns empty object when passphraseStore is null', async () => {
            const mockDoc = {
                exists: true,
                get: jest.fn().mockReturnValue(null),
                data: jest.fn(),
            };
            (getUserWithFieldMask as any).mockResolvedValueOnce(mockDoc);

            const result = await UserService.getStoredPassphrases('user-1');
            expect(result).toEqual({});
        });

        it('returns empty object when passphraseStore is not an object', async () => {
            const mockDoc = {
                exists: true,
                get: jest.fn().mockReturnValue('not-an-object'),
                data: jest.fn(),
            };
            (getUserWithFieldMask as any).mockResolvedValueOnce(mockDoc);

            const result = await UserService.getStoredPassphrases('user-1');
            expect(result).toEqual({});
        });
    });
});
