# Purrivacy Backend

Purrivacy Backend is the TypeScript/Express API for the Purrivacy app. It handles Firebase-backed user data, application sessions, MFA, account recovery, and Expo push token management.

## Features

- Firebase Admin integration for Auth, Firestore, and Realtime Database
- Versioned REST API under `/v1`
- App-managed access and refresh sessions
- Session revocation, token rotation, and sign-out flows
- TOTP MFA with trusted sessions and recovery codes
- Encrypted user data and key update endpoints
- Expo push token registration and cleanup
- Request logging, request IDs, rate limits, and centralized error responses

## Tech Stack

- Node.js
- TypeScript
- Express
- Firebase Admin SDK
- Expo Server SDK
- OTPAuth

## Related Repositories

- [PurrivacyApp](https://github.com/zig-zag-zig/PurrivacyApp) - Expo/React Native mobile client for this API

## Getting Started

Install dependencies:

```bash
npm install
```

Create your local environment file:

```bash
cp .env.example .env
```

Update `.env` with your Firebase and runtime settings. At minimum, provide:

```env
AUTH_EMAIL_DOMAIN=purr.ivacy
MFA_KEK=replace-with-openssl-rand-hex-32
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/firebase-admin.json
```

You can generate a local MFA key-encryption key with:

```bash
openssl rand -hex 32
```

Start the development server:

```bash
npm run dev
```

The API defaults to `http://localhost:5000`.

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | No | Server port. Defaults to `5000`. |
| `NODE_ENV` | No | Runtime environment. Defaults to `development`. |
| `LOG_LEVEL` | No | Logger level. Defaults to `info`. |
| `TRUST_PROXY` | No | Enables Express `trust proxy` when running behind a proxy. |
| `ALLOWED_ORIGINS` | No | Comma-separated list of allowed origins for deployments that use CORS at the edge/app layer. |
| `AUTH_EMAIL_DOMAIN` | Yes | Email domain used by the app authentication flow. |
| `GOOGLE_APPLICATION_CREDENTIALS` | Yes* | Absolute path to a Firebase service account JSON file. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Yes* | Inline Firebase service account JSON. Useful for hosted environments. |
| `FIREBASE_DATABASE_URL` | No | Firebase Realtime Database URL, if used by your project. |
| `MFA_KEK` | Yes | Hex key used to protect MFA secrets. Generate with `openssl rand -hex 32`. |
| `REQUEST_JSON_LIMIT` | No | JSON body size limit. Defaults to `10mb`. |
| `REQUEST_FORM_LIMIT` | No | URL-encoded form body size limit. Defaults to `1mb`. |

`GOOGLE_APPLICATION_CREDENTIALS` or `FIREBASE_SERVICE_ACCOUNT_JSON` must be set. Do not commit Firebase credentials or production secrets.

## Scripts

```bash
npm run dev      # Start the TypeScript dev server
npm test         # Run the Jest test suite
npm run build    # Compile TypeScript into lib/
npm start        # Run the compiled production server
```

## API Overview

All current routes are available under `/v1`. The app also exposes compatibility aliases at the root for older clients.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/v1/health` | Health check |
| `POST` | `/v1/user` | Create a user record after Firebase auth |
| `GET` | `/v1/user` | Read the current encrypted user record |
| `POST` | `/v1/user/update-keys` | Update stored user keys |
| `POST` | `/v1/user/change-password` | Update encrypted DEK password data |
| `DELETE` | `/v1/user` | Delete the current user |
| `POST` | `/v1/user/save-push-token` | Register an Expo push token |
| `POST` | `/v1/user/delete-push-token` | Delete an Expo push token |
| `POST` | `/v1/auth/session` | Create an app session from Firebase auth |
| `POST` | `/v1/auth/session/refresh` | Refresh an app session |
| `POST` | `/v1/auth/recovery/challenge` | Request account recovery challenge data |
| `POST` | `/v1/auth/recovery/token` | Create a recovery access token |
| `POST` | `/v1/auth/revoke-all-sessions` | Revoke all sessions for the current user |
| `POST` | `/v1/auth/sign-out` | Revoke the current refresh-token family |
| `POST` | `/v1/mfa/setup` | Start MFA setup |
| `POST` | `/v1/mfa/enable` | Verify and enable MFA |
| `POST` | `/v1/mfa/disable` | Disable MFA |
| `POST` | `/v1/mfa/session/trust` | Update MFA trust for the current session family |
| `POST` | `/v1/mfa/recovery-codes/regenerate` | Regenerate MFA recovery codes |
| `GET` | `/v1/mfa/recovery-codes/remaining` | Get remaining recovery code count |

Authenticated endpoints expect a Bearer token in the `Authorization` header. Device-aware session and push-token flows may also require `x-device-id`.

## Testing

Run the backend test suite:

```bash
npm test
```

The current tests cover session request parsing, refresh-token/session security helpers, rate-limit key construction, and related edge cases without writing to a live Firebase project.

## Production Notes

- Run `npm run build` before deploying and start the app with `npm start`.
- Set `NODE_ENV=production`.
- Set `TRUST_PROXY=true` when the app runs behind a trusted proxy or load balancer.
- Prefer environment-managed secrets over files in hosted environments.
- Rotate `MFA_KEK` carefully; existing encrypted MFA secrets depend on it.
- Keep Firebase service account permissions scoped to what the API needs.

## License

This project is licensed under the 0BSD license.
