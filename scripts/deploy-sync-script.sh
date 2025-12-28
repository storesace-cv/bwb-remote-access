#!/usr/bin/env bash
set -euo pipefail

# Deploy script for MeshCentral → Supabase sync infrastructure
#
# This script:
# 1. Copies systemd service/timer units to /etc/systemd/system/
# 2. Reloads systemd daemon
# 3. Enables and starts the timer
# 4. Shows status
#
# Usage (from local machine):
#   ./scripts/deploy-sync-script.sh root@46.101.78.179
#
# Or run manually on droplet as root:
#   bash /opt/rustdesk-frontend/scripts/deploy-sync-script.sh local

REMOTE_TARGET="${1:-}"
MODE="remote"

if [ "$REMOTE_TARGET" = "local" ]; then
  MODE="local"
  REMOTE_TARGET=""
fi

if [ "$MODE" = "remote" ] && [ -z "$REMOTE_TARGET" ]; then
  echo "Usage: $0 <user@host>"
  echo "   or: $0 local (when running on droplet as root)"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_FILE="$SCRIPT_DIR/meshcentral-supabase-sync.service"
TIMER_FILE="$SCRIPT_DIR/meshcentral-supabase-sync.timer"

if [ ! -f "$SERVICE_FILE" ] || [ ! -f "$TIMER_FILE" ]; then
  echo "ERROR: Service or timer file not found in $SCRIPT_DIR"
  exit 1
fi

if [ "$MODE" = "local" ]; then
  echo "🚀 Installing MeshCentral sync service/timer (local mode)..."
  
  # Check we're running as root
  if [ "$(id -u)" -ne 0 ]; then
    echo "ERROR: This script must run as root when in local mode"
    exit 1
  fi
  
  # Make sync script executable
  chmod +x /opt/rustdesk-frontend/scripts/sync-meshcentral-to-supabase.sh
  
  # Copy units
  cp "$SERVICE_FILE" /etc/systemd/system/
  cp "$TIMER_FILE" /etc/systemd/system/
  
  # Reload systemd
  systemctl daemon-reload
  
  # Enable and start timer
  systemctl enable meshcentral-supabase-sync.timer
  systemctl start meshcentral-supabase-sync.timer
  
  echo ""
  echo "✅ MeshCentral sync timer installed and started"
  echo ""
  echo "Status:"
  systemctl status meshcentral-supabase-sync.timer --no-pager
  echo ""
  echo "To run sync manually:"
  echo "  systemctl start meshcentral-supabase-sync.service"
  echo ""
  echo "To view logs:"
  echo "  journalctl -u meshcentral-supabase-sync.service -n 50"
else
  echo "🚀 Installing MeshCentral sync service/timer on $REMOTE_TARGET..."
  
  # Run installation on remote
  ssh "$REMOTE_TARGET" bash <<'REMOTE_SCRIPT'
set -euo pipefail

SERVICE_FILE="/opt/rustdesk-frontend/scripts/meshcentral-supabase-sync.service"
TIMER_FILE="/opt/rustdesk-frontend/scripts/meshcentral-supabase-sync.timer"
SYNC_SCRIPT="/opt/rustdesk-frontend/scripts/sync-meshcentral-to-supabase.sh"

if [ ! -f "$SERVICE_FILE" ] || [ ! -f "$TIMER_FILE" ] || [ ! -f "$SYNC_SCRIPT" ]; then
  echo "ERROR: Required files not found in /opt/rustdesk-frontend/scripts/"
  echo "Please run Step-4-deploy-tested-build.sh first"
  exit 1
fi

# Make sync script executable
chmod +x "$SYNC_SCRIPT"

# Copy units
cp "$SERVICE_FILE" /etc/systemd/system/
cp "$TIMER_FILE" /etc/systemd/system/

# Reload systemd
systemctl daemon-reload

# Enable and start timer
systemctl enable meshcentral-supabase-sync.timer
systemctl start meshcentral-supabase-sync.timer

echo ""
echo "✅ MeshCentral sync timer installed and started"
echo ""
echo "Status:"
systemctl status meshcentral-supabase-sync.timer --no-pager
REMOTE_SCRIPT
  
  echo ""
  echo "✅ Remote installation completed"
  echo ""
  echo "To view status:"
  echo "  ssh $REMOTE_TARGET 'systemctl status meshcentral-supabase-sync.timer'"
  echo ""
  echo "To run sync manually:"
  echo "  ssh $REMOTE_TARGET 'systemctl start meshcentral-supabase-sync.service'"
  echo ""
  echo "To view logs:"
  echo "  ssh $REMOTE_TARGET 'journalctl -u meshcentral-supabase-sync.service -n 50'"
fi