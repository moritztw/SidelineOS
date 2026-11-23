#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# SidelineOS-Core Update-Skript für Proxmox-LXC / systemd (inkl. PostgreSQL-Backup)
# Nutzung: sudo bash deploy/lxc/update-core.sh [optionaler-git-tag-oder-branch]
# ==============================================================================

if [[ "${EUID}" -ne 0 ]]; then
  echo "Fehler: Bitte als root ausführen." >&2
  exit 1
fi

APP_DIR="${APP_DIR:-/opt/sidelineos-core}"
APP_USER="${APP_USER:-sidelineos}"
DB_NAME="${DB_NAME:-sidelineos}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/sidelineos}"
TARGET_REF="${1:-}"

if [[ ! -f "${APP_DIR}/package.json" ]]; then
  echo "Fehler: ${APP_DIR}/package.json nicht gefunden." >&2
  exit 1
fi

echo "==> [1/5] PostgreSQL-Backup erstellen..."
mkdir -p "${BACKUP_DIR}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${STAMP}.sql.gz"
su - postgres -c "pg_dump '${DB_NAME}'" | gzip -c > "${BACKUP_FILE}"
chmod 600 "${BACKUP_FILE}"
echo "    Backup gespeichert: ${BACKUP_FILE}"

echo "==> [2/5] Quellcode aktualisieren..."
if [[ -d "${APP_DIR}/.git" ]]; then
  if [[ -n "${TARGET_REF}" ]]; then
    su -s /bin/bash "${APP_USER}" -c "cd '${APP_DIR}' && git fetch --tags --prune && git checkout '${TARGET_REF}'"
  else
    su -s /bin/bash "${APP_USER}" -c "cd '${APP_DIR}' && git pull --ff-only"
  fi
else
  echo "    Kein .git-Verzeichnis vorhanden – überspringe Git-Pull und baue lokalen Stand."
fi

ermittle_core_version() {
  if [[ -d "${APP_DIR}/.git" ]]; then
    local tag
    tag="$(su -s /bin/bash "${APP_USER}" -c "cd '${APP_DIR}' && git describe --tags --exact-match HEAD 2>/dev/null" || true)"
    if [[ -n "${tag}" ]]; then
      printf '%s\n' "${tag#v}"
      return
    fi
    local branch sha
    branch="$(su -s /bin/bash "${APP_USER}" -c "cd '${APP_DIR}' && git symbolic-ref --short HEAD 2>/dev/null || git rev-parse --abbrev-ref HEAD 2>/dev/null" || true)"
    sha="$(su -s /bin/bash "${APP_USER}" -c "cd '${APP_DIR}' && git rev-parse --short HEAD 2>/dev/null" || true)"
    if [[ -n "${branch}" && "${branch}" != "HEAD" && -n "${sha}" ]]; then
      local clean_branch
      clean_branch="$(printf '%s' "${branch}" | sed -E 's|[^a-zA-Z0-9._-]+|-|g; s|^-+||; s|-+$||')"
      printf '%s-%s\n' "${clean_branch}" "${sha}"
      return
    fi
  fi
  node -e "const fs=require('fs');console.log(JSON.parse(fs.readFileSync('${APP_DIR}/package.json','utf8')).version || '0.1.0');"
}

if [[ -f "${APP_DIR}/.env" ]]; then
  NEW_CORE_VERSION="$(ermittle_core_version)"
  if grep -q '^CORE_VERSION=' "${APP_DIR}/.env"; then
    sed -i -E "s|^CORE_VERSION=.*|CORE_VERSION=\"${NEW_CORE_VERSION}\"|" "${APP_DIR}/.env"
  else
    printf '\nCORE_VERSION="%s"\n' "${NEW_CORE_VERSION}" >> "${APP_DIR}/.env"
  fi
  chown "${APP_USER}:${APP_USER}" "${APP_DIR}/.env"
  chmod 600 "${APP_DIR}/.env"
  echo "    CORE_VERSION in .env aktualisiert: ${NEW_CORE_VERSION}"
fi

echo "==> [3/5] Abhängigkeiten & Production-Build erneuern..."
su -s /bin/bash "${APP_USER}" -c "cd '${APP_DIR}' && npm ci && npm run build && npm run build:sdk"

echo "==> [4/5] Service-Unit prüfen & neu starten..."
cp "${APP_DIR}/deploy/lxc/sidelineos-core.service" /etc/systemd/system/sidelineos-core.service
systemctl daemon-reload
systemctl restart sidelineos-core

echo "==> [5/5] Healthcheck prüfen..."
for i in $(seq 1 15); do
  if curl -fsS http://127.0.0.1:3000/api/v1/health; then
    echo ""
    echo "Update erfolgreich abgeschlossen."
    exit 0
  fi
  sleep 1
done

echo "Fehler: Healthcheck nach Update nicht erreichbar. Logs:" >&2
journalctl -u sidelineos-core -n 40 --no-pager >&2
exit 1
