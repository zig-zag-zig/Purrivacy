import { createFakeRealtimeDatabase } from './helpers/fakeRealtimeDatabase';

const mockRealtimeDatabase = createFakeRealtimeDatabase();

jest.mock('../src/infrastructure/firebase/index.js', () => ({
  rtdb: mockRealtimeDatabase.rtdb,
}), { virtual: true });

const validEncrypted = (suffix: string) => ({
  encryptedData: Buffer.from(`payload-${suffix}`, 'utf8').toString('base64'),
  iv: 'a'.repeat(24),
  tag: 'b'.repeat(32),
});

const encodedUserId = (userId: string): string => Buffer.from(userId, 'utf8').toString('base64url');
const loadRepository = (): typeof import('../src/features/user/infrastructure/UserKeyRepository') => (
  require('../src/features/user/infrastructure/UserKeyRepository')
);

describe('UserKeyRepository', () => {
  beforeEach(() => {
    mockRealtimeDatabase.reset();
  });

  it('initializes missing user key storage as an empty record set', async () => {
    const repository = loadRepository();
    const userPath = encodedUserId('user-1');

    await expect(repository.readUserEncryptedKeyRecordSet('user-1')).resolves.toEqual({ keys: [] });
    expect(mockRealtimeDatabase.data.userKeys[userPath]).toMatchObject({
      count: 0,
      items: {},
    });
  });

  it('adds one key record without rewriting existing items', async () => {
    const repository = loadRepository();
    const userPath = encodedUserId('user-1');
    const existing = validEncrypted('AA');
    const next = validEncrypted('BB');
    mockRealtimeDatabase.data.userKeys = {
      [userPath]: {
        count: 1,
        items: { existing },
        updatedAt: 1,
      },
    };

    const result = await repository.addUserEncryptedKeyRecord('user-1', next);

    expect(result.recordId).toBe('push-1');
    expect(mockRealtimeDatabase.data.userKeys[userPath].items).toEqual({
      existing,
      'push-1': next,
    });
    expect(mockRealtimeDatabase.data.userKeys[userPath].count).toBe(2);
  });

  it('initializes key records with RTDB-generated record ids', async () => {
    const repository = loadRepository();
    const userPath = encodedUserId('user-1');
    const first = validEncrypted('AA');
    const second = validEncrypted('BB');

    const records = await repository.initializeUserEncryptedKeyRecords('user-1', [first, second]);

    expect(records).toEqual([
      { recordId: 'push-1', key: first },
      { recordId: 'push-2', key: second },
    ]);
    expect(mockRealtimeDatabase.data.userKeys[userPath]).toMatchObject({
      count: 2,
      items: {
        'push-1': first,
        'push-2': second,
      },
    });
  });

  it('updates exactly one existing key record', async () => {
    const repository = loadRepository();
    const userPath = encodedUserId('user-1');
    const existing = validEncrypted('AA');
    const other = validEncrypted('BB');
    const replacement = validEncrypted('CC');
    mockRealtimeDatabase.data.userKeys = {
      [userPath]: {
        count: 2,
        items: { existing, other },
        updatedAt: 1,
      },
    };

    await repository.updateUserEncryptedKeyRecord('user-1', 'existing', replacement);

    expect(mockRealtimeDatabase.data.userKeys[userPath].items).toEqual({
      existing: replacement,
      other,
    });
  });

  it('deletes one key record', async () => {
    const repository = loadRepository();
    const userPath = encodedUserId('user-1');
    mockRealtimeDatabase.data.userKeys = {
      [userPath]: {
        count: 2,
        items: {
          existing: validEncrypted('AA'),
          other: validEncrypted('BB'),
        },
        updatedAt: 1,
      },
    };

    await repository.deleteUserEncryptedKeyRecord('user-1', 'existing');

    expect(mockRealtimeDatabase.data.userKeys[userPath].items).toEqual({
      other: validEncrypted('BB'),
    });
    expect(mockRealtimeDatabase.data.userKeys[userPath].count).toBe(1);
  });
});
