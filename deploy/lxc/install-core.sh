#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# SidelineOS-Core Installer für Debian 12+ / Ubuntu / Raspberry Pi OS (amd64 & arm64)
# Optimiert für einen kombinierten Proxmox-LXC (PostgreSQL + Node.js 22 + systemd)
# ==============================================================================

if [[ "${EUID}" -ne 0 ]]; then
  echo "Fehler: Bitte als root ausführen (z. B. sudo bash $0)." >&2
  exit 1
fi

APP_DIR="${APP_DIR:-/opt/sidelineos-core}"
APP_USER="${APP_USER:-sidelineos}"
REPO_URL="${REPO_URL:-https://github.com/moritztw/SidelineOS-core.git}"
BRANCH="${BRANCH:-main}"
DB_NAME="${DB_NAME:-sidelineos}"
DB_USER="${DB_USER:-sidelineos}"

ARCH="$(dpkg --print-architecture 2>/dev/null || uname -m)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

echo "==> [1/7] Systempakete & PostgreSQL installieren (Architektur: ${ARCH})..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg openssl git tar rsync postgresql postgresql-client

echo "==> [2/7] Node.js 22.x prüfen / installieren..."
NODE_MAJOR=0
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
fi
if [[ "${NODE_MAJOR}" -lt 22 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi
echo "    Node.js aktiv: $(node -v) | npm: $(npm -v)"

echo "==> [3/7] Systembenutzer '${APP_USER}' und Verzeichnis '${APP_DIR}' vorbereiten..."
if ! id -u "${APP_USER}" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "${APP_DIR}" --shell /usr/sbin/nologin "${APP_USER}"
fi
mkdir -p "${APP_DIR}"

if [[ ! -f "${APP_DIR}/package.json" ]]; then
  if [[ -f "${SOURCE_ROOT}/package.json" ]] && [[ "${SOURCE_ROOT}" != "${APP_DIR}" ]]; then
    echo "    Kopiere lokalen Checkout aus ${SOURCE_ROOT} nach ${APP_DIR}..."
    rsync -a --exclude node_modules --exclude dist --exclude .env "${SOURCE_ROOT}/" "${APP_DIR}/"
  else
    echo "    Klone ${REPO_URL} (${BRANCH}) nach ${APP_DIR}..."
    git clone --branch "${BRANCH}" --depth 1 "${REPO_URL}" "${APP_DIR}"
  fi
fi

mkdir -p "${APP_DIR}/.sidelineos-data/plugins"

echo "==> [4/7] Lokalen PostgreSQL-Dienst & Datenbank '${DB_NAME}' einrichten..."
systemctl enable --now postgresql

if [[ ! -f "${APP_DIR}/.env" ]]; then
  DB_PASS="$(openssl rand -hex 20)"
  SESSION_SECRET="$(openssl rand -hex 32)"

  su - postgres -c "psql -v ON_ERROR_STOP=1" <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASS}';
  ELSE
    ALTER ROLE ${DB_USER} WITH PASSWORD '${DB_PASS}';
  END IF;
END
\$\$;
SQL

  if ! su - postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'\"" | grep -q 1; then
    su - postgres -c "createdb -O ${DB_USER} ${DB_NAME}"
  fi

  cp "${APP_DIR}/.env.example" "${APP_DIR}/.env"
  sed -i -E "s|^SESSION_SECRET=.*|SESSION_SECRET=\"${SESSION_SECRET}\"|" "${APP_DIR}/.env"
  sed -i -E "s|^DATABASE_URL=.*|DATABASE_URL=\"postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:5432/${DB_NAME}\"|" "${APP_DIR}/.env"

  if ! grep -q '^NODE_ENV=' "${APP_DIR}/.env"; then
    printf '\nNODE_ENV="production"\n' >> "${APP_DIR}/.env"
  else
    sed -i -E 's|^NODE_ENV=.*|NODE_ENV="production"|' "${APP_DIR}/.env"
  fi
  sed -i -E 's|^DEV_ALLOW_GIT_INSTALL=.*|DEV_ALLOW_GIT_INSTALL="false"|' "${APP_DIR}/.env"

  INIT_CORE_VERSION=""
  if [[ -d "${APP_DIR}/.git" ]]; then
    INIT_TAG="$(git -C "${APP_DIR}" describe --tags --exact-match HEAD 2>/dev/null || true)"
    if [[ -n "${INIT_TAG}" ]]; then
      INIT_CORE_VERSION="${INIT_TAG#v}"
    else
      INIT_BRANCH="$(git -C "${APP_DIR}" symbolic-ref --short HEAD 2>/dev/null || git -C "${APP_DIR}" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
      INIT_SHA="$(git -C "${APP_DIR}" rev-parse --short HEAD 2>/dev/null || true)"
      if [[ -n "${INIT_BRANCH}" && "${INIT_BRANCH}" != "HEAD" && -n "${INIT_SHA}" ]]; then
        CLEAN_BRANCH="$(printf '%s' "${INIT_BRANCH}" | sed -E 's|[^a-zA-Z0-9._-]+|-|g; s|^-+||; s|-+$||')"
        INIT_CORE_VERSION="${CLEAN_BRANCH}-${INIT_SHA}"
      fi
    fi
  fi
  if [[ -n "${INIT_CORE_VERSION}" ]]; then
    if grep -q '^CORE_VERSION=' "${APP_DIR}/.env"; then
      sed -i -E "s|^CORE_VERSION=.*|CORE_VERSION=\"${INIT_CORE_VERSION}\"|" "${APP_DIR}/.env"
    else
      printf '\nCORE_VERSION="%s"\n' "${INIT_CORE_VERSION}" >> "${APP_DIR}/.env"
    fi
  fi

  chmod 600 "${APP_DIR}/.env"
  echo "    Neue .env erzeugt (Zufalls-DB-Passwort & SESSION_SECRET gesetzt)."
else
  echo "    Bestehende .env gefunden – Datenbank- und App-Konfiguration bleibt unverändert."
fi

chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"

echo "==> [5/7] Abhängigkeiten installieren & Production-Build erzeugen..."
su -s /bin/bash "${APP_USER}" -c "cd '${APP_DIR}' && npm ci && npm run build && npm run build:sdk"

echo "==> [6/7] systemd-Service einrichten & starten..."
cp "${APP_DIR}/deploy/lxc/sidelineos-core.service" /etc/systemd/system/sidelineos-core.service
systemctl daemon-reload
systemctl enable --now sidelineos-core

echo "==> [7/7] Healthcheck prüfen..."
HEALTH_OK=false
for _ in $(seq 1 15); do
  if curl -fsS http://127.0.0.1:3000/api/v1/health >/dev/null 2>&1; then
    HEALTH_OK=true
    break
  fi
  sleep 1
done

echo ""
if [[ "${HEALTH_OK}" == "true" ]]; then
  echo "SidelineOS-Core läuft erfolgreich auf Port 3000!"
else
  echo "Hinweis: Dienst gestartet, Healthcheck antwortet noch nicht. Logs prüfen mit:"
  echo "  journalctl -u sidelineos-core -n 50 --no-pager"
fi

echo ""
echo "Nächste Schritte:"
echo "  1. Prüfe ${APP_DIR}/.env (APP_URL, INITIAL_SYSADMIN_*, Cloudflare R2 S3_*)."
echo "  2. Nach .env-Änderungen (insb. VITE_APP_BRAND_NAME):"
echo "       cd ${APP_DIR} && sudo -u ${APP_USER} npm run build && systemctl restart sidelineos-core"
echo "  3. Logs: journalctl -u sidelineos-core -f"
