#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/deploy-rustdesk-frontend-service.sh [user@host]
# Copies scripts/rustdesk-frontend.service to /etc/systemd/system on the remote
# host, backs up the existing unit, reloads systemd and restarts the service.

REMOTE_HOST="${1:-root@46.101.78.179}"
LOCAL_SERVICE="scripts/rustdesk-frontend.service"
REMOTE_SERVICE="/etc/systemd/system/rustdesk-frontend.service"

echo "[deploy-rustdesk-frontend-service] Remote host: ${REMOTE_HOST}"

if ! command -v ssh >/dev/null 2>&1; then
  echo "Error: ssh is required but not found in PATH" >&2
  exit 1
fi

if ! command -v scp >/dev/null 2>&1; then
  echo "Error: scp is required but not found in PATH" >&2
  exit 1
fi

if [ ! -f "${LOCAL_SERVICE}" ]; then
  echo "Error: ${LOCAL_SERVICE} not found. Run this from the project root directory." >&2
  exit 1
fi

echo "[deploy-rustdesk-frontend-service] Copying unit file to remote /tmp..."
scp "${LOCAL_SERVICE}" "${REMOTE_HOST}:/tmp/rustdesk-frontend.service"

echo "[deploy-rustdesk-frontend-service] Installing unit on remote host..."
ssh "${REMOTE_HOST}" bash <<'EOF'
set -euo pipefail

REMOTE_SERVICE="/etc/systemd/system/rustdesk-frontend.service"
BACKUP="/etc/systemd/system/rustdesk-frontend.service.bak-$(date -u +%Y%m%d-%H%M%S)"

if [ -f "${REMOTE_SERVICE}" ]; then
  echo "[remote] Backing up existing unit to ${BACKUP}"
  sudo cp "${REMOTE_SERVICE}" "${BACKUP}"
fi

echo "[remote] Moving new unit into place..."
sudo mv /tmp/rustdesk-frontend.service "${REMOTE_SERVICE}"
sudo chown root:root "${REMOTE_SERVICE}"
sudo chmod 644 "${REMOTE_SERVICE}"

echo "[remote] Reloading systemd and restarting rustdesk-frontend.service..."
sudo systemctl daemon-reload
sudo systemctl restart rustdesk-frontend.service

echo "[remote] Service status:"
sudo systemctl status --no-pager rustdesk-frontend.service || true
EOF

echo "[deploy-rustdesk-frontend-service] Done."