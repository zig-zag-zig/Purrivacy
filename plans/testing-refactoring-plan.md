# Purrivacy Test Suite Refactoring & Enhancement Plan

## Executive Summary

This plan covers structural improvements to the Purrivacy backend codebase and its test suite. It identifies test coverage gaps, structural issues in both production code and tests, and proposes a systematic path to elevate code quality through better testing and organization. **No bugs were found** — the code is well-structured and security-conscious. All recommendations are structural.

---

## Bugs Found

**One bug identified:**

### BUG-1: Logger `redact()` crashes on circular references before `safeStringify` can catch
- **File:** [`src/utils/logger.ts`](src/utils/logger.ts:16)
- **What happens:** The `redact()` function recurses on objects without cycle detection. When called with a circular reference, it throws `RangeError: Maximum call stack size exceeded` *before* `safeStringify()`'s try/catch can intercept it (because `redact()` is called at line 88 before `safeStringify()` is called at line 74).
- **Test that documents this:** [`tests/loggerRedaction.test.ts`](tests/loggerRedaction.test.ts:160) line 160-183 explicitly documents this as a "known limitation" and expects the throw.
- **Impact:** Any code path that passes a circular-referencing object as log metadata will crash the logging call (not the server, but the log call throws an unhandled exception in that request handler).
- **Fix:** Add a `WeakSet` cycle tracker to the `redact()` function.

---

## 1. Code Structural Improvements (Non-Bug, Non-Test)

These are production code improvements that make the codebase easier to test and maintain.

### 1.1 Replace Magic String Method Parameter with Typed Union
- **File:** [`src/api/middleware/authMiddleware.ts`](src/api/middleware/authMiddleware.ts:16)
- **Issue:** `authenticate(method: 'firebase' | 'session' | 'sessionSensitive')` uses string literals.
- **Action:** Extract to a type: `type AuthMethod = 'firebase' | 'session' | 'sessionSensitive'` in a shared types file or at the top of authMiddleware. Low priority — the current approach works but a named type enables better autocomplete/refactoring.

### 1.2 Remove `.js` Extension from Imports in userKeys Module
- **Files:**
  - [`src/features/user/infrastructure/userKeys/userKeyRefs.ts`](src/features/user/infrastructure/userKeys/userKeyRefs.ts:1)
  - [`src/features/user/infrastructure/userKeys/userKeyRecordSet.ts`](src/features/user/infrastructure/userKeys/userKeyRecordSet.ts:5)
- **Issue:** These files import with `.js` extension (`'../../../../infrastructure/firebase/index.js'`) while the rest of the codebase does not.
- **Action:** Change to `'../../../../infrastructure/firebase/index'` for consistency. Verify `tsc --noEmit` passes afterward since module resolution is `NodeNext`.

### 1.3 Remove `{ virtual: true }` from jest.mock Calls
- **Files:** All test files that mock `../src/infrastructure/firebase/index.js`
  - [`tests/authMiddleware.test.ts`](tests/authMiddleware.test.ts:6)
  - [`tests/mfaRecoveryCodes.test.ts`](tests/mfaRecoveryCodes.test.ts:7)
  - [`tests/rotateRefreshToken.test.ts`](tests/rotateRefreshToken.test.ts:5)
  - [`tests/sessionDeletion.test.ts`](tests/sessionDeletion.test.ts:6)
  - [`tests/userKeyRepository.test.ts`](tests/userKeyRepository.test.ts:5)
- **Issue:** `{ virtual: true }` is needed because the mock path ends in `.js` but the actual source is `.ts`. This is fragile and tied to the `.js` extension issue above.
- **Action:** Change mock paths to use `.ts` extension or no extension (since `ts-jest` handles `.ts` resolution). Then remove `{ virtual: true }`.

### 1.4 Make `redact()` and `safeStringify` Robust Against Circular References
- **File:** [`src/utils/logger.ts`](src/utils/logger.ts:16)
- **Issue:** See BUG-1 above.
- **Action:** Add a `WeakSet` to track visited objects in `redact()`. Return `'[circular]'` for repeated references instead of recursing infinitely.

