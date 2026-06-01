#!/usr/bin/env bash
set -Eeuo pipefail

# Purrivacy Docker VPS deployment bootstrapper.
#
# Cloudflare Tunnel / reverse proxy is intentionally outside this Docker stack.
# Existing host route should point to:
#   prod: http://127.0.0.1:3002

APP_DIR="${PURRIVACY_APP_DIR:-/srv/purrivacy}"
APP_USER="${PURRIVACY_APP_USER:-purrivacy}"
REPO_URL="${PURRIVACY_REPO_URL:-https://github.com/zig-zag-zig/Purrivacy.git}"
REPO_BRANCH="${PURRIVACY_DEPLOY_BRANCH:-main}"
INSTALL_DOCKER="false"
START_STACK="false"
FORCE_SECRET_OVERWRITE="false"
ENV_FILE_SOURCE=""
FIREBASE_SERVICE_ACCOUNT_FILE_SOURCE=""
SECRETS_SOURCE_DIR=""
PREBUILT_IMAGE="${PURRIVACY_DEPLOY_IMAGE:-}"
IMAGE_REGISTRY="${PURRIVACY_IMAGE_REGISTRY:-}"
IMAGE_REGISTRY_USER="${PURRIVACY_IMAGE_REGISTRY_USER:-}"
IMAGE_REGISTRY_TOKEN="${PURRIVACY_IMAGE_REGISTRY_TOKEN:-}"

log() { printf '\033[1;34m[INFO]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[WARN]\033[0m %s\n' "$*"; }
err() { printf '\033[1;31m[ERROR]\033[0m %s\n' "$*" >&2; }

usage() {
  cat <<USAGE
Usage: $0 [options]

Options:
  --repo-branch BRANCH          Git branch to checkout/pull. Default: ${REPO_BRANCH}.
  --repo-url URL                Git repo URL. Default: ${REPO_URL}.
  --app-dir PATH                Default: ${APP_DIR}.
  --app-user USER               Linux user that owns/runs the app. Default: ${APP_USER}.
  --install-docker              Force Docker Engine + Compose plugin install.
                                Docker is installed automatically if missing.
  --start                       Build and start the Compose stack.
  --prebuilt-image IMAGE        Use this already-built app image and pull it
                                instead of building on the VPS.
  --force-secret-overwrite      Overwrite env/secret files from provided sources/templates.
  --env-file PATH               Copy this file to .env.prod.
  --firebase-service-account-file PATH
                                Copy this file to secrets/prod/firebase-service-account.json.
  --secrets-source-dir DIR      Read source files from DIR:
                                  DIR/.env or DIR/.env.prod
                                  DIR/firebase-service-account.json
  --help                        Show this help.

Environment variables:
  PURRIVACY_REPO_URL            Optional repo URL override.
  PURRIVACY_DEPLOY_BRANCH       Optional branch override.
  PURRIVACY_APP_DIR             Optional app directory override.
  PURRIVACY_APP_USER            Optional app user override.
  PURRIVACY_DEPLOY_IMAGE        Optional prebuilt app image. Usually set by CI.
  PURRIVACY_IMAGE_REGISTRY      Optional registry for docker login, e.g. ghcr.io.
  PURRIVACY_IMAGE_REGISTRY_USER Optional registry username.
  PURRIVACY_IMAGE_REGISTRY_TOKEN
                                Optional registry token. Avoid printing this.

Example:
  sudo ./scripts/deploy_purrivacy_docker.sh \\
    --repo-branch main \\
    --secrets-source-dir /root/purrivacy-secrets \\
    --start
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app-dir) APP_DIR="$2"; shift 2 ;;
    --app-user) APP_USER="$2"; shift 2 ;;
    --repo-url) REPO_URL="$2"; shift 2 ;;
    --repo-branch|--branch) REPO_BRANCH="$2"; shift 2 ;;
    --install-docker) INSTALL_DOCKER="true"; shift ;;
    --start) START_STACK="true"; shift ;;
    --prebuilt-image) PREBUILT_IMAGE="$2"; shift 2 ;;
    --force-secret-overwrite) FORCE_SECRET_OVERWRITE="true"; shift ;;
    --env-file) ENV_FILE_SOURCE="$2"; shift 2 ;;
    --firebase-service-account-file) FIREBASE_SERVICE_ACCOUNT_FILE_SOURCE="$2"; shift 2 ;;
    --secrets-source-dir) SECRETS_SOURCE_DIR="$2"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) err "Unknown option: $1"; usage; exit 2 ;;
  esac
