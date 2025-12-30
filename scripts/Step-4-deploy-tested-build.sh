#!/usr/bin/env bash
#
# Step 4: Deploy to Droplet (Auth0-aware, SoT Compliant)
#
# SoT Reference: /docs/SoT/AUTH_AND_MIDDLEWARE_ARCHITECTURE.md
#
# Strategy: rsync source + build on droplet (deterministic)
#
# Versão: 20251229.2200
# Última atualização: 2025-12-29 22:00 UTC
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# ═══════════════════════════════════════════════════════════════════════════════
# CANONICAL BOUNDARY FILE (per SoT)
# Next.js 16 requires proxy.ts at project root
# ═══════════════════════════════════════════════════════════════════════════════
CANONICAL_BOUNDARY_FILE="proxy.ts"

# Configuration
DEPLOY_HOST="${DEPLOY_HOST:-46.101.78.179}"
DEPLOY_USER="${DEPLOY_USER:-rustdeskweb}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/rustdesk-frontend}"
DEPLOY_SSH_ALIAS="${DEPLOY_SSH_ALIAS:-rustdesk-do}"

# SSH options
SSH_IDENTITY_FILE="${SSH_IDENTITY_FILE:-}"
SSH_COMMON_OPTS="-o StrictHostKeyChecking=accept-new -o BatchMode=yes -o ConnectTimeout=10"
if [[ -n "$SSH_IDENTITY_FILE" && -f "$SSH_IDENTITY_FILE" ]]; then
  SSH_COMMON_OPTS="$SSH_COMMON_OPTS -i $SSH_IDENTITY_FILE"
fi

RSYNC_OPTS="-avz --delete"
REMOTE_DIR="${DEPLOY_PATH}"