### 1.5 Extract `jest.resetModules()` Pattern to a Test Utility
- **Files:** [`tests/envParsing.test.ts`](tests/envParsing.test.ts:1), [`tests/loggerRedaction.test.ts`](tests/loggerRedaction.test.ts:1), [`tests/authMiddleware.test.ts`](tests/authMiddleware.test.ts:1), [`tests/httpMiddleware.test.ts`](tests/httpMiddleware.test.ts:1)
- **Issue:** Multiple test files use the same pattern of `jest.resetModules()` + dynamic `require()` to get fresh module instances with different env vars.
- **Action:** Create `tests/helpers/reloadModule.ts` with a `reloadModule<T>(path: string): T` helper that handles `jest.resetModules()` and `require()` with proper typing.

---

## 2. Test Infrastructure Improvements

### 2.1 Restructure Test Directory to Mirror `src/`
**Current structure (flat):**
```
tests/
  asyncHandler.test.ts
  authMiddleware.test.ts
  ...
  emulator/
    userKeyRecords.integration.test.ts
  helpers/
    fakeFirestore.ts
    fakeRealtimeDatabase.ts
    firebaseEmulator.ts
```

**Proposed structure (mirrors src):**
```
tests/
  unit/
    utils/
      asyncHandler.test.ts
      cryptoUtils.test.ts
      errors.test.ts          (NEW)
      responseUtils.test.ts   (NEW)
    config/
      env.test.ts             (renamed from envParsing.test.ts)
    api/
      middleware/
        authMiddleware.test.ts
        errorMiddleware.test.ts    (extracted from httpMiddleware.test.ts)
        rateLimiter.test.ts       (renamed from createRateLimiter.test.ts)
        requestContext.test.ts    (renamed from requestMiddleware.test.ts)
        requestLogger.test.ts    (NEW)
        requestMetadata.test.ts  (extracted from httpMiddleware.test.ts)
      http/
        requestParsing.test.ts   (NEW)
        apiMessages.test.ts      (NEW)
      rate-limit/
        clientIp.test.ts         (NEW)
        createRateLimiter.test.ts
        rateLimitKeys.test.ts
      v1Routes.test.ts           (NEW)
    features/
      auth/
        identity/
          usernameIdentity.test.ts
        recovery/
          recoveryAccessService.test.ts  (NEW)
      session/
        application/
          sessionDeletion.test.ts
          sessionSecurity.test.ts
          sessionRecordStore.test.ts     (NEW)
          sessionTokenUtils.test.ts      (extracted from sessionSecurity.test.ts)
          createSession.test.ts          (NEW)
          validateSession.test.ts        (NEW)
          rotateRefreshToken.test.ts
          sessionFamilyMutations.test.ts (NEW)
          sessionMfaPolicy.test.ts       (extracted from sessionSecurity.test.ts)
          sessionResponse.test.ts        (extracted from sessionSecurity.test.ts)
          authSessionService.test.ts     (NEW)
          sessionRevocationService.test.ts (NEW)
          expiredSessionCleanup.test.ts  (NEW)
        api/
          sessionRequests.test.ts
          sessionRoutes.test.ts          (NEW - integration)
      mfa/
        application/
          mfaCodeFormats.test.ts
          mfaErrors.test.ts
          mfaRecoveryCodes.test.ts
          mfaService.test.ts             (NEW)
          mfaSessionService.test.ts      (NEW)
          mfaTotp.test.ts                (NEW)
          setupMfa.test.ts               (NEW)
          enableMfa.test.ts              (NEW)
          disableMfa.test.ts             (NEW)
          expiredMfaSetupCleanup.test.ts (NEW)
        api/
          mfaRequests.test.ts            (extracted from sessionRequests.test.ts)
          mfaRoutes.test.ts              (NEW - integration)
      user/
        domain/
          encryptedUserDataValidator.test.ts
        infrastructure/
          userRepository.test.ts         (NEW)
          userKeyRepository.test.ts
          userKeys/
            userKeyRecordSet.test.ts     (NEW)
            userKeyRefs.test.ts          (NEW)
        application/
          userReads.test.ts              (NEW)
          userWrites.test.ts             (NEW)
          userPushTokens.test.ts         (NEW)
          userService.test.ts            (NEW)
        api/
          userRequests.test.ts           (extracted from sessionRequests.test.ts)
          userRoutes.test.ts             (NEW - integration)
      notification/
        application/
          notificationPayloads.test.ts
          notificationService.test.ts    (NEW)
        infrastructure/
          pushTokenGuards.test.ts
          pushTokenNormalization.test.ts (NEW)
          pushTokenStore.test.ts         (NEW)
    infrastructure/
      firebase/
        index.test.ts                    (NEW)
        rtdbKeys.test.ts
        utils.test.ts                    (NEW)
      monitoring/
        sentry.test.ts                   (NEW)
    jobs/
      maintenanceJobs.test.ts            (NEW)
    core/
      constants.test.ts                  (NEW)
    app.test.ts                          (NEW)
    server.test.ts                       (NEW)
  integration/
    auth/
      sessionFlow.test.ts               (extracted from emulator)
      recoveryFlow.test.ts              (extracted from emulator)
    user/
      keyRecords.test.ts                (extracted from emulator)
      userLifecycle.test.ts             (NEW)
      pushTokens.test.ts                (extracted from emulator)
    mfa/
      mfaLifecycle.test.ts              (extracted from emulator)
      mfaRecoveryFlow.test.ts           (extracted from emulator)
    middleware/
      rateLimiting.test.ts              (NEW)
      errorHandling.test.ts             (NEW)
  helpers/
    fakeFirestore.ts
    fakeRealtimeDatabase.ts
    firebaseEmulator.ts
    reloadModule.ts                     (NEW)
    testFixtures.ts                     (NEW)
  setup.ts                              (renamed from setupEnv.ts)
  setup.emulator.ts                     (renamed from setupEmulatorEnv.ts)
```

