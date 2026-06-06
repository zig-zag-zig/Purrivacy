import type { Server } from 'http';
import * as admin from 'firebase-admin';

jest.mock('../../src/infrastructure/firebase', () => require('../helpers/firebaseEmulator'));

const app = require('../../src/app').default as typeof import('../../src/app').default;
const { db, rtdb } = require('../../src/infrastructure/firebase') as typeof import('../../src/infrastructure/firebase');
const AUTH_EMULATOR_ORIGIN = 'http://127.0.0.1:9099';

const encryptedBase = (suffix: string) => ({
  encryptedData: Buffer.from(`payload-${suffix}`, 'utf8').toString('base64'),
  iv: 'a'.repeat(24),
  tag: 'b'.repeat(32),
});

const encrypted = (suffix: string) => ({
  ...encryptedBase(suffix),
  salt: 'c'.repeat(32),
});

const createUserPayload = () => ({
  dekPassword: encrypted('dek-password'),
  dekSeed: encrypted('dek-seed'),
  keys: [
    encryptedBase('first-key'),
    encryptedBase('second-key'),
  ],
  recoveryVerifierSalt: '1'.repeat(32),
  recoveryVerifierHash: '2'.repeat(64),
});

async function createFirebaseUser(email: string, password: string) {
  const response = await fetch(
    `${AUTH_EMULATOR_ORIGIN}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to create auth emulator user: ${response.status} ${await response.text()}`);
  }

  return await response.json() as { idToken: string; localId: string };
}

describe('Purrivacy Firebase emulator API', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          throw new Error('Expected HTTP server to listen on a TCP port');
        }
        baseUrl = `http://127.0.0.1:${address.port}/v1`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    rtdb.goOffline();
    await db.terminate();
    await Promise.all(admin.apps.map(firebaseApp => firebaseApp?.delete()));
  });

  const requestJson = async (
    method: string,
    path: string,
    token: string,
    body?: unknown,
  ): Promise<Response> => fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  it('creates a user and manages RTDB-generated key records through public APIs', async () => {
    const password = 'test-password-123';
    const firebaseUser = await createFirebaseUser(
      `purrivacy-${Date.now()}@purrivacy.test`,
      password,
    );

    const createUserResponse = await requestJson(
      'POST',
      '/user',
      firebaseUser.idToken,
      { userData: createUserPayload() },
    );
    expect(createUserResponse.status).toBe(201);

    const sessionResponse = await requestJson(
      'POST',
      '/auth/session',
      firebaseUser.idToken,
      { label: 'Jest emulator', platform: 'node-test' },
    );
    expect(sessionResponse.status).toBe(200);
    const session = await sessionResponse.json() as { accessToken: string };
    expect(session.accessToken).toEqual(expect.any(String));

    const recordsResponse = await requestJson('GET', '/user/key-records', session.accessToken);
    expect(recordsResponse.status).toBe(200);
    const records = await recordsResponse.json() as { keys: Array<{ recordId: string }> };
    expect(records.keys).toHaveLength(2);
    expect(records.keys.map(record => record.recordId)).toEqual([
      expect.any(String),
      expect.any(String),
    ]);

    const addedKey = encryptedBase('third-key');
    const addResponse = await requestJson('POST', '/user/key-records', session.accessToken, { key: addedKey });
    expect(addResponse.status).toBe(201);
    const added = await addResponse.json() as { recordId: string };
    expect(added.recordId).toEqual(expect.any(String));
    expect(records.keys.map(record => record.recordId)).not.toContain(added.recordId);

    const replacementKey = encryptedBase('updated-third-key');
    const updateResponse = await requestJson(
      'PUT',
      `/user/key-records/${encodeURIComponent(added.recordId)}`,
      session.accessToken,
      { key: replacementKey },
    );
    expect(updateResponse.status).toBe(200);
    await expect(updateResponse.json()).resolves.toMatchObject({
      recordId: added.recordId,
      encryptedData: replacementKey.encryptedData,
    });

    const deleteResponse = await requestJson(
      'DELETE',
      `/user/key-records/${encodeURIComponent(added.recordId)}`,
      session.accessToken,
    );
    expect(deleteResponse.status).toBe(204);

    const finalRecordsResponse = await requestJson('GET', '/user/key-records', session.accessToken);
    expect(finalRecordsResponse.status).toBe(200);
    const finalRecords = await finalRecordsResponse.json() as { keys: Array<{ recordId: string }> };
    expect(finalRecords.keys.map(record => record.recordId)).not.toContain(added.recordId);
    expect(finalRecords.keys).toHaveLength(2);
  });

  it('rejects session-authenticated routes without a backend access token', async () => {
    const response = await fetch(`${baseUrl}/user/key-records`, {
      headers: { Authorization: 'Bearer not-a-backend-session' },
    });

    expect(response.status).toBe(401);
  });
});