# ═══════════════════════════════════════════════════════════════════════════════
# SoT COMPLIANCE GATE
# Reference: /docs/SoT/AUTH_AND_MIDDLEWARE_ARCHITECTURE.md
# ═══════════════════════════════════════════════════════════════════════════════
sot_compliance_gate() {
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║         SoT Compliance Gate - Auth & Middleware            ║"
  echo "║  Reference: /docs/SoT/AUTH_AND_MIDDLEWARE_ARCHITECTURE.md  ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  echo ""
  echo "📋 Canonical boundary file: $CANONICAL_BOUNDARY_FILE"
  echo ""

  local GATE_FAILED=0

  # A) Canonical boundary file MUST exist at repo root
  echo "🔍 [A] Checking canonical boundary file..."
  if [[ -f "$REPO_ROOT/$CANONICAL_BOUNDARY_FILE" ]]; then
    echo "   ✅ PASS: $CANONICAL_BOUNDARY_FILE exists at root"
    echo "   📄 Size: $(wc -c < "$REPO_ROOT/$CANONICAL_BOUNDARY_FILE") bytes"
    echo "   📄 MD5:  $(md5sum "$REPO_ROOT/$CANONICAL_BOUNDARY_FILE" | cut -d' ' -f1)"
  else
    echo "   ❌ FAIL: $CANONICAL_BOUNDARY_FILE NOT found at root"
    echo ""
    echo "   CRITICAL: Without this file, /auth/login WILL return 404"
    echo "   This is the #1 cause of auth failures after deploy."
    echo ""
    echo "   Files at repo root:"
    ls -la "$REPO_ROOT"/*.ts 2>/dev/null | head -10 || echo "      (no .ts files found)"
    GATE_FAILED=1
  fi

  # Check for deprecated/wrong boundary files
  if [[ "$CANONICAL_BOUNDARY_FILE" == "proxy.ts" && -f "$REPO_ROOT/middleware.ts" ]]; then
    echo "   ❌ FAIL: middleware.ts exists (deprecated in Next.js 16)"
    GATE_FAILED=1
  else
    echo "   ✅ PASS: No deprecated middleware.ts"
  fi

  if [[ -f "$REPO_ROOT/src/proxy.ts" ]]; then
    echo "   ❌ FAIL: src/proxy.ts exists (wrong location)"
    GATE_FAILED=1
  else
    echo "   ✅ PASS: No misplaced src/proxy.ts"
  fi

  echo ""

  # B) NextResponse.next() only in canonical boundary file
  echo "🔍 [B] Checking NextResponse.next() usage..."
  local VIOLATIONS
  VIOLATIONS=$(grep -Rna "NextResponse\.next" "$REPO_ROOT" --include="*.ts" --include="*.tsx" 2>/dev/null | grep -vE "^\./$CANONICAL_BOUNDARY_FILE:|^$CANONICAL_BOUNDARY_FILE:|node_modules" || true)
  if [[ -z "$VIOLATIONS" ]]; then
    echo "   ✅ PASS: NextResponse.next() only in $CANONICAL_BOUNDARY_FILE"
  else
    echo "   ❌ FAIL: NextResponse.next() found outside $CANONICAL_BOUNDARY_FILE"
    GATE_FAILED=1
  fi

  echo ""

  # C) Auth0 SDK route reservation
  echo "🔍 [C] Checking /auth/* route reservation..."
  if [[ -d "$REPO_ROOT/src/app/auth" ]]; then
    echo "   ❌ FAIL: src/app/auth/ directory exists"
    echo "      This WILL cause 404 on /auth/login"
    GATE_FAILED=1
  else
    echo "   ✅ PASS: No conflicting src/app/auth/ directory"
  fi

  echo ""

  # D) auth0.middleware() not in route handlers
  echo "🔍 [D] Checking auth0.middleware() usage..."
  local AUTH0_MW_VIOLATIONS
  AUTH0_MW_VIOLATIONS=$(grep -Rna "auth0\.middleware" "$REPO_ROOT/src/app" --include="*.ts" --include="*.tsx" 2>/dev/null || true)
  if [[ -z "$AUTH0_MW_VIOLATIONS" ]]; then
    echo "   ✅ PASS: No auth0.middleware() in route handlers"
  else
    echo "   ❌ FAIL: auth0.middleware() found in route handlers"
    GATE_FAILED=1
  fi

  echo ""

  if [[ $GATE_FAILED -eq 1 ]]; then
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║   ❌ SoT COMPLIANCE GATE FAILED                            ║"
    echo "║                                                            ║"
    echo "║   DEPLOY BLOCKED - Fix violations first.                   ║"
    echo "║   Reference: /docs/SoT/AUTH_AND_MIDDLEWARE_ARCHITECTURE.md ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    exit 1
  else
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║   ✅ SoT COMPLIANCE GATE PASSED                            ║"
    echo "╚════════════════════════════════════════════════════════════╝"
  fi

  echo ""
}

# ═══════════════════════════════════════════════════════════════════════════════
# VERIFY BOUNDARY FILE ON DROPLET
# ═══════════════════════════════════════════════════════════════════════════════
verify_boundary_file_on_droplet() {
  local REMOTE_TARGET="$1"
  
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║    Verifying Boundary File on Droplet                      ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  echo ""

  echo "🔍 Checking for $CANONICAL_BOUNDARY_FILE on droplet..."
  
  local REMOTE_FILE="$REMOTE_DIR/$CANONICAL_BOUNDARY_FILE"
  
  if ssh $SSH_COMMON_OPTS "$REMOTE_TARGET" "test -f '$REMOTE_FILE'"; then
    local REMOTE_SIZE
    REMOTE_SIZE=$(ssh $SSH_COMMON_OPTS "$REMOTE_TARGET" "wc -c < '$REMOTE_FILE'" 2>/dev/null || echo "unknown")
    local REMOTE_MD5
    REMOTE_MD5=$(ssh $SSH_COMMON_OPTS "$REMOTE_TARGET" "md5sum '$REMOTE_FILE' | cut -d' ' -f1" 2>/dev/null || echo "unknown")
    
    echo "   ✅ PASS: $CANONICAL_BOUNDARY_FILE exists on droplet"
    echo "   📄 Path: $REMOTE_FILE"
    echo "   📄 Size: $REMOTE_SIZE bytes"
    echo "   📄 MD5:  $REMOTE_MD5"
    return 0
  else
    echo "   ❌ FAIL: $CANONICAL_BOUNDARY_FILE NOT found on droplet"
    echo ""
    echo "   CRITICAL: This WILL cause /auth/login to return 404"
    echo ""
    echo "   Files at $REMOTE_DIR:"
    ssh $SSH_COMMON_OPTS "$REMOTE_TARGET" "ls -la '$REMOTE_DIR'/*.ts 2>/dev/null || echo '      (no .ts files)'" | head -10
    echo ""
    echo "   Checking for any boundary files:"
    ssh $SSH_COMMON_OPTS "$REMOTE_TARGET" "ls -la '$REMOTE_DIR'/proxy.ts '$REMOTE_DIR'/middleware.ts 2>/dev/null || echo '      NONE FOUND'"
    return 1
  fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# POST-DEPLOY VALIDATION
# ═══════════════════════════════════════════════════════════════════════════════
post_deploy_validation() {
  local REMOTE_TARGET="$1"
  
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║         Post-Deploy Validation - Auth Routes               ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  echo ""

  local VALIDATION_FAILED=0

  # Test 1: Root endpoint (localhost)
  echo "🔍 [1/4] Testing http://127.0.0.1:3000/ ..."
  local ROOT_STATUS
  ROOT_STATUS=$(ssh $SSH_COMMON_OPTS "$REMOTE_TARGET" "curl -s -o /dev/null -w '%{http_code}' 'http://127.0.0.1:3000/'" 2>/dev/null || echo "000")
  echo "   HTTP Status: $ROOT_STATUS"
  if [[ "$ROOT_STATUS" =~ ^(200|301|302|307|308)$ ]]; then
    echo "   ✅ PASS"
  else
    echo "   ❌ FAIL: Expected 200/30x, got $ROOT_STATUS"
    VALIDATION_FAILED=1
  fi

  echo ""

  # Test 2: /auth/login (localhost) - CRITICAL
  echo "🔍 [2/4] Testing http://127.0.0.1:3000/auth/login ..."
  local AUTH_STATUS
  AUTH_STATUS=$(ssh $SSH_COMMON_OPTS "$REMOTE_TARGET" "curl -s -o /dev/null -w '%{http_code}' 'http://127.0.0.1:3000/auth/login'" 2>/dev/null || echo "000")
  echo "   HTTP Status: $AUTH_STATUS"
  if [[ "$AUTH_STATUS" == "404" ]]; then
    echo "   ❌ FAIL: /auth/login returned 404"
    echo ""
    echo "   CRITICAL: Auth0 routes are NOT mounted."
    echo "   Likely cause: $CANONICAL_BOUNDARY_FILE missing or not working."
    VALIDATION_FAILED=1
  elif [[ "$AUTH_STATUS" == "000" ]]; then
    echo "   ❌ FAIL: Could not connect to localhost:3000"
    echo "   Service may not be running"
    VALIDATION_FAILED=1
  else
    echo "   ✅ PASS: /auth/login is NOT 404 (got $AUTH_STATUS)"
  fi

  echo ""

  # Test 3: Root endpoint (HTTPS)
  echo "🔍 [3/4] Testing https://rustdesk.bwb.pt/ ..."
  local HTTPS_ROOT_STATUS
  HTTPS_ROOT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://rustdesk.bwb.pt/" 2>/dev/null || echo "000")
  echo "   HTTP Status: $HTTPS_ROOT_STATUS"
  if [[ "$HTTPS_ROOT_STATUS" =~ ^(200|301|302|307|308)$ ]]; then
    echo "   ✅ PASS"
  else
    echo "   ⚠️  WARN: Expected 200/30x, got $HTTPS_ROOT_STATUS"
  fi

  echo ""

  # Test 4: /auth/login (HTTPS) - CRITICAL
  echo "🔍 [4/4] Testing https://rustdesk.bwb.pt/auth/login ..."
  local HTTPS_AUTH_STATUS
  HTTPS_AUTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://rustdesk.bwb.pt/auth/login" 2>/dev/null || echo "000")
  echo "   HTTP Status: $HTTPS_AUTH_STATUS"
  if [[ "$HTTPS_AUTH_STATUS" == "404" ]]; then
    echo "   ❌ FAIL: /auth/login returned 404 on HTTPS"
    VALIDATION_FAILED=1
  elif [[ "$HTTPS_AUTH_STATUS" == "000" ]]; then
    echo "   ⚠️  WARN: Could not connect to HTTPS endpoint"
  else
    echo "   ✅ PASS: /auth/login is NOT 404 (got $HTTPS_AUTH_STATUS)"
  fi

  echo ""

  # Diagnostics on failure
  if [[ $VALIDATION_FAILED -eq 1 ]]; then
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║   ❌ POST-DEPLOY VALIDATION FAILED                         ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""
    echo "📋 Diagnostics:"
    echo ""
    echo "   Boundary files on droplet:"
    ssh $SSH_COMMON_OPTS "$REMOTE_TARGET" "ls -la '$REMOTE_DIR'/proxy.ts '$REMOTE_DIR'/middleware.ts 2>/dev/null || echo '   NONE FOUND'" | sed 's/^/   /'
    echo ""
    echo "   Last 100 lines of frontend logs:"
    ssh $SSH_COMMON_OPTS "$REMOTE_TARGET" "sudo -n journalctl -u rustdesk-frontend --no-pager -n 100" 2>/dev/null | tail -50 | sed 's/^/   /'
    return 1
  else
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║   ✅ POST-DEPLOY VALIDATION PASSED                         ║"
    echo "║   /auth/login is working correctly                        ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    return 0
  fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# MAIN SCRIPT
# ═══════════════════════════════════════════════════════════════════════════════

echo "╔════════════════════════════════════════════════════════════╗"
echo "║    Step 4: Deploy to Droplet (Auth0-aware, SoT Compliant)  ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "📦 Versão: 20251229.2200"
echo "📁 Local:  $REPO_ROOT"
echo "📍 Remote: $REMOTE_DIR"
echo "🔑 Boundary file: $CANONICAL_BOUNDARY_FILE"
echo ""

# ---------------------------------------------------------
# 0. SoT Compliance Gate (MANDATORY - blocks deploy)
# ---------------------------------------------------------
sot_compliance_gate

# ---------------------------------------------------------
# 1. Verify local build exists
# ---------------------------------------------------------
echo "🔍 Checking local build artifacts..."

if [[ ! -d "$REPO_ROOT/.next" || ! -f "$REPO_ROOT/.next/BUILD_ID" ]]; then
  echo "❌ ERROR: .next/ or BUILD_ID not found"
  echo "   Run Step-2 first: ./scripts/Step-2-build-local.sh"
  exit 1
fi

BUILD_ID="$(cat "$REPO_ROOT/.next/BUILD_ID")"
GIT_SHA="$(git rev-parse HEAD 2>/dev/null || echo 'unknown')"
GIT_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')"

echo "✅ BUILD_ID: $BUILD_ID"
echo "✅ GIT_SHA:  $GIT_SHA"
echo ""

# ---------------------------------------------------------
# 2. CRITICAL: Verify boundary file exists locally
# ---------------------------------------------------------
echo "🔍 CRITICAL: Verifying $CANONICAL_BOUNDARY_FILE exists..."

if [[ ! -f "$REPO_ROOT/$CANONICAL_BOUNDARY_FILE" ]]; then
  echo "❌ CRITICAL ERROR: $CANONICAL_BOUNDARY_FILE not found locally!"
  echo ""
  echo "   This file is REQUIRED for Auth0 routes to work."
  echo "   Without it, /auth/login WILL return 404 after deploy."
  echo ""
  echo "   Files at repo root:"
  ls -la "$REPO_ROOT"/*.ts 2>/dev/null || echo "   (no .ts files)"
  exit 1
fi

LOCAL_BOUNDARY_SIZE=$(wc -c < "$REPO_ROOT/$CANONICAL_BOUNDARY_FILE")
LOCAL_BOUNDARY_MD5=$(md5sum "$REPO_ROOT/$CANONICAL_BOUNDARY_FILE" | cut -d' ' -f1)

echo "✅ $CANONICAL_BOUNDARY_FILE exists ($LOCAL_BOUNDARY_SIZE bytes, MD5: $LOCAL_BOUNDARY_MD5)"
echo ""

# ---------------------------------------------------------
# 3. Determine SSH target
# ---------------------------------------------------------
REMOTE_TARGET="${DEPLOY_USER}@${DEPLOY_HOST}"

if [[ -n "$DEPLOY_SSH_ALIAS" ]]; then
  echo "🔐 Testing SSH alias '$DEPLOY_SSH_ALIAS'..."
  if ssh $SSH_COMMON_OPTS "$DEPLOY_SSH_ALIAS" "echo ok" >/dev/null 2>&1; then
    echo "✅ Using alias: $DEPLOY_SSH_ALIAS"
    REMOTE_TARGET="$DEPLOY_SSH_ALIAS"
  else
    echo "ℹ️  Alias unavailable, using: $REMOTE_TARGET"
  fi
fi

echo ""

# ---------------------------------------------------------
# 4. Test SSH connectivity
# ---------------------------------------------------------
echo "🔐 Testing SSH connection..."
if ! ssh $SSH_COMMON_OPTS "$REMOTE_TARGET" "echo 'SSH OK'" >/dev/null; then
  echo "❌ ERROR: SSH failed"
  exit 1
fi
echo "✅ SSH OK"
echo ""

# ---------------------------------------------------------
# 5. Stop service
# ---------------------------------------------------------
echo "🛑 Stopping rustdesk-frontend.service..."
ssh $SSH_COMMON_OPTS "$REMOTE_TARGET" "sudo -n /usr/bin/systemctl stop rustdesk-frontend.service" 2>/dev/null || true

# ---------------------------------------------------------
# 6. Fix ownership
# ---------------------------------------------------------
echo "🔧 Fixing ownership..."
ssh $SSH_COMMON_OPTS "$REMOTE_TARGET" "sudo -n /usr/bin/chown -R rustdeskweb:rustdeskweb '$REMOTE_DIR'" 2>/dev/null || true

# ---------------------------------------------------------
# 7. Clear old .next
# ---------------------------------------------------------
echo "🧹 Clearing .next/ on droplet..."
ssh $SSH_COMMON_OPTS "$REMOTE_TARGET" "rm -rf '$REMOTE_DIR/.next'" 2>/dev/null || true
echo ""

# ---------------------------------------------------------
# 8. Rsync files (INCLUDING BOUNDARY FILE)
# ---------------------------------------------------------
echo "📦 Uploading files to droplet..."
echo ""

# Source code
echo "   📁 src/"
rsync $RSYNC_OPTS -e "ssh $SSH_COMMON_OPTS" "$REPO_ROOT/src/" "$REMOTE_TARGET:$REMOTE_DIR/src/"

# Public assets
echo "   📁 public/"
rsync $RSYNC_OPTS -e "ssh $SSH_COMMON_OPTS" "$REPO_ROOT/public/" "$REMOTE_TARGET:$REMOTE_DIR/public/"

# CRITICAL: Boundary file (proxy.ts)
echo "   🔑 $CANONICAL_BOUNDARY_FILE (CRITICAL for Auth0)"
rsync -avz -e "ssh $SSH_COMMON_OPTS" "$REPO_ROOT/$CANONICAL_BOUNDARY_FILE" "$REMOTE_TARGET:$REMOTE_DIR/$CANONICAL_BOUNDARY_FILE"

# Config files
echo "   📄 Config files..."
rsync -avz -e "ssh $SSH_COMMON_OPTS" \
  "$REPO_ROOT/package.json" \
  "$REPO_ROOT/next.config.mjs" \
  "$REPO_ROOT/tsconfig.json" \
  "$REMOTE_TARGET:$REMOTE_DIR/"

# Lockfile
if [[ -f "$REPO_ROOT/yarn.lock" ]]; then
  echo "   📄 yarn.lock"
  rsync -avz -e "ssh $SSH_COMMON_OPTS" "$REPO_ROOT/yarn.lock" "$REMOTE_TARGET:$REMOTE_DIR/"
elif [[ -f "$REPO_ROOT/package-lock.json" ]]; then
  echo "   📄 package-lock.json"
  rsync -avz -e "ssh $SSH_COMMON_OPTS" "$REPO_ROOT/package-lock.json" "$REMOTE_TARGET:$REMOTE_DIR/"
fi

echo ""
echo "✅ Files uploaded"
echo ""

# ---------------------------------------------------------
# 9. CRITICAL: Verify boundary file on droplet BEFORE build
# ---------------------------------------------------------
if ! verify_boundary_file_on_droplet "$REMOTE_TARGET"; then
  echo ""
  echo "❌ CRITICAL: Boundary file missing on droplet after rsync!"
  echo "   Deploy ABORTED - this would cause /auth/login 404"
  exit 1
fi
echo ""

# ---------------------------------------------------------
# 10. Build on droplet
# ---------------------------------------------------------
echo "🏗️  Building on droplet..."
ssh $SSH_COMMON_OPTS "$REMOTE_TARGET" "cd '$REMOTE_DIR' && npm ci && npm run build"
echo ""
echo "✅ Build completed on droplet"
echo ""

# ---------------------------------------------------------
# 11. Start service
# ---------------------------------------------------------
echo "🚀 Starting rustdesk-frontend.service..."
if ! ssh $SSH_COMMON_OPTS "$REMOTE_TARGET" "sudo -n /usr/bin/systemctl start rustdesk-frontend.service"; then
  echo "❌ ERROR: Failed to start service"
  ssh $SSH_COMMON_OPTS "$REMOTE_TARGET" "sudo -n journalctl -u rustdesk-frontend --no-pager -n 50" 2>/dev/null || true
  exit 1
fi

echo "⏳ Waiting for service to be ready (15s)..."
sleep 15
echo ""

# ---------------------------------------------------------
# 12. Post-deploy validation (CRITICAL)
# ---------------------------------------------------------
if ! post_deploy_validation "$REMOTE_TARGET"; then
  echo ""
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║   ❌ DEPLOY FAILED                                         ║"
  echo "║                                                            ║"
  echo "║   /auth/login is returning 404 in production.              ║"
  echo "║   Authentication is broken.                                ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  exit 1
fi

# ---------------------------------------------------------
# 13. Create deploy stamp
# ---------------------------------------------------------
echo ""
echo "📝 Creating DEPLOYED_VERSION.txt..."
DEPLOY_TIMESTAMP="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

DEPLOY_STAMP="GIT_SHA=${GIT_SHA}
GIT_BRANCH=${GIT_BRANCH}
BUILD_ID=${BUILD_ID}
BOUNDARY_FILE=${CANONICAL_BOUNDARY_FILE}
DEPLOYED_AT=${DEPLOY_TIMESTAMP}"

ssh $SSH_COMMON_OPTS "$REMOTE_TARGET" "echo '$DEPLOY_STAMP' > '$REMOTE_DIR/DEPLOYED_VERSION.txt'"

# ---------------------------------------------------------
# Summary
# ---------------------------------------------------------
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║              Deploy Completed Successfully!                ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "📋 Summary:"
echo "   ✅ SoT Compliance:  PASSED"
echo "   ✅ Boundary file:   $CANONICAL_BOUNDARY_FILE (deployed)"
echo "   ✅ Auth Routes:     WORKING (/auth/login ≠ 404)"
echo "   ✅ BUILD_ID:        $BUILD_ID"
echo "   ✅ GIT_SHA:         $GIT_SHA"
echo "   ✅ Deployed at:     $DEPLOY_TIMESTAMP"
echo ""