### 2.2 Create Shared Test Fixtures
- **New file:** `tests/helpers/testFixtures.ts`
- **Content:** Reusable factory functions for:
  - `createValidEncryptedPayload(suffix: string)` — used in encryptDataValidator, userKeyRepository, emulator tests
  - `createValidSaltedEncryptedPayload(suffix: string)` — same
  - `createTestUserPayload(overrides?)` — used in emulator tests
  - `createMockRequest(overrides?)` — used across many middleware tests
  - `createMockResponse()` — used across many middleware tests
  - `createRefreshTokenFamily(overrides?)` — used in session tests
  - `createRefreshToken(overrides?)` — used in session tests
  - `createSession(overrides?)` — used in session tests
- **Benefit:** Remove duplicated helper functions across test files.

### 2.3 Upgrade `tsconfig.jest.json` for Stricter Test Checking
- **File:** [`tsconfig.jest.json`](tsconfig.jest.json:4)
- **Issue:** `noUnusedLocals: false` is set for tests, meaning dead code in tests won't be caught.
- **Action:** Set `noUnusedLocals: true` and clean up any resulting compilation errors in tests.

### 2.4 Add `jest --coverage` Script
- **File:** [`package.json`](package.json:12)
- **Action:** Add `"test:coverage": "jest --coverage"` script.
- Add `coverageThreshold` to [`jest.config.cjs`](jest.config.cjs:1) with progressively increasing targets (start at 50% branches, 70% functions, 80% lines).

---

## 3. New Unit Tests to Add (by Priority)

### Priority 1 — High-Value, Low-Effort (pure functions, no Firebase dependency)

| # | Test File | What It Tests | Source File |
|---|-----------|---------------|-------------|
| 1 | `requestParsing.test.ts` | `getBodyValue`, `getBearerToken`, `requireBodyValue`, `requireBodyString`, `parseOptionalTrimmedString` — edge cases: null body, array body, missing fields, type mismatches, maxLength boundary | [`src/api/http/requestParsing.ts`](src/api/http/requestParsing.ts:1) |
| 2 | `responseUtils.test.ts` | `success`, `successWithRecoveryCodes`, `error`, `badRequest`, `noContent` — verify status codes, response body shape, recovery code injection | [`src/utils/responseUtils.ts`](src/utils/responseUtils.ts:6) |
| 3 | `errors.test.ts` | All error classes — verify `instanceof` checks, statusCode propagation, `Object.setPrototypeOf` correctness, details passthrough, `Error.captureStackTrace` | [`src/utils/errors.ts`](src/utils/errors.ts:1) |
| 4 | `requestContextHelpers.test.ts` | `requireAuthenticatedUserId` — throws AuthError when userId missing, returns userId when present. `requireSessionFamilyId` — same pattern | [`src/api/http/requestContextHelpers.ts`](src/api/http/requestContextHelpers.ts:29) |
| 5 | `clientIp.test.ts` | `getClientIp` — socket.remoteAddress priority, connection.remoteAddress fallback, x-forwarded-for parsing (single, multiple), localhost filtering, 'unknown' fallback | [`src/api/rate-limit/clientIp.ts`](src/api/rate-limit/clientIp.ts:18) |
| 6 | `sessionResponse.test.ts` | `buildSessionResponse` — verify output shape, ISO string formatting, mfaTrusted/mfaEnabled derivation from family, all edge cases | [`src/features/session/application/sessionResponse.ts`](src/features/session/application/sessionResponse.ts:3) |
| 7 | `pushTokenNormalization.test.ts` | `normalizePushToken` — trimming, max length, empty string, null/undefined | [`src/features/notification/infrastructure/pushTokens/pushTokenNormalization.ts`](src/features/notification/infrastructure/pushTokens/pushTokenNormalization.ts) |
| 8 | `mfaTotp.test.ts` | `generateTotpSecret`, `verifyTotpCode` — TOTP generation format, verification with correct/wrong/expired codes, otpauth URL format | [`src/features/mfa/application/mfaTotp.ts`](src/features/mfa/application/mfaTotp.ts) |
| 9 | `userKeyRefs.test.ts` | `assertUserKeyRecordId`, `getUserKeysRef` — valid/invalid record IDs, encoding verification | [`src/features/user/infrastructure/userKeys/userKeyRefs.ts`](src/features/user/infrastructure/userKeys/userKeyRefs.ts:9) |
| 10 | `userKeyRecordSet.test.ts` | `createEmptyUserEncryptedKeyRecordSet`, `sanitizeUserEncryptedKeyItems`, `sanitizeUserEncryptedKeyRecordSet`, `toEncryptedKeyRecords` — null input, empty items, invalid shapes, malformed encrypted payloads within items | [`src/features/user/infrastructure/userKeys/userKeyRecordSet.ts`](src/features/user/infrastructure/userKeys/userKeyRecordSet.ts:13) |
| 11 | `notificationOptions.test.ts` | `getNotificationKind` — already tested in notificationPayloads, extract to dedicated file and add more edge cases | [`src/features/notification/application/notificationOptions.ts`](src/features/notification/application/notificationOptions.ts) |

### Priority 2 — Service/Facade Unit Tests (with mocked dependencies)

