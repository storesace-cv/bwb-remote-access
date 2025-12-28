#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="${REMOTE_HOST:-root@46.101.78.179}"
REMOTE_DIR="${REMOTE_DIR:-/opt/rustdesk-frontend}"
FRONTEND_USER="${FRONTEND_USER:-rustdeskweb}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "DROPLET CLEANUP - Prepare for Fresh Deployment"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "⚠️  This will:"
echo "   1. Stop the rustdesk-frontend service"
echo "   2. Stop all PM2 processes"
echo "   3. Remove ALL files from $REMOTE_DIR (except .pm2 logs)"
echo "   4. Recreate the directory with correct ownership"
echo ""
echo "This is a DESTRUCTIVE operation!"
read -p "Continue? (type 'yes' to proceed): " -r CONFIRM

if [[ "$CONFIRM" != "yes" ]]; then
  echo "Cleanup cancelled."
  exit 0
fi

echo ""
echo "[Cleanup] Stopping services..."
ssh "$REMOTE_HOST" "sudo systemctl stop rustdesk-frontend.service || true"
ssh "$REMOTE_HOST" "sudo -u $FRONTEND_USER pm2 delete all 2>/dev/null || true"
ssh "$REMOTE_HOST" "sudo -u $FRONTEND_USER pm2 kill 2>/dev/null || true"

echo "[Cleanup] Removing old files..."
ssh "$REMOTE_HOST" "sudo rm -rf $REMOTE_DIR/*"
ssh "$REMOTE_HOST" "sudo rm -rf $REMOTE_DIR/.next"
ssh "$REMOTE_HOST" "sudo rm -rf $REMOTE_DIR/.npm"

echo "[Cleanup] Recreating directory with correct ownership..."
ssh "$REMOTE_HOST" "sudo mkdir -p $REMOTE_DIR"
ssh "$REMOTE_HOST" "sudo chown -R $FRONTEND_USER:$FRONTEND_USER $REMOTE_DIR"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Cleanup complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Next steps:"
echo "  1. Run: ./scripts/Step-2-build-local.sh"
echo "  2. Run: ./scripts/Step-4-deploy-tested-build.sh"
echo ""