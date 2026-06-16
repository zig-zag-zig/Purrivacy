# Purrivacy Testing — Structural Review & Updated Plan

**Date:** 2026-06-16  
**State:** 83 source files, 43 test files, 42 suites, 376 tests, branch `refactor/test-suite-enhancement`

---

## 1. Executive Summary

Since the initial plan, 19 new test files were created (16 survived), the test directory was restructured to mirror `src/`, and one bug was fixed. The codebase is now in good shape but still has structural gaps. This updated plan focuses on what remains.

## 2. Source Modules Without Tests

The following source modules have **zero direct test coverage** (they may be exercised indirectly through integration or middleware tests):

### 2.1 Application Services (high risk — core business logic)

| Module | Risk | Reason Untested |
|--------|------|-----------------|
| [`RecoveryAccessService.ts`](src/features/auth/recovery/RecoveryAccessService.ts) | HIGH | Fake Firestore lacks `db.getAll()` + `doc.get(fieldMask)` |
| [`createSession.ts`](src/features/session/application/createSession.ts) | HIGH | Requires batch writes + transaction mocks |
| [`sessionRecordStore.ts`](src/features/session/application/sessionRecordStore.ts) | HIGH | Requires transaction mocks, complex queries |
| [`MfaSessionService.ts`](src/features/mfa/application/MfaSessionService.ts) | MEDIUM | Wires multiple services together |
| [`setupMfa.ts`](src/features/mfa/application/setupMfa.ts) | MEDIUM | Requires Firestore security subcollection writes |
| [`enableMfa.ts`](src/features/mfa/application/enableMfa.ts) | MEDIUM | Requires TOTP verification + Firestore writes |
| [`disableMfa.ts`](src/features/mfa/application/disableMfa.ts) | MEDIUM | Requires Firestore writes |
| [`verifyMfaCode.ts`](src/features/mfa/application/verifyMfaCode.ts) | LOW | Recovery code path tested via mfaRecoveryCodes tests |
| [`verifyMfaTotpCode.ts`](src/features/mfa/application/verifyMfaTotpCode.ts) | LOW | Thin wrapper over mfaTotp |
| [`userWrites.ts`](src/features/user/application/userWrites.ts) | MEDIUM | Requires `db.getAll()` (fieldMask) |
| [`userReads.ts`](src/features/user/application/userReads.ts) | MEDIUM | Requires `db.getAll()` (fieldMask) |
| [`UserService.ts`](src/features/user/application/UserService.ts) | LOW | Facade — delegates to tested modules |
| [`userPushTokens.ts`](src/features/user/application/userPushTokens.ts) | LOW | Thin wrapper |
| [`UserRepository.ts`](src/features/user/infrastructure/UserRepository.ts) | MEDIUM | Requires `db.getAll()` (fieldMask) |

### 2.2 Route Handlers & API (medium risk — integration-tested via emulator)

| Module | Risk | Notes |
|--------|------|-------|
| [`sessionRoutes.ts`](src/features/session/api/sessionRoutes.ts) | MEDIUM | Routes are integration-tested but no unit tests for handler logic |
| [`mfaRoutes.ts`](src/features/mfa/api/mfaRoutes.ts) | MEDIUM | Same — integration-tested only |
| [`userRoutes.ts`](src/features/user/api/userRoutes.ts) | MEDIUM | Same — integration-tested only |
| [`v1Routes.ts`](src/api/v1Routes.ts) | LOW | Too many transitive Firebase deps for unit testing |

### 2.3 Infrastructure & Jobs

| Module | Risk | Notes |
|--------|------|-------|
| [`expiredSessionCleanup.ts`](src/features/session/application/expiredSessionCleanup.ts) | LOW | Requires Firestore query mocks |
| [`expiredMfaSetupCleanup.ts`](src/features/mfa/application/expiredMfaSetupCleanup.ts) | LOW | Requires Firestore query mocks |
| [`sendPushNotification.ts`](src/features/notification/application/sendPushNotification.ts) | MEDIUM | Requires Expo SDK mock |
| [`pushTokenStore.ts`](src/features/notification/infrastructure/pushTokenStore.ts) | LOW | RTDB writes, tested indirectly |
| [`expoPushPayloads.ts`](src/features/notification/application/expoPushPayloads.ts) | LOW | Partially tested via notificationPayloads |
| [`notificationOptions.ts`](src/features/notification/application/notificationOptions.ts) | LOW | Tested via notificationPayloads |
| [`sentry.ts`](src/infrastructure/monitoring/sentry.ts) | LOW | Monitoring — hard to unit test meaningfully |
| [`app.ts`](src/app.ts), [`server.ts`](src/server.ts) | LOW | Integration/startup — tested by emulator |
| `rateLimitTypes.ts` | LOW | Pure type definitions |

### 2.4 Fully Covered Modules (✅)

`asyncHandler.ts`, `cryptoUtils.ts`, `env.ts`, `constants.ts`, `errors.ts`, `responseUtils.ts`, `rtdbKeys.ts`, `utils.ts`(firebase), `clientIp.ts`, `createRateLimiter.ts`, `rateLimitKeys.ts`, `requestParsing.ts`, `requestContextHelpers.ts`, `requestContext.ts`, `requestLogger.ts`, `errorMiddleware.ts`(partial), `requestMetadata.ts`(partial), `firestoreDate.ts`, `sessionDeletion.ts`, `sessionFamilyMutations.ts`, `sessionMfaPolicy.ts`, `sessionResponse.ts`(partial), `sessionTokenUtils.ts`(partial), `validateSession.ts`, `AuthSessionService.ts`, `SessionRevocationService.ts`, `rotateRefreshToken.ts`, `mfaCodeFormats.ts`, `mfaErrors.ts`, `mfaTotp.ts`, `mfaRecoveryCodes.ts`, `EncryptedUserDataValidator.ts`, `UserKeyRepository.ts`, `userKeyRefs.ts`, `userKeyRecordSet.ts`, `UsernameIdentity.ts`, `pushTokenGuards.ts`, `pushTokenNormalization.ts`, `NotificationService.ts`, `maintenanceJobs.ts`

---

## 3. Test Structural Issues (Remaining)

### 3.1 Multi-Module Test Files

| Test File | Source Modules Tested | Action |
|-----------|----------------------|--------|
| [`httpMiddleware.test.ts`](tests/unit/api/middleware/httpMiddleware.test.ts) | `errorMiddleware.ts`, `requestMetadata.ts`, `ResponseUtils` | Split into 2 files: `errorMiddleware.test.ts` (keep), `requestMetadata.test.ts` (extract). ResponseUtils already has its own test. |
| [`sessionSecurity.test.ts`](tests/unit/features/session/application/sessionSecurity.test.ts) | `sessionTokenUtils.ts`, `sessionMfaPolicy.ts`, `sessionResponse.ts` | `requiresMfaForRefresh` tests are **redundant** with `sessionMfaPolicy.test.ts`. The token utils tests (`generateRefreshToken`, `parseRefreshTokenId`, `normalizeDeviceId`) and `buildSessionResponse` tests are **not covered elsewhere**. Action: **rename** to `sessionTokenUtils.test.ts`, remove only the MFA policy section. |
| [`sessionRequests.test.ts`](tests/unit/features/session/api/sessionRequests.test.ts) | `sessionRequests.ts`, `mfaRequests.ts`, `userRequests.ts`, `pushTokenNormalization.ts` | Split: extract MFA parsing to `mfaRequests.test.ts`, user parsing to `userRequests.test.ts`. Keep session-specific in-place. pushTokenNormalization already has own test. |

### 3.2 Fake Firestore Limitation

The [`fakeFirestore.ts`](tests/helpers/fakeFirestore.ts) mock is good for documents/sessions/transactions but **missing**:
- `db.getAll(refs, { fieldMask })` — used by [`UserRepository.ts`](src/features/user/infrastructure/UserRepository.ts) and [`RecoveryAccessService.ts`](src/features/auth/recovery/RecoveryAccessService.ts)
- `doc.get(field)` on `FakeDocumentSnapshot` — used by field-mask reads throughout user feature

**Recommendation:** Extend `fakeFirestore.ts` to support these. This unblocks 4-5 high-value tests.

### 3.3 Integration Test

The single emulator integration test at [`tests/integration/userKeyRecords.integration.test.ts`](tests/integration/userKeyRecords.integration.test.ts) tests 5 unrelated features in one file:
1. Key record CRUD through public APIs
2. Session authentication rejection
3. Refresh token rotation + reuse revocation
4. Recovery challenge + token creation
5. Push token save + delete
6. MFA setup + enable + trust + disable
7. Recovery code auto-regeneration

**Action:** Split into focused integration test files matching the proposed structure in the original plan.

---

## 4. New Tests to Add (Prioritized)

### Tier 1 — Unblocks other tests (fake Firestore extension)

| # | Action | Impact |
|---|--------|--------|
| 1 | Extend `fakeFirestore.ts` with `db.getAll()` and `doc.get(field)` support | Unblocks 5 service tests |
| 2 | [`userReads.test.ts`](tests/unit/features/user/application/userReads.test.ts) | `getUser`, `getUserMfaState`, `getEncryptedUser` |
| 3 | [`userRepository.test.ts`](tests/unit/features/user/infrastructure/UserRepository.test.ts) | `getUserRef`, `getUserDoc`, `getUserWithFieldMask` |

### Tier 2 — Pure functions (no Firebase dependency)

| # | Test File | Source Module |
|---|-----------|---------------|
| 4 | [`apiMessages.test.ts`](tests/unit/api/http/apiMessages.test.ts) | Verify message structure/keys are consistent |
| 5 | [`notificationOptions.test.ts`](tests/unit/features/notification/application/notificationOptions.test.ts) | Extract from notificationPayloads, add edge cases |
| 6 | [`expoPushPayloads.test.ts`](tests/unit/features/notification/application/expoPushPayloads.test.ts) | Extract from notificationPayloads |
| 7 | [`mfaRequests.test.ts`](tests/unit/features/mfa/api/mfaRequests.test.ts) | Extract from sessionRequests, test `parseMfaEnableRequest`, `parseSessionTrustRequest` |
| 8 | [`userRequests.test.ts`](tests/unit/features/user/api/userRequests.test.ts) | Extract from sessionRequests, test `parseCreateUserRequest`, `parseKeyRecordRequest`, `parseSavePushTokenRequest`, `parseDeletePushTokenRequest`, `parseChangePasswordRequest`, `parseKeyRecordIdParam` |
| 9 | [`rateLimitTypes.test.ts`](tests/unit/api/rate-limit/rateLimitTypes.test.ts) | Type compilation verification (can be a simple smoke test) |

### Tier 3 — Service tests (mockable with current fake Firestore)

| # | Test File | Source Module | Notes |
|---|-----------|---------------|-------|
| 10 | [`sessionRecordStore.test.ts`](tests/unit/features/session/application/sessionRecordStore.test.ts) | `createAccessTokenForFamily`, `getValidActiveAccessSession`, `queueFamilyRecordDeletes`, `queueStaleDeviceFamilyDeletes` | Needs transaction + query mock |
| 11 | [`createSession.test.ts`](tests/unit/features/session/application/createSession.test.ts) | `createBackendSession` — batch commit, stale device cleanup, response building | Needs batch + query mock |
| 12 | [`setupMfa.test.ts`](tests/unit/features/mfa/application/setupMfa.test.ts) | `setupMfa` — TOTP generation, recovery code generation, Firestore write | |
| 13 | [`enableMfa.test.ts`](tests/unit/features/mfa/application/enableMfa.test.ts) | `verifyAndEnableMfa` — TOTP verification, MFA flag update, session regeneration | |
| 14 | [`disableMfa.test.ts`](tests/unit/features/mfa/application/disableMfa.test.ts) | `disableMfa` — secret removal, recovery code removal, session regeneration | |
| 15 | [`expiredSessionCleanup.test.ts`](tests/unit/features/session/application/expiredSessionCleanup.test.ts) | `cleanupExpiredSessionRecords` — query + batch delete | |
| 16 | [`expiredMfaSetupCleanup.test.ts`](tests/unit/features/mfa/application/expiredMfaSetupCleanup.test.ts) | `cleanupExpiredMfaSetups` — query + batch delete | |

### Tier 4 — Integration tests

| # | Test File | Scenario |
|---|-----------|----------|
| 17 | `sessionFlow.test.ts` | Session creation → refresh → reuse detection → revocation |
| 18 | `recoveryFlow.test.ts` | Challenge → token creation |
| 19 | `keyRecords.test.ts` | CRUD through public API |
| 20 | `pushTokens.test.ts` | Save/delete through public API |
| 21 | `mfaLifecycle.test.ts` | Setup → enable → trust → disable |
| 22 | `mfaRecoveryFlow.test.ts` | Recovery code regeneration, auto-regeneration at threshold |
| 23 | `sessionSignOut.test.ts` | Sign out → verify access + refresh tokens rejected |
| 24 | `sessionRevokeAll.test.ts` | Revoke all → verify all tokens rejected |
| 25 | `rateLimiting.test.ts` | Hit limit → 429 → Retry-After header |
| 26 | `errorHandling.test.ts` | Invalid JSON → 400, entity too large → 413, missing auth → 401, internal error → 500 |

---

## 5. Tests to Remove / Split

| File | Action |
|------|--------|
| [`sessionSecurity.test.ts`](tests/unit/features/session/application/sessionSecurity.test.ts) | **Rename** to `sessionTokenUtils.test.ts` and trim: remove the 2 `requiresMfaForRefresh` tests (redundant with `sessionMfaPolicy.test.ts`). Keep the `generateRefreshToken`, `parseRefreshTokenId`, `normalizeDeviceId`, and `buildSessionResponse` tests (no other test covers these). |
| [`httpMiddleware.test.ts`](tests/unit/api/middleware/httpMiddleware.test.ts) | **Split** — Extract requestMetadata tests and responseUtils tests. Keep errorMiddleware tests. ResponseUtils already has dedicated test. |
| [`sessionRequests.test.ts`](tests/unit/features/session/api/sessionRequests.test.ts) | **Split** — Extract MFA and user parsing sections to their own files. |

---

## 6. Bugs Found

**None.** The single bug previously identified (logger circular reference) was fixed in commit `e0095c19`.

---

## 7. Implementation Phases

### Phase A: Test Cleanup (3 files to split/remove)
- Remove `sessionSecurity.test.ts` (redundant)
- Split `httpMiddleware.test.ts` → extract requestMetadata section
- Split `sessionRequests.test.ts` → extract MFA + user parsing to dedicated files

### Phase B: Fake Firestore Extension (unblocks 5 tests)
- Add `db.getAll()` support with fieldMask filtering
- Add `doc.get(field)` to FakeDocumentSnapshot
- Add `userReads.test.ts` and `userRepository.test.ts`

### Phase C: Remaining Unit Tests (6-8 files)
- Pure functions: apiMessages, notificationOptions (extract), mfaRequests (extract), userRequests (extract)
- Service tests: sessionRecordStore, createSession, setupMfa, enableMfa, disableMfa, MfaSessionService

### Phase D: Integration Test Refactoring (10 files)
- Split monolithic emulator test into focused integration files
- Add missing scenarios (sign-out, revoke-all, rate limiting, error handling)

### Phase E: Polish
- Split notificationPayloads.test.ts into dedicated files
- Add `test:coverage` script
- Consider property-based tests for crypto/validation utilities