| # | Test File | What It Tests | Source File |
|---|-----------|---------------|-------------|
| 12 | `authSessionService.test.ts` | `extractUserIdFromToken` — valid/invalid auth headers, token verification success/failure. `createSession` — MFA-enabled path, non-MFA path, error propagation. `refreshSession` — delegation to SessionService | [`src/features/session/application/AuthSessionService.ts`](src/features/session/application/AuthSessionService.ts:19) |
| 13 | `sessionRecordStore.test.ts` | `createAccessTokenForFamily` — session doc creation, hash computation. `getValidActiveAccessSession` — missing token, expired session, wrong userId, wrong familyId, valid case. `queueFamilyRecordDeletes` — cascade deletion queries. `queueStaleDeviceFamilyDeletes` — filtering logic | [`src/features/session/application/sessionRecordStore.ts`](src/features/session/application/sessionRecordStore.ts:12) |
| 14 | `sessionFamilyMutations.test.ts` | `setSessionFamilyMfaTrust` — success, family not found, userId mismatch. `markSessionFamilyMfaVerified` — timestamp update, non-existent family. `revokeSessionFamily` — revoke timestamp, family not found | [`src/features/session/application/sessionFamilyMutations.ts`](src/features/session/application/sessionFamilyMutations.ts) |
| 15 | `validateSession.test.ts` | `validateBackendSession` — valid session, missing doc, expired (should delete), revoked family (should delete), missing data field | [`src/features/session/application/validateSession.ts`](src/features/session/application/validateSession.ts:7) |
| 16 | `createSession.test.ts` | `createBackendSession` — session + family creation, batch commit, stale device family cleanup, response building | [`src/features/session/application/createSession.ts`](src/features/session/application/createSession.ts:15) |
| 17 | `sessionRevocationService.test.ts` | `revokeAllUserSessions` — session deletion + Firebase token revocation + notification sending; notification failure path | [`src/features/session/application/SessionRevocationService.ts`](src/features/session/application/SessionRevocationService.ts:11) |
| 18 | `userReads.test.ts` | `getUser` — doc exists with keys. `getUserMfaState` — enabled/disabled/missing field. `getEncryptedUser` — sanitization pass-through | [`src/features/user/application/userReads.ts`](src/features/user/application/userReads.ts:6) |
| 19 | `userWrites.test.ts` | `createUser` — success, conflict (already exists), key initialization failure rollback. `changeDekPassword` — user not found, sanitization, update. `deleteUser` — cascading deletes. `queueUserMfaEnabledUpdate` — batch operation | [`src/features/user/application/userWrites.ts`](src/features/user/application/userWrites.ts:16) |
| 20 | `userRepository.test.ts` | `getUserRef`, `getUserDoc` — exists/not found. `getUserWithFieldMask` — field mask passthrough, not found | [`src/features/user/infrastructure/UserRepository.ts`](src/features/user/infrastructure/UserRepository.ts:1) |
| 21 | `recoveryAccessService.test.ts` | `getChallenge` — existing user, non-existing user (fake salt), missing salt field. `createRecoveryToken` — valid verifier, wrong verifier (timing-safe), missing user, missing doc fields | [`src/features/auth/recovery/RecoveryAccessService.ts`](src/features/auth/recovery/RecoveryAccessService.ts:12) |
| 22 | `mfaSessionService.test.ts` | `enableMfaAndCreateSession` — valid code, invalid code, MFA already enabled. `disableMfaAndCreateSession` — success, MFA not enabled. `manageSessionTrust` — trust/untrust, family not found | [`src/features/mfa/application/MfaSessionService.ts`](src/features/mfa/application/MfaSessionService.ts) |
| 23 | `setupMfa.test.ts` | `setupMfa` — secret generation, recovery code count, setup document creation, already-setup error | [`src/features/mfa/application/setupMfa.ts`](src/features/mfa/application/setupMfa.ts) |
| 24 | `enableMfa.test.ts` | `verifyAndEnableMfa` — valid TOTP code, invalid code, expired setup, session regeneration after enable | [`src/features/mfa/application/enableMfa.ts`](src/features/mfa/application/enableMfa.ts) |
| 25 | `disableMfa.test.ts` | `disableMfa` — success (remove secret + recovery codes), MFA not enabled error | [`src/features/mfa/application/disableMfa.ts`](src/features/mfa/application/disableMfa.ts) |
| 26 | `notificationService.test.ts` | `sendDataOnlyNotification` — delegates to sendPushNotification. `sendDataOnlyNotificationSafe` — success path, error catch + log path | [`src/features/notification/application/NotificationService.ts`](src/features/notification/application/NotificationService.ts:9) |
| 27 | `pushTokenStore.test.ts` | `savePushTokenToDb`, `deletePushTokensFromDb`, `deleteUserPushTokensFromDb` — RTDB writes, duplicate handling, missing tokens | [`src/features/notification/infrastructure/pushTokenStore.ts`](src/features/notification/infrastructure/pushTokenStore.ts) |

### Priority 3 — Infrastructure & Integration Point Tests

| # | Test File | What It Tests | Source File |
|---|-----------|---------------|-------------|
| 28 | `requestLogger.test.ts` | Request logging — finish event, 200/400/500 status code logging levels, duration calculation, health endpoint skip, meta field presence | [`src/api/middleware/requestLogger.ts`](src/api/middleware/requestLogger.ts:6) |
| 29 | `firebaseUtils.test.ts` | `isPlainObject` — objects, arrays, null, primitives | [`src/infrastructure/firebase/utils.ts`](src/infrastructure/firebase/utils.ts:1) |
| 30 | `expiredSessionCleanup.test.ts` | `cleanupExpiredSessionRecords` — removes expired sessions/tokens/families, keeps active ones | [`src/features/session/application/expiredSessionCleanup.ts`](src/features/session/application/expiredSessionCleanup.ts) |
| 31 | `expiredMfaSetupCleanup.test.ts` | `cleanupExpiredMfaSetups` — removes expired mfaSetup docs, keeps active ones | [`src/features/mfa/application/expiredMfaSetupCleanup.ts`](src/features/mfa/application/expiredMfaSetupCleanup.ts) |
| 32 | `maintenanceJobs.test.ts` | `startMaintenanceJobs` — interval creation, double-start prevention. `stopMaintenanceJobs` — interval clearing. Run cycle error handling | [`src/jobs/maintenanceJobs.ts`](src/jobs/maintenanceJobs.ts:14) |
| 33 | `v1Routes.test.ts` | Route mounting — /health returns 200, /user routes mounted, /auth routes mounted, /mfa routes mounted | [`src/api/v1Routes.ts`](src/api/v1Routes.ts:8) |
| 34 | `app.test.ts` | Express app creation — middleware order verification, route mounting, trust proxy setting, error handler registration | [`src/app.ts`](src/app.ts:1) |
| 35 | `constants.test.ts` | Constant value assertions — verify token lifetimes, MFA constants, abuse guard limits are as expected | [`src/core/constants/index.ts`](src/core/constants/index.ts) |

---

## 4. New Integration Tests to Add

All integration tests use the Firebase emulator. They run with `npm run test:integration`.

### 4.1 Split Monolithic Emulator Test
- **Current:** [`tests/emulator/userKeyRecords.integration.test.ts`](tests/emulator/userKeyRecords.integration.test.ts:1) — 5 `it` blocks testing 4 different features
- **Action:** Split into focused integration test files:
  - `tests/integration/auth/sessionFlow.test.ts` — session creation, refresh, reuse detection, revocation
  - `tests/integration/auth/recoveryFlow.test.ts` — challenge, token creation
  - `tests/integration/user/keyRecords.test.ts` — CRUD through public API
  - `tests/integration/user/pushTokens.test.ts` — save/delete through public API
  - `tests/integration/mfa/mfaLifecycle.test.ts` — setup, enable, trust, disable

### 4.2 New Integration Test Scenarios

| # | Test File | Scenarios |
|---|-----------|-----------|
| 36 | `userLifecycle.test.ts` | User creation → get user → change DEK password → delete user. Verify Firestore/RTDB cleanup after deletion |
| 37 | `mfaRecoveryFlow.test.ts` | Recovery code regeneration API, remaining codes count API, verify recovery codes auto-regenerate at threshold via API |
| 38 | `sessionSignOut.test.ts` | Sign out (revoke family) → verify access token rejected → verify refresh token rejected |
| 39 | `sessionRevokeAll.test.ts` | Revoke all sessions → verify all access tokens rejected → verify all refresh tokens rejected → verify notification sent |
| 40 | `rateLimiting.test.ts` | Hit rate limit → verify 429 response → verify Retry-After header → verify window reset (may need to use shorter windows or mock time) |
| 41 | `errorHandling.test.ts` | Invalid JSON body → 400. Entity too large → 413. Missing auth → 401. Invalid auth → 401. Not found → 404. Internal error → 500 with safe message |
| 42 | `healthEndpoint.test.ts` | GET /v1/health → 200 with { status: 'healthy' } |
| 43 | `multipleDeviceSessions.test.ts` | Create sessions for same user on different devices → verify both work → verify device-specific revocation |
| 44 | `notificationFlow.test.ts` | Verify push notification is sent on user data change, session revocation. Mock Expo push service or verify at RTDB level |

---

## 5. Tests to Update / Refactor

| # | Current File | Action | Reason |
|---|-------------|--------|--------|
| 45 | `httpMiddleware.test.ts` | Split into `errorMiddleware.test.ts`, `requestMetadata.test.ts`, `responseUtils.test.ts` | Tests too many unrelated concerns in one file (error middleware, request metadata, response utils) |
| 46 | `sessionSecurity.test.ts` | Split into `sessionTokenUtils.test.ts`, `sessionMfaPolicy.test.ts`, `sessionResponse.test.ts` | Tests 4 different modules in one file |
| 47 | `sessionRequests.test.ts` | Extract MFA parsing tests to `mfaRequests.test.ts`. Extract user parsing tests to `userRequests.test.ts`. Keep session-specific tests | Tests 3 different API request parsing modules |
| 48 | `notificationPayloads.test.ts` | Extract `getNotificationKind` tests to `notificationOptions.test.ts`. Keep `buildExpoPushMessages` and `collectInvalidPushTokens` | Two different source modules |
| 49 | All tests with `jest.resetModules()` | Replace with `reloadModule()` helper from shared test utility | Reduce duplication and fragility |
| 50 | All tests with duplicated mock setup | Use shared `testFixtures.ts` factory functions | Reduce duplication |

---

## 6. Tests to Remove

| # | Current File | Reason |
|---|-------------|--------|
| 51 | `envParsing.test.ts` | Rename to `env.test.ts` in new directory structure (not removed, relocated) |
| 52 | `requestMiddleware.test.ts` | Rename to `requestContext.test.ts` (actual module name) |
| 53 | `createRateLimiter.test.ts` | Rename to `rateLimiter.test.ts` or keep and move to `api/rate-limit/` |

