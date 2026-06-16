import { AuthError, BadRequestError } from '../../../../../src/utils/errors';
import { UNTRUSTED_MFA_MAX_AGE_MS } from '../../../../../src/core/constants';
import { RefreshTokenFamily, Session } from '../../../../../src/core/types';
import { requiresMfaForRefresh } from '../../../../../src/features/session/application/sessionMfaPolicy';
import {
  MAX_ACCESS_TOKEN_LENGTH,
  TOKEN_ID_HEX_LENGTH,
  generateRefreshToken,
  normalizeDeviceId,
  parseRefreshTokenId,
} from '../../../../../src/features/session/application/sessionTokenUtils';
import { buildSessionResponse } from '../../../../../src/features/session/application/sessionResponse';

const family = (overrides: Partial<RefreshTokenFamily> = {}): RefreshTokenFamily => ({
  familyId: 'family-1',
  userId: 'user-1',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  lastUsedAt: new Date('2026-01-01T00:00:00.000Z'),
  expiresAt: new Date('2026-04-01T00:00:00.000Z'),
  userHasMfa: true,
  mfaTrusted: false,
  ...overrides,
});

const activeSession = (overrides: Partial<Session> = {}): Session => ({
  accessTokenHash: 'access-hash',
  userId: 'user-1',
  refreshTokenFamilyId: 'family-1',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  expiresAt: new Date('2026-01-01T00:15:00.000Z'),
  ...overrides,
});

describe('session token and MFA security helpers', () => {
  it('generates parseable refresh tokens while exposing only the token id for lookup', () => {
    const refreshToken = generateRefreshToken();

    expect(refreshToken.tokenId).toHaveLength(TOKEN_ID_HEX_LENGTH);
    expect(refreshToken.rawToken).toMatch(new RegExp(`^${refreshToken.tokenId}\\.[A-Za-z0-9_-]+$`));
    expect(refreshToken.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(parseRefreshTokenId(refreshToken.rawToken)).toBe(refreshToken.tokenId);
  });

  it('rejects malformed refresh token ids with a session-safe auth error', () => {
    const invalidTokens = [
      '',
      'missing-secret',
      `${'a'.repeat(TOKEN_ID_HEX_LENGTH)}.`,
      `${'g'.repeat(TOKEN_ID_HEX_LENGTH)}.secret`,
      `${'a'.repeat(TOKEN_ID_HEX_LENGTH)}.not+url+safe`,
    ];

    for (const token of invalidTokens) {
      expect(() => parseRefreshTokenId(token)).toThrow(AuthError);
      try {
        parseRefreshTokenId(token);
      } catch (error) {
        expect((error as AuthError).statusCode).toBe(401);
        expect((error as AuthError).details).toEqual({ refreshTokenInvalid: true });
      }
    }
  });

  it('normalizes optional device ids and caps their size', () => {
    expect(normalizeDeviceId(undefined)).toBeUndefined();
    expect(normalizeDeviceId('   ')).toBeUndefined();
    expect(normalizeDeviceId('  ios-device  ')).toBe('ios-device');
    expect(() => normalizeDeviceId('x'.repeat(257))).toThrow(BadRequestError);
  });

  it('requires MFA on refresh only when an untrusted MFA family lacks fresh verification', () => {
    const now = new Date('2026-01-01T12:00:00.000Z');

    expect(requiresMfaForRefresh(family({ userHasMfa: false }), null, now)).toBe(false);
    expect(requiresMfaForRefresh(family({ mfaTrusted: true }), null, now)).toBe(false);
    expect(requiresMfaForRefresh(family({ mfaVerifiedAt: new Date(now.getTime() - 1_000) }), activeSession(), now)).toBe(false);
    expect(requiresMfaForRefresh(family({ mfaVerifiedAt: new Date(now.getTime() - UNTRUSTED_MFA_MAX_AGE_MS - 1) }), activeSession(), now)).toBe(true);
    expect(requiresMfaForRefresh(family({ mfaVerifiedAt: new Date(now.getTime() - 1_000) }), null, now)).toBe(true);
    expect(requiresMfaForRefresh(family({ mfaVerifiedAt: new Date('invalid') }), activeSession(), now)).toBe(true);
  });

  it('builds session responses with ISO timestamps and MFA state derived from the token family', () => {
    expect(MAX_ACCESS_TOKEN_LENGTH).toBe(1024);
    expect(buildSessionResponse(
      'access',
      new Date('2026-01-01T00:15:00.000Z'),
      'refresh',
      new Date('2026-04-01T00:00:00.000Z'),
      family({ userHasMfa: true, mfaTrusted: false }),
    )).toEqual({
      accessToken: 'access',
      refreshToken: 'refresh',
      accessTokenExpiresAt: '2026-01-01T00:15:00.000Z',
      refreshTokenExpiresAt: '2026-04-01T00:00:00.000Z',
      mfaEnabled: true,
      mfaTrusted: false,
    });
  });
});
