#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

REMOTE_HOST="${REMOTE_HOST:-root@46.101.78.179}"
REMOTE_DIR="${REMOTE_DIR:-/opt/rustdesk-frontend}"
FRONTEND_USER="${FRONTEND_USER:-rustdeskweb}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "RSYNC .next DIAGNOSTIC SCRIPT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 1. Check local .next
echo "📦 Step 1: Checking LOCAL .next directory..."
if [[ ! -d "$REPO_ROOT/.next" ]]; then
  echo "❌ ERROR: Local .next directory does not exist!"
  exit 1
fi

LOCAL_BUILD_ID=$(cat "$REPO_ROOT/.next/BUILD_ID" 2>/dev/null || echo "MISSING")
LOCAL_NEXT_FILES=$(find "$REPO_ROOT/.next" -type f | wc -l)

echo "✅ Local .next exists"
echo "   BUILD_ID: $LOCAL_BUILD_ID"
echo "   File count: $LOCAL_NEXT_FILES"
echo ""

# 2. Check remote directory permissions and existence
echo "📦 Step 2: Checking REMOTE directory state..."
ssh "$REMOTE_HOST" "ls -ld $REMOTE_DIR/ 2>/dev/null || echo 'Remote dir missing'"
echo ""

# 3. Remove old remote .next and create fresh
echo "📦 Step 3: Cleaning old remote .next..."
ssh "$REMOTE_HOST" "sudo rm -rf $REMOTE_DIR/.next"
echo "✅ Old .next removed"
echo ""

# 4. Create fresh remote .next with correct ownership
echo "📦 Step 4: Creating fresh remote .next directory..."
ssh "$REMOTE_HOST" "sudo mkdir -p $REMOTE_DIR/.next && sudo chown -R $FRONTEND_USER:$FRONTEND_USER $REMOTE_DIR/.next"
echo "✅ Fresh .next created"
echo ""

# 5. Verify remote .next exists before rsync
echo "📦 Step 5: Verifying remote .next exists..."
if ! ssh "$REMOTE_HOST" "test -d $REMOTE_DIR/.next"; then
  echo "❌ ERROR: Remote .next directory was not created!"
  exit 1
fi
ssh "$REMOTE_HOST" "ls -ld $REMOTE_DIR/.next"
echo "✅ Remote .next verified"
echo ""

# 6. Test rsync with verbose output
echo "📦 Step 6: Testing rsync transfer..."
echo "   Source: $REPO_ROOT/.next/"
echo "   Destination: $REMOTE_HOST:$REMOTE_DIR/.next/"
echo ""
echo "Running rsync with -avz --checksum --progress..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# IMPORTANT: Check what rsync actually does by capturing its output
echo "[DEBUG] About to run rsync..."
echo "[DEBUG] Command: rsync -avz --checksum --progress '$REPO_ROOT/.next/' '$REMOTE_HOST:$REMOTE_DIR/.next/'"

# Try WITHOUT --rsync-path first to see if that's the issue
if ! rsync -avz --checksum --progress \
  "$REPO_ROOT/.next/" \
  "$REMOTE_HOST:$REMOTE_DIR/.next/" 2>&1 | tee /tmp/rsync-diagnostic.log; then
  echo ""
  echo "❌ ERROR: rsync failed!"
  echo "   Full output saved to: /tmp/rsync-diagnostic.log"
  exit 1
fi

echo ""
echo "✅ rsync completed"
echo ""

# IMMEDIATELY check if directory still exists
echo "📦 Step 6.1: IMMEDIATE CHECK - Does .next still exist after rsync?"
if ! ssh "$REMOTE_HOST" "test -d $REMOTE_DIR/.next"; then
  echo "❌ CRITICAL: .next directory DISAPPEARED after rsync!"
  echo "   This suggests rsync is deleting the target directory!"
  exit 1
fi
echo "✅ .next directory still exists"
echo ""

# DIAGNOSTIC: Check if files went to wrong location
echo "📦 Step 6.2: DIAGNOSTIC - Checking file contents..."
echo ""
echo "Listing $REMOTE_DIR/.next/ (should show files now):"
ssh "$REMOTE_HOST" "ls -la $REMOTE_DIR/.next/ 2>&1 | head -20"
echo ""

# Check file count immediately
echo "Counting files in $REMOTE_DIR/.next/:"
IMMEDIATE_FILE_COUNT=$(ssh "$REMOTE_HOST" "find $REMOTE_DIR/.next -type f 2>/dev/null | wc -l" || echo "0")
echo "   File count: $IMMEDIATE_FILE_COUNT"
echo ""

if [[ "$IMMEDIATE_FILE_COUNT" -eq 0 ]]; then
  echo "❌ ERROR: Files were transferred but directory is empty!"
  echo "   Checking directory permissions:"
  ssh "$REMOTE_HOST" "ls -ld $REMOTE_DIR/.next/"
  echo ""
  echo "   Checking parent directory:"
  ssh "$REMOTE_HOST" "ls -la $REMOTE_DIR/ | grep next"
  exit 1
fi

# Fix ownership after rsync
echo "📦 Step 6.3: Fixing ownership after rsync..."
ssh "$REMOTE_HOST" "sudo chown -R $FRONTEND_USER:$FRONTEND_USER $REMOTE_DIR/.next"
echo "✅ Ownership fixed"
echo ""

# 7. Verify files arrived
echo "📦 Step 7: Verifying files arrived on droplet..."
REMOTE_NEXT_FILES=$(ssh "$REMOTE_HOST" "find $REMOTE_DIR/.next -type f 2>/dev/null | wc -l" || echo "0")
echo "   Remote file count: $REMOTE_NEXT_FILES"
echo "   Local file count:  $LOCAL_NEXT_FILES"
echo ""

if [[ "$REMOTE_NEXT_FILES" -eq 0 ]]; then
  echo "❌ ERROR: Zero files on remote after rsync!"
  echo ""
  echo "Remote .next contents:"
  ssh "$REMOTE_HOST" "ls -la $REMOTE_DIR/.next/ 2>&1"
  exit 1
fi

# 8. Check BUILD_ID specifically
echo "📦 Step 8: Checking BUILD_ID transfer..."
if ! ssh "$REMOTE_HOST" "test -f $REMOTE_DIR/.next/BUILD_ID"; then
  echo "❌ ERROR: BUILD_ID missing on remote!"
  exit 1
fi

REMOTE_BUILD_ID=$(ssh "$REMOTE_HOST" "cat $REMOTE_DIR/.next/BUILD_ID" 2>/dev/null)
echo "   Local BUILD_ID:  $LOCAL_BUILD_ID"
echo "   Remote BUILD_ID: $REMOTE_BUILD_ID"

if [[ "$LOCAL_BUILD_ID" != "$REMOTE_BUILD_ID" ]]; then
  echo "❌ ERROR: BUILD_ID mismatch!"
  exit 1
fi

echo "✅ BUILD_ID match confirmed"
echo ""

# 9. Check critical subdirectories
echo "📦 Step 9: Checking critical subdirectories..."
MISSING_DIRS=()

if ! ssh "$REMOTE_HOST" "test -d $REMOTE_DIR/.next/server"; then
  MISSING_DIRS+=("server/")
fi
if ! ssh "$REMOTE_HOST" "test -d $REMOTE_DIR/.next/static"; then
  MISSING_DIRS+=("static/")
fi

if [[ ${#MISSING_DIRS[@]} -gt 0 ]]; then
  echo "❌ ERROR: Missing critical directories:"
  for dir in "${MISSING_DIRS[@]}"; do
    echo "   - $dir"
  done
  exit 1
fi

echo "✅ All critical subdirectories present"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ SUCCESS: .next directory successfully synced!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Summary:"
echo "  Local files:  $LOCAL_NEXT_FILES"
echo "  Remote files: $REMOTE_NEXT_FILES"
echo "  BUILD_ID:     $LOCAL_BUILD_ID"
echo ""