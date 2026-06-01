# Purrivacy Docker Deployment Notes

Purrivacy is deployed as a separate Docker Compose project from Pawify. It does not use Dapr or Redis.

## Host Route

Your VPS-level tunnel or reverse proxy should keep pointing at:

```text
http://127.0.0.1:3002
```

Purrivacy listens on port `3002` inside the container and Docker maps `127.0.0.1:3002 -> purrivacy:3002`.

## VPS Secrets

For GitHub Actions deploys, store the file contents in GitHub environment secrets and the workflow writes them to the VPS on each deploy.

Configure these GitHub environment secrets in `production`:

- `PURRIVACY_ENV_FILE_B64`: base64 of `.env.prod`.
- `PURRIVACY_FIREBASE_SERVICE_ACCOUNT_JSON_B64`: base64 of `firebase-service-account.json`.

Create the base64 values locally:

```bash
base64 -w 0 .env.prod
base64 -w 0 secrets/prod/firebase-service-account.json
```

The workflow decodes them to:

```text
/root/purrivacy-secrets/.env
/root/purrivacy-secrets/firebase-service-account.json
```

The `.env` file should come from `.env.prod.example` and must include real values for:

- `AUTH_EMAIL_DOMAIN`
- `MFA_KEK`
- `GOOGLE_APPLICATION_CREDENTIALS=/var/purrivacy/secrets/firebase-service-account.json` or `FIREBASE_SERVICE_ACCOUNT_JSON`
- Firebase/Sentry values used by production

Recommended permissions:

```bash
chmod 700 /root/purrivacy-secrets
chmod 600 /root/purrivacy-secrets/*
```

## GitHub Actions Deploy

The workflow is `.github/workflows/deploy.yml`.

Pull requests into `main` run:

```text
npm ci
npm run build
npm test --if-present
docker build
```

Pushes to `main` build and push a GHCR image, then deploy production. Manual workflow runs from `main` do the same.

Docker builds use Buildx with the GitHub Actions cache, so repeated PR and deploy builds can reuse unchanged Docker layers while still producing an image for the exact commit being checked or deployed.

Branch flow:

- Work from `feature/<short-name>`, `fix/<short-name>`, or `hotfix/<short-name>` branches.
- Open pull requests into `main`.
- Keep `main` protected and production-ready.
- There is no `develop` or test deploy branch for Purrivacy right now.

Configure these GitHub environment or repository secrets:

- `PURRIVACY_VPS_HOST`: VPS hostname or IP.
- `PURRIVACY_VPS_USER`: SSH user on the VPS.
- `PURRIVACY_VPS_SSH_KEY`: private SSH key for that user.
- `PURRIVACY_VPS_PORT`: optional SSH port. Defaults to `22` when empty.

Configure these GitHub repository variables if needed:

- `PURRIVACY_REPO_URL`: optional. Defaults to `https://github.com/<owner>/<repo>.git`.
- `PURRIVACY_SECRET_SOURCE_DIR`: optional. Defaults to `/root/purrivacy-secrets`.

For a private repository, prefer setting `PURRIVACY_REPO_URL` to an SSH URL such as `git@github.com:zig-zag-zig/Purrivacy.git` and install the matching deploy key on the VPS, because the VPS performs the clone/pull.

The workflow uses `GITHUB_TOKEN` to push and pull GHCR images, so repository workflow permissions must allow packages write access.

Docker is installed automatically by the deploy script if the VPS is missing Docker or the Compose plugin.

## Manual VPS Deploy

From a repo checkout on the VPS:

```bash
sudo ./scripts/deploy_purrivacy_docker.sh \
  --repo-url https://github.com/zig-zag-zig/Purrivacy.git \
  --repo-branch main \
  --secrets-source-dir /root/purrivacy-secrets \
  --force-secret-overwrite \
  --start
```

If PM2 currently owns port `3002`, stop it before starting Docker:

```bash
pm2 stop purrivacy
pm2 delete purrivacy
pm2 save
```

## Health Check

```bash
cd /srv/purrivacy
docker compose --env-file .env.prod ps
curl http://127.0.0.1:3002/v1/health
```