No tests are proposed for outright removal — only relocation/renaming.

---

## 7. Additional Test Categories to Consider

### 7.1 Property-Based Tests
- **Tool:** `fast-check` or similar
- **Candidates:**
  - `CryptoUtils.encryptSecret/decryptSecret` — any plaintext round-trips
  - `CryptoUtils.sha256` — deterministic, hex output
  - `encodeRtdbKeySegment/decodeRtdbKeySegment` — any string round-trips
  - `UsernameIdentity.normalizeUsername` — any valid string passes, any invalid string throws
  - `EncryptedUserDataValidator` functions — any valid shape passes, any invalid shape throws with specific error

### 7.2 Snapshot Tests
- **Use case:** API response schemas for `/v1/health`, session responses, error responses
- **Benefit:** Catch accidental changes to API contract shapes

### 7.3 Performance / Load Tests
- **Tool:** `k6` or `artillery`
- **Scenarios:**
  - Session creation under concurrent load
  - Token refresh under concurrent load
  - Rate limiter behavior under burst traffic
  - Large key record sets (near MAX_KEYS_PER_USER)
- **Note:** These may be out of scope for unit/integration test refactoring; consider as a separate initiative

---

## 8. Proposed jest.config.cjs Updates

```js
/** @type {import('jest').Config} */
module.exports = {
  clearMocks: true,
  roots: ['<rootDir>/tests/unit'],
  setupFiles: ['<rootDir>/tests/setup.ts'],
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/tests/integration/'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.jest.json' }],
  },
  coverageDirectory: '<rootDir>/coverage',
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 70,
      lines: 80,
      statements: 80,
    },
  },
};
```

## 9. Proposed jest.emulator.config.cjs Updates

```js
/** @type {import('jest').Config} */
module.exports = {
  clearMocks: true,
  roots: ['<rootDir>/tests/integration'],
  setupFiles: ['<rootDir>/tests/setup.emulator.ts'],
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.jest.json' }],
  },
};
```

## 10. Summary Statistics

| Metric | Current | After Plan |
|--------|---------|------------|
| Unit test files | 22 | ~52 |
| Integration test files | 1 | ~10 |
| Test helper files | 3 | 6 |
| Test directory depth | 1 (flat) | 4 (mirrors src) |
| Services with 0 direct tests | ~15 | 0 |
| Code structure bugs | 1 | 0 |
| Magic strings in prod code | 1 location | 0 |

---

## 11. Implementation Order

The work should be done in phases to minimize risk and allow incremental validation:

### Phase 1: Foundation (no behavioral changes)
1. Create `tests/helpers/reloadModule.ts` utility
2. Create `tests/helpers/testFixtures.ts` with shared factories
3. Restructure test directory (move existing files, no content changes)
4. Update jest configs for new directory structure
5. Rename test files to match source module names
6. Verify all existing tests still pass: `npm test && npm run test:integration`

### Phase 2: Fill Critical Gaps
7. Add Priority 1 pure-function tests (requestParsing, responseUtils, errors, requestContextHelpers, clientIp, sessionResponse, pushTokenNormalization, mfaTotp, userKeyRefs, userKeyRecordSet)
8. Add Priority 2 service tests for most critical paths (AuthSessionService, sessionRecordStore, validateSession, recoveryAccessService)

### Phase 3: Production Code Cleanup
9. Fix BUG-1 (logger circular reference)
10. Remove `.js` extensions from userKeys imports
11. Remove `{ virtual: true }` from jest.mock calls
12. Extract magic string to typed union in authMiddleware
13. Enable `noUnusedLocals: true` in tsconfig.jest.json
14. Verify all tests pass

### Phase 4: Remaining Unit Tests
15. Add remaining Priority 2 service tests
16. Add Priority 3 infrastructure tests

### Phase 5: Integration Tests
17. Split monolithic emulator test into focused files
18. Add new integration test scenarios (userLifecycle, sessionSignOut, rateLimiting, errorHandling, healthEndpoint, multipleDevices, notificationFlow)

### Phase 6: Polish
19. Add `test:coverage` script with thresholds
20. Extract overlapping test logic from existing tests to shared helpers
21. Split `httpMiddleware.test.ts`, `sessionSecurity.test.ts`, `sessionRequests.test.ts` into focused files
22. Consider property-based tests as follow-up initiative
