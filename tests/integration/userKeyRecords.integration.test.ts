import type { Server } from 'http';
import { createHash } from 'crypto';
import * as admin from 'firebase-admin';
import { Secret, TOTP } from 'otpauth';

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

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
const encodedRtdbSegment = (value: string): string => Buffer.from(value, 'utf8').toString('base64url');

const createUserPayload = (overrides: Partial<ReturnType<typeof createUserPayloadBase>> = {}) => ({
  ...createUserPayloadBase(),
  ...overrides,
});

const createUserPayloadBase = () => ({
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
    token?: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<Response> => fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const createApiUser = async (
    username = `purrivacy-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    payload = createUserPayload(),
  ) => {
    const firebaseUser = await createFirebaseUser(`${username}@purrivacy.test`, 'test-password-123');
    const createUserResponse = await requestJson(
      'POST',
      '/user',
      firebaseUser.idToken,
      { userData: payload },
    );
    expect(createUserResponse.status).toBe(201);

    return { firebaseUser, username };
  };

  const createApiUserSession = async () => {
    const { firebaseUser, username } = await createApiUser();
    const sessionResponse = await requestJson(
      'POST',
      '/auth/session',
      firebaseUser.idToken,
      { label: 'Jest emulator', platform: 'node-test' },
    );
    expect(sessionResponse.status).toBe(200);
    const session = await sessionResponse.json() as {
      accessToken: string;
      refreshToken: string;
    };
    expect(session.accessToken).toEqual(expect.any(String));
    expect(session.refreshToken).toEqual(expect.any(String));

    return { firebaseUser, session, username };
  };

  it('creates a user and manages RTDB-generated key records through public APIs', async () => {
    const { session } = await createApiUserSession();

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

  it('rotates refresh tokens and revokes the token family on refresh-token reuse', async () => {
    const { session } = await createApiUserSession();

    const refreshResponse = await requestJson(
      'POST',
      '/auth/session/refresh',
      session.accessToken,
      { refreshToken: session.refreshToken },
    );
    expect(refreshResponse.status).toBe(200);
    const refreshed = await refreshResponse.json() as {
      accessToken: string;
      refreshToken: string;
    };
    expect(refreshed.accessToken).toEqual(expect.any(String));
    expect(refreshed.refreshToken).toEqual(expect.any(String));
    expect(refreshed.refreshToken).not.toBe(session.refreshToken);

    const reuseResponse = await requestJson(
      'POST',
      '/auth/session/refresh',
      refreshed.accessToken,
      { refreshToken: session.refreshToken },
    );
    expect(reuseResponse.status).toBe(401);
    await expect(reuseResponse.json()).resolves.toMatchObject({
      refreshTokenReuse: true,
      refreshTokenInvalid: true,
    });

    const revokedFamilyResponse = await requestJson(
      'POST',
      '/auth/session/refresh',
      refreshed.accessToken,
      { refreshToken: refreshed.refreshToken },
    );
    expect(revokedFamilyResponse.status).toBe(401);
  });

  it('creates recovery challenge data and recovery access tokens', async () => {
    const recoveryVerifier = 'a'.repeat(64);
    const recoveryVerifierSalt = '9'.repeat(32);
    const { username } = await createApiUser(
      `recover_${Date.now().toString(36)}`,
      createUserPayload({
        recoveryVerifierSalt,
        recoveryVerifierHash: sha256(recoveryVerifier),
      }),
    );

    const challengeResponse = await requestJson(
      'POST',
      '/auth/recovery/challenge',
      undefined,
      { username },
    );
    expect(challengeResponse.status).toBe(200);
    await expect(challengeResponse.json()).resolves.toEqual({ recoveryVerifierSalt });

    const tokenResponse = await requestJson(
      'POST',
      '/auth/recovery/token',
      undefined,
      { username, recoveryVerifier },
    );
    expect(tokenResponse.status).toBe(200);
    await expect(tokenResponse.json()).resolves.toMatchObject({
      tempToken: expect.any(String),
      userEncrypted: {
        dekSeed: expect.objectContaining({
          encryptedData: expect.any(String),
        }),
      },
    });
  });

  it('saves and deletes Expo push-token assignments through public APIs', async () => {
    const { firebaseUser, session } = await createApiUserSession();
    const deviceId = `device-${Date.now()}`;
    const pushToken = `ExponentPushToken[${Date.now()}]`;

    const saveResponse = await requestJson(
      'POST',
      '/user/save-push-token',
      session.accessToken,
      { pushToken },
      { 'X-Device-ID': deviceId },
    );
    expect(saveResponse.status).toBe(204);

    const encodedDeviceId = encodedRtdbSegment(deviceId);
    const encodedPushToken = encodedRtdbSegment(pushToken);
    expect((await rtdb.ref(`userPushDevices/${firebaseUser.localId}/${encodedDeviceId}`).get()).val()).toBe(encodedPushToken);

    const deleteResponse = await requestJson(
      'POST',
      '/user/delete-push-token',
      firebaseUser.idToken,
      { pushToken },
    );
    expect(deleteResponse.status).toBe(204);
    expect((await rtdb.ref(`userPushDevices/${firebaseUser.localId}/${encodedDeviceId}`).get()).val()).toBeNull();
  });

  it('enables, trusts, and disables MFA with TOTP codes', async () => {
    const { session } = await createApiUserSession();
    const setupResponse = await requestJson('POST', '/mfa/setup', session.accessToken);
    expect(setupResponse.status).toBe(200);
    const setup = await setupResponse.json() as { secret: string; recoveryCodes: string[] };
    expect(setup.recoveryCodes).toHaveLength(10);

    const mfaCode = new TOTP({ secret: Secret.fromBase32(setup.secret) }).generate();
    const enableResponse = await requestJson(
      'POST',
      '/mfa/enable',
      session.accessToken,
      { mfaCode, mfaTrusted: true },
      { 'X-Device-ID': 'mfa-device' },
    );
    expect(enableResponse.status).toBe(200);
    const enabledSession = await enableResponse.json() as { accessToken: string; mfaEnabled: boolean; mfaTrusted: boolean };
    expect(enabledSession).toMatchObject({ mfaEnabled: true, mfaTrusted: true });

    const trustResponse = await requestJson(
      'POST',
      '/mfa/session/trust',
      enabledSession.accessToken,
      { mfaCode, mfaTrusted: false },
    );
    expect(trustResponse.status).toBe(200);
    await expect(trustResponse.json()).resolves.toEqual({ mfaTrusted: false });

    const disableResponse = await requestJson(
      'POST',
      '/mfa/disable',
      enabledSession.accessToken,
      { mfaCode },
    );
    expect(disableResponse.status).toBe(200);
    await expect(disableResponse.json()).resolves.toMatchObject({
      mfaEnabled: false,
      mfaTrusted: false,
    });
  });

  it('returns regenerated recovery codes after recovery-code consumption reaches the threshold', async () => {
    const { firebaseUser, session } = await createApiUserSession();
    const setupResponse = await requestJson('POST', '/mfa/setup', session.accessToken);
    const setup = await setupResponse.json() as { secret: string; recoveryCodes: string[] };
    const mfaCode = new TOTP({ secret: Secret.fromBase32(setup.secret) }).generate();

    const enableResponse = await requestJson(
      'POST',
      '/mfa/enable',
      session.accessToken,
      { mfaCode, mfaTrusted: true },
    );
    const enabledSession = await enableResponse.json() as { accessToken: string };

    await db.collection('users')
      .doc(firebaseUser.localId)
      .collection('security')
      .doc('mfa')
      .update({
        mfaRecoveryCodes: setup.recoveryCodes.slice(0, 3).map(sha256),
      });

    const response = await requestJson(
      'POST',
      '/mfa/session/trust',
      enabledSession.accessToken,
      { mfaCode: setup.recoveryCodes[0], mfaTrusted: true },
    );
    expect(response.status).toBe(200);
    const latestResponseBody = await response.json() as Record<string, unknown>;

    expect(latestResponseBody).toMatchObject({
      mfaTrusted: true,
      newRecoveryCodes: expect.arrayContaining([expect.any(String)]),
    });
    expect(latestResponseBody.newRecoveryCodes).toHaveLength(10);
  });
});
