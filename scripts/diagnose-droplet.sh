#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="${REMOTE_HOST:-root@46.101.78.179}"
REMOTE_DIR="${REMOTE_DIR:-/opt/rustdesk-frontend}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "DROPLET DIAGNOSTICS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "📁 Checking if .next directory exists on droplet..."
ssh "$REMOTE_HOST" "test -d $REMOTE_DIR/.next && echo '✓ .next directory EXISTS' || echo '✗ .next directory MISSING'"
echo ""

echo "📁 Listing top-level directories in $REMOTE_DIR..."
ssh "$REMOTE_HOST" "ls -la $REMOTE_DIR/ | grep '^d'"
echo ""

echo "📁 Checking for BUILD_ID in .next..."
ssh "$REMOTE_HOST" "test -f $REMOTE_DIR/.next/BUILD_ID && echo '✓ BUILD_ID exists' && cat $REMOTE_DIR/.next/BUILD_ID || echo '✗ BUILD_ID missing'"
echo ""

echo "📁 Checking src/ subdirectories..."
ssh "$REMOTE_HOST" "ls -R $REMOTE_DIR/src/ | head -50"
echo ""

echo "📦 Checking package.json..."
ssh "$REMOTE_HOST" "test -f $REMOTE_DIR/package.json && echo '✓ package.json exists' || echo '✗ package.json missing'"
echo ""

echo "📁 Checking .env.local..."
ssh "$REMOTE_HOST" "test -f $REMOTE_DIR/.env.local && echo '✓ .env.local exists' || echo '✗ .env.local missing'"
echo ""

echo "🔍 Checking .next subdirectories (if exists)..."
ssh "$REMOTE_HOST" "test -d $REMOTE_DIR/.next && ls -la $REMOTE_DIR/.next/ | head -20 || echo '.next directory not found'"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"