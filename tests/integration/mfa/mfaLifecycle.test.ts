/**
 * Integration test: MFA lifecycle — setup, enable, trust, disable.
 */
import type { Server } from 'http';
import { Secret, TOTP } from 'otpauth';
import { startServer, stopServer, requestJson, createApiUserSession } from '../helpers';

describe('MFA Lifecycle', () => {
    let server: Server;
    let baseUrl: string;

    beforeAll(async () => {
        ({ server, baseUrl } = await startServer());
    });

    afterAll(async () => {
        await stopServer(server);
    });

    it('enables, trusts, and disables MFA with TOTP codes', async () => {
        const { session } = await createApiUserSession(baseUrl);
        const setupResponse = await requestJson(baseUrl, 'POST', '/mfa/setup', session.accessToken);
        expect(setupResponse.status).toBe(200);
        const setup = await setupResponse.json() as { secret: string; recoveryCodes: string[] };
        expect(setup.recoveryCodes).toHaveLength(10);

        const mfaCode = new TOTP({ secret: Secret.fromBase32(setup.secret) }).generate();
        const enableResponse = await requestJson(
            baseUrl, 'POST', '/mfa/enable',
            session.accessToken,
            { mfaCode, mfaTrusted: true },
            { 'X-Device-ID': 'mfa-device' },
        );
        expect(enableResponse.status).toBe(200);
        const enabledSession = await enableResponse.json() as { accessToken: string; mfaEnabled: boolean; mfaTrusted: boolean };
        expect(enabledSession).toMatchObject({ mfaEnabled: true, mfaTrusted: true });

        const trustResponse = await requestJson(
            baseUrl, 'POST', '/mfa/session/trust',
            enabledSession.accessToken,
            { mfaCode, mfaTrusted: false },
        );
        expect(trustResponse.status).toBe(200);
        await expect(trustResponse.json()).resolves.toEqual({ mfaTrusted: false });

        const disableResponse = await requestJson(
            baseUrl, 'POST', '/mfa/disable',
            enabledSession.accessToken,
            { mfaCode },
        );
        expect(disableResponse.status).toBe(200);
        await expect(disableResponse.json()).resolves.toMatchObject({
            mfaEnabled: false,
            mfaTrusted: false,
        });
    });
});