done

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || { err "Missing required command: $1"; exit 1; }
}

as_root_or_sudo() {
  if [[ "${EUID}" -ne 0 ]]; then
    err "Run this script as root, for example with sudo."
    exit 1
  fi
}

sha_file() {
  if [[ -f "$1" ]]; then sha256sum "$1" | awk '{print $1}'; else echo ""; fi
}

copy_source_file() {
  local src="$1"
  local dest="$2"
  local mode="$3"
  local owner="$4"

  if [[ ! -f "$src" ]]; then
    err "Source file does not exist: $src"
    exit 1
  fi

  mkdir -p "$(dirname "$dest")"

  if [[ -f "$dest" && "$(sha_file "$src")" == "$(sha_file "$dest")" ]]; then
    log "unchanged from source: $dest"
    chmod "$mode" "$dest" || true
    chown "$owner" "$dest" || true
    return 0
  fi

  if [[ -f "$dest" ]]; then
    cp -a "$dest" "$dest.bak.$(date -u +%Y%m%dT%H%M%SZ)"
    log "updated from source with backup: $dest"
  else
    log "created from source: $dest"
  fi

  install -m "$mode" -o "${owner%%:*}" -g "${owner##*:}" "$src" "$dest"
}

write_file() {
  local path="$1"
  local mode="$2"
  local owner="$3"
  local tmp
  tmp="$(mktemp)"
  cat > "$tmp"

  mkdir -p "$(dirname "$path")"

  if [[ -f "$path" ]]; then
    if [[ "$(sha_file "$path")" == "$(sha_file "$tmp")" ]]; then
      log "unchanged: $path"
      rm -f "$tmp"
      chmod "$mode" "$path" || true
      chown "$owner" "$path" || true
      return 0
    fi
    cp -a "$path" "$path.bak.$(date -u +%Y%m%dT%H%M%SZ)"
    log "updated with backup: $path"
  else
    log "created: $path"
  fi

  install -m "$mode" -o "${owner%%:*}" -g "${owner##*:}" "$tmp" "$path"
  rm -f "$tmp"
}

read_env_value() {
  local file="$1"
  local key="$2"
  local line

  if [[ ! -f "$file" ]]; then
    return 0
  fi

  line="$(grep -m1 "^${key}=" "$file" || true)"
  if [[ -n "$line" ]]; then
    printf '%s\n' "${line#*=}"
  fi
}

replace_or_append_env() {
  local file="$1"
  local key="$2"
  local value="$3"

  if grep -q "^${key}=" "$file"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

run_as_app_user() {
  if command -v sudo >/dev/null 2>&1; then
    sudo -u "$APP_USER" "$@"
  else
    "$@"
  fi
}

install_docker() {
  log "Installing Docker Engine and Compose plugin from Docker apt repository"
  export DEBIAN_FRONTEND=noninteractive
  rm -f /etc/apt/sources.list.d/docker.list /etc/apt/sources.list.d/docker.sources
  apt-get remove -y docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc >/dev/null 2>&1 || true
  apt-get update
  apt-get install -y ca-certificates curl gnupg git openssl
  install -m 0755 -d /etc/apt/keyrings

  local codename arch docker_os
  # shellcheck disable=SC1091
  . /etc/os-release

  case "${ID:-}" in
    ubuntu)
      docker_os="ubuntu"
      codename="${UBUNTU_CODENAME:-${VERSION_CODENAME:-}}"
      ;;
    debian)
      docker_os="debian"
      codename="${VERSION_CODENAME:-}"
      ;;
    *)
      case " ${ID_LIKE:-} " in
        *" ubuntu "*)
          docker_os="ubuntu"
          codename="${UBUNTU_CODENAME:-${VERSION_CODENAME:-}}"
          ;;
        *" debian "*)
          docker_os="debian"
          codename="${VERSION_CODENAME:-}"
          ;;
        *)
          err "Unsupported OS for Docker apt repo: ${PRETTY_NAME:-unknown}. Install Docker manually or update this script."
          exit 1
          ;;
      esac
      ;;
  esac

  if [[ -z "$codename" ]]; then
    err "Could not detect ${docker_os} codename for Docker apt repo."
    exit 1
  fi

  curl -fsSL "https://download.docker.com/linux/${docker_os}/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc

  arch="$(dpkg --print-architecture)"
  cat > /etc/apt/sources.list.d/docker.sources <<EOF_REPO
