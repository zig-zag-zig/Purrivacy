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
cp .env.local.example .env
```

Update `.env` with your Firebase and runtime settings. For a bare Node run, point Firebase at a host path instead of the Docker container path. At minimum, provide:

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

With the example env file, the API runs at `http://localhost:3002`. Without `PORT`, the app default is `5000`.

## Docker

Purrivacy can run as its own small Docker Compose project. Keep it separate from Pawify so each app can deploy, restart, roll back, and tune memory without affecting the other one.

For local Docker:

```bash
cp .env.local.example .env.local
```

Keep these Docker-local values:

```env
COMPOSE_PROJECT_NAME=purrivacy-local
PURRIVACY_ENV_FILE=.env.local
PURRIVACY_IMAGE=purrivacy:local
PURRIVACY_SECRETS_DIR=./secrets/local
PURRIVACY_HOST_BIND_ADDRESS=127.0.0.1
PURRIVACY_HOST_PORT=3002
APP_ENV=local
NODE_ENV=production
SENTRY_ENABLED=false
GOOGLE_APPLICATION_CREDENTIALS=/var/purrivacy/secrets/firebase-service-account.json
```

Put the Firebase service account here:

```text
secrets/local/firebase-service-account.json
```

Then run:

```bash
docker compose --env-file .env.local up -d --build
curl http://127.0.0.1:3002/v1/health
```

For the VPS, create ignored files:

```text
/root/purrivacy-secrets/.env
/root/purrivacy-secrets/firebase-service-account.json
```

The `.env` file should match `.env.prod.example`, with real values for `MFA_KEK`, Firebase, Sentry, and `AUTH_EMAIL_DOMAIN`. Keep:

```env
PURRIVACY_HOST_BIND_ADDRESS=127.0.0.1
PURRIVACY_HOST_PORT=3002
PORT=3002
GOOGLE_APPLICATION_CREDENTIALS=/var/purrivacy/secrets/firebase-service-account.json
```

The normal deploy path is GitHub Actions: pull requests into `main` run CI, and pushes to `main` build a GHCR image and deploy production. The VPS pulls the prebuilt image instead of building it locally.

Configure GitHub secrets:

```text
PURRIVACY_VPS_HOST
PURRIVACY_VPS_USER
PURRIVACY_VPS_SSH_KEY
PURRIVACY_VPS_PORT
PURRIVACY_ENV_FILE_B64
PURRIVACY_FIREBASE_SERVICE_ACCOUNT_JSON_B64
```

Configure GitHub variables if needed:

```text
PURRIVACY_REPO_URL
PURRIVACY_SECRET_SOURCE_DIR
```

Create the base64 secret values locally with `base64 -w 0 .env.prod` and `base64 -w 0 secrets/prod/firebase-service-account.json`. Docker is installed automatically by the deploy script if the VPS is missing Docker or the Compose plugin.

Manual deploy from a repo checkout on the VPS is still available:

```bash
sudo ./scripts/deploy_purrivacy_docker.sh \
  --repo-url https://github.com/zig-zag-zig/Purrivacy.git \
  --repo-branch main \
  --secrets-source-dir /root/purrivacy-secrets \
  --force-secret-overwrite \
  --start
```

If PM2 is currently using port `3002`, stop it before starting Docker:

```bash
pm2 stop purrivacy
pm2 delete purrivacy
pm2 save
```

After Docker is healthy, the VPS tunnel can keep pointing at `http://127.0.0.1:3002`.

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

## Branching And Releases

Purrivacy uses trunk-based development:

- `main` is the protected production branch.
- Pull requests into `main` run CI.
- Merging or pushing to `main` builds a GHCR image and deploys production.

Working branches:

- `feature/<short-name>` for new behavior.
- `fix/<short-name>` for normal bug fixes.
- `hotfix/<short-name>` for urgent production fixes.

Normal flow:

```bash
git switch main
git pull --ff-only origin main
git switch -c feature/<short-name>
```

Open pull requests from `feature/*` or `fix/*` into `main`. When merged, GitHub Actions runs CI, builds the Docker image, and deploys production.

Hotfix flow:

```bash
git switch main
git pull --ff-only origin main
git switch -c hotfix/<short-name>
```

Open the hotfix pull request into `main`. Once merged, it deploys through the same production pipeline.

There is no `develop` or test deploy branch for Purrivacy.

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
