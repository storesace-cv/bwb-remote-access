#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/setup-rustsync-timer.sh [user@host]
# Default remote: root@46.101.78.179

REMOTE_HOST="${1:-root@46.101.78.179}"
REMOTE_DIR="/opt/rustdesk-integration"
LOCAL_SYNC_SCRIPT="scripts/sync-devices.sh"

echo "[setup-rustsync-timer] Remote host: ${REMOTE_HOST}"
echo "[setup-rustsync-timer] Remote base dir: ${REMOTE_DIR}"

if ! command -v ssh >/dev/null 2>&1; then
  echo "Error: ssh is required but not found in PATH" >&2
  exit 1
fi

if ! command -v scp >/dev/null 2>&1; then
  echo "Error: scp is required but not found in PATH" >&2
  exit 1
fi

if [ ! -f "${LOCAL_SYNC_SCRIPT}" ]; then
  echo "Error: ${LOCAL_SYNC_SCRIPT} not found in repo root. Run this from the project root directory." >&2
  exit 1
fi

echo "[setup-rustsync-timer] Copying sync-devices.sh to remote..."
scp "${LOCAL_SYNC_SCRIPT}" "${REMOTE_HOST}:/tmp/rustsync-sync-devices.sh"

echo "[setup-rustsync-timer] Applying configuration on remote host..."
ssh "${REMOTE_HOST}" bash <<'EOF'
set -euo pipefail

REMOTE_DIR="/opt/rustdesk-integration"
SYNC_BIN="${REMOTE_DIR}/bin/sync-devices.sh"
SYNC_ENV="${REMOTE_DIR}/etc/sync-env.sh"
SYSTEMD_SERVICE="/etc/systemd/system/rustsync.service"
SYSTEMD_TIMER="/etc/systemd/system/rustsync.timer"

echo "[remote] Ensuring base directories exist..."
sudo mkdir -p "${REMOTE_DIR}/bin" "${REMOTE_DIR}/logs" "${REMOTE_DIR}/etc"

echo "[remote] Creating rustsync user (system, no shell) if needed..."
if ! id rustsync >/dev/null 2>&1; then
  sudo adduser --system --no-create-home --group rustsync
fi

echo "[remote] Installing sync-devices.sh under root-owned bin/..."
sudo mv "/tmp/rustsync-sync-devices.sh" "${SYNC_BIN}"
sudo chown root:root "${SYNC_BIN}"
sudo chmod 750 "${SYNC_BIN}"

echo "[remote] Ensuring sync-env.sh exists with safe permissions..."
if [ ! -f "${SYNC_ENV}" ]; then
  sudo tee "${SYNC_ENV}" >/dev/null <<'EOT'
#!/usr/bin/env bash
# Environment for rustsync service.
# Populate with the minimal secrets required for sync:
#   SYNC_JWT=...
#   SYNC_API_SECRET=...
#   NEXT_PUBLIC_SUPABASE_URL=...
#   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
# This file is owned by root and readable by the rustsync group only.
EOT
  sudo chmod 640 "${SYNC_ENV}"
  sudo chown root:rustsync "${SYNC_ENV}"
fi

echo "[remote] Writing rustsync.service unit..."
sudo tee "${SYSTEMD_SERVICE}" >/dev/null <<'EOT'
[Unit]
Description=RustDesk device sync (MeshCentral → Supabase)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=rustsync
Group=rustsync
WorkingDirectory=/opt/rustdesk-integration
EnvironmentFile=-/opt/rustdesk-integration/etc/sync-env.sh
ExecStart=/opt/rustdesk-integration/bin/sync-devices.sh

# Hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/rustdesk-integration/logs
CapabilityBoundingSet=
RestrictSUIDSGID=true
LockPersonality=true
ProtectHostname=true
ProtectKernelLogs=true
ProtectKernelModules=true
ProtectKernelTunables=true

[Install]
WantedBy=multi-user.target
EOT

echo "[remote] Writing rustsync.timer unit..."
sudo tee "${SYSTEMD_TIMER}" >/dev/null <<'EOT'
[Unit]
Description=Run RustDesk device sync periodically

[Timer]
OnBootSec=2min
OnUnitActiveSec=15min
RandomizedDelaySec=60
Unit=rustsync.service

[Install]
WantedBy=timers.target
EOT

echo "[remote] Disabling any root cron entries that call sync-devices.sh..."
if sudo crontab -l >/tmp/root-cron.before 2>/dev/null; then
  sudo crontab -l | sed '/rustdesk-frontend\/scripts\/sync-devices.sh/d;/rustdesk-integration\/scripts\/sync-devices.sh/d' | sudo crontab -
  echo "[remote] Root crontab cleaned. Backup at /tmp/root-cron.before"
else
  echo "[remote] No root crontab found or could not read crontab."
fi

echo "[remote] Reloading systemd and enabling timer..."
sudo systemctl daemon-reload
sudo systemctl enable --now rustsync.timer

echo "[remote] rustsync.timer status:"
sudo systemctl status --no-pager rustsync.timer || true
EOF

echo "[setup-rustsync-timer] Done."