Types: deb
URIs: https://download.docker.com/linux/${docker_os}
Suites: ${codename}
Components: stable
Architectures: ${arch}
Signed-By: /etc/apt/keyrings/docker.asc
EOF_REPO

  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
  systemctl enable --now containerd
}

prepare_user_and_dirs() {
  if ! id "$APP_USER" >/dev/null 2>&1; then
    log "Creating system user: $APP_USER"
    useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
  fi

  if getent group docker >/dev/null 2>&1; then
    usermod -aG docker "$APP_USER"
  fi

  install -d -m 0750 -o "$APP_USER" -g "$APP_USER" "$APP_DIR"
}

sync_repo() {
  if [[ ! -d "$APP_DIR/.git" ]]; then
    log "Cloning $REPO_URL branch $REPO_BRANCH into $APP_DIR"
    rm -rf "$APP_DIR"
    install -d -m 0750 -o "$APP_USER" -g "$APP_USER" "$APP_DIR"
    run_as_app_user git clone --depth 1 --branch "$REPO_BRANCH" "$REPO_URL" "$APP_DIR"
  else
    log "Updating $APP_DIR to $REPO_BRANCH"
    run_as_app_user git -C "$APP_DIR" remote set-url origin "$REPO_URL"
    run_as_app_user git -C "$APP_DIR" fetch --depth 1 origin "$REPO_BRANCH"
    run_as_app_user git -C "$APP_DIR" checkout -B "$REPO_BRANCH" "origin/$REPO_BRANCH"
    run_as_app_user git -C "$APP_DIR" reset --hard "origin/$REPO_BRANCH"
  fi

  chown -R "$APP_USER:$APP_USER" "$APP_DIR"
}

resolve_secret_sources() {
  if [[ -n "$SECRETS_SOURCE_DIR" ]]; then
    if [[ -z "$ENV_FILE_SOURCE" ]]; then
      if [[ -f "$SECRETS_SOURCE_DIR/.env.prod" ]]; then
        ENV_FILE_SOURCE="$SECRETS_SOURCE_DIR/.env.prod"
      elif [[ -f "$SECRETS_SOURCE_DIR/.env" ]]; then
        ENV_FILE_SOURCE="$SECRETS_SOURCE_DIR/.env"
      fi
    fi

    if [[ -z "$FIREBASE_SERVICE_ACCOUNT_FILE_SOURCE" && -f "$SECRETS_SOURCE_DIR/firebase-service-account.json" ]]; then
      FIREBASE_SERVICE_ACCOUNT_FILE_SOURCE="$SECRETS_SOURCE_DIR/firebase-service-account.json"
    fi
  fi
}

ensure_runtime_files() {
  local owner="$APP_USER:$APP_USER"
  local env_file="$APP_DIR/.env.prod"
  local secrets_dir="$APP_DIR/secrets/prod"

  install -d -m 0755 -o "$APP_USER" -g "$APP_USER" "$APP_DIR/secrets" "$secrets_dir"

  resolve_secret_sources

  if [[ -n "$ENV_FILE_SOURCE" ]]; then
    if [[ ! -f "$env_file" || "$FORCE_SECRET_OVERWRITE" == "true" ]]; then
      copy_source_file "$ENV_FILE_SOURCE" "$env_file" 0600 "$owner"
    else
      warn "$env_file already exists; not overwriting without --force-secret-overwrite"
    fi
  elif [[ ! -f "$env_file" ]]; then
    write_file "$env_file" 0600 "$owner" < "$APP_DIR/.env.prod.example"
    warn "Created $env_file from example. Fill real secrets before starting."
  fi

  if [[ -n "$FIREBASE_SERVICE_ACCOUNT_FILE_SOURCE" ]]; then
    if [[ ! -f "$secrets_dir/firebase-service-account.json" || "$FORCE_SECRET_OVERWRITE" == "true" ]]; then
      copy_source_file "$FIREBASE_SERVICE_ACCOUNT_FILE_SOURCE" "$secrets_dir/firebase-service-account.json" 0644 "$owner"
    else
      warn "$secrets_dir/firebase-service-account.json already exists; not overwriting without --force-secret-overwrite"
    fi
  fi

  chmod 0755 "$APP_DIR/secrets" "$secrets_dir" 2>/dev/null || true
  chmod 0644 "$secrets_dir/firebase-service-account.json" 2>/dev/null || true
  chown -R "$owner" "$APP_DIR/secrets" || true
}

validate_runtime_files() {
  local env_file="$APP_DIR/.env.prod"
  local firebase_path
  local firebase_json
  local mfa_kek
  local auth_email_domain

  if [[ ! -f "$env_file" ]]; then
    err "Missing env file: $env_file"
    exit 1
  fi

  auth_email_domain="$(read_env_value "$env_file" AUTH_EMAIL_DOMAIN)"
  mfa_kek="$(read_env_value "$env_file" MFA_KEK)"
  firebase_path="$(read_env_value "$env_file" GOOGLE_APPLICATION_CREDENTIALS)"
  firebase_json="$(read_env_value "$env_file" FIREBASE_SERVICE_ACCOUNT_JSON)"

  if [[ -z "$auth_email_domain" || "$auth_email_domain" == "purr.ivacy" ]]; then
    warn "AUTH_EMAIL_DOMAIN is currently '$auth_email_domain'. Confirm this is intentional."
  fi

  if [[ -z "$mfa_kek" || "$mfa_kek" == replace-with-* ]]; then
    err "MFA_KEK must be set in $env_file"
    exit 1
  fi

  if [[ -z "$firebase_json" ]]; then
    if [[ "$firebase_path" != "/var/purrivacy/secrets/firebase-service-account.json" ]]; then
      err "GOOGLE_APPLICATION_CREDENTIALS should be /var/purrivacy/secrets/firebase-service-account.json inside Docker"
      exit 1
    fi

    if [[ ! -f "$APP_DIR/secrets/prod/firebase-service-account.json" ]]; then
      err "Missing Firebase service account: $APP_DIR/secrets/prod/firebase-service-account.json"
      exit 1
    fi
  fi

  if [[ -n "$PREBUILT_IMAGE" ]]; then
    replace_or_append_env "$env_file" PURRIVACY_IMAGE "$PREBUILT_IMAGE"
    chown "$APP_USER:$APP_USER" "$env_file" || true
    chmod 0600 "$env_file" || true
  fi
}

docker_registry_login() {
  if [[ -z "$PREBUILT_IMAGE" || -z "$IMAGE_REGISTRY" ]]; then
    return 0
  fi

  if [[ -z "$IMAGE_REGISTRY_USER" || -z "$IMAGE_REGISTRY_TOKEN" ]]; then
    warn "Image registry token/user not provided; attempting docker pull with existing credentials."
    return 0
  fi

  log "Logging Docker in to $IMAGE_REGISTRY as $IMAGE_REGISTRY_USER"
  printf '%s\n' "$IMAGE_REGISTRY_TOKEN" | run_as_app_user docker login "$IMAGE_REGISTRY" -u "$IMAGE_REGISTRY_USER" --password-stdin >/dev/null
}

start_stack() {
  log "Starting Purrivacy Docker stack"

  docker_registry_login

  if [[ -n "$PREBUILT_IMAGE" ]]; then
    log "Pulling prebuilt image: $PREBUILT_IMAGE"
    run_as_app_user docker compose --env-file "$APP_DIR/.env.prod" -f "$APP_DIR/docker-compose.yml" pull purrivacy
    run_as_app_user docker compose --env-file "$APP_DIR/.env.prod" -f "$APP_DIR/docker-compose.yml" up -d --no-build
  else
    run_as_app_user docker compose --env-file "$APP_DIR/.env.prod" -f "$APP_DIR/docker-compose.yml" up -d --build
  fi

  run_as_app_user docker compose --env-file "$APP_DIR/.env.prod" -f "$APP_DIR/docker-compose.yml" ps
}

main() {
  as_root_or_sudo
  need_cmd git

  if [[ "$INSTALL_DOCKER" == "true" ]] \
    || ! command -v docker >/dev/null 2>&1 \
    || ! docker compose version >/dev/null 2>&1; then
    install_docker
  fi

  need_cmd docker

  prepare_user_and_dirs
  sync_repo
  ensure_runtime_files
  validate_runtime_files

  if [[ "$START_STACK" == "true" ]]; then
    start_stack
  else
    log "Prepared $APP_DIR. Re-run with --start to build and start Docker."
  fi

  log "Purrivacy deployment preparation complete."
}

main "$@"
