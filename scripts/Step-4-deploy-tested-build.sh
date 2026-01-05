#!/usr/bin/env bash
#
# Step 4: Deploy to Droplet (MeshCentral Auth, No Auth0)
#
# Authentication: MeshCentral credential validation + encrypted cookies
# Database: Supabase (mesh_users table)
#
# Version: 20260104.0100
# Last Updated: 2026-01-04
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════
DEPLOY_HOST="${DEPLOY_HOST:-46.101.78.179}"
DEPLOY_USER="${DEPLOY_USER:-rustdeskweb}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/rustdesk-frontend}"
DEPLOY_SSH_ALIAS="${DEPLOY_SSH_ALIAS:-rustdesk-do}"
DEPLOY_DOMAIN="${DEPLOY_DOMAIN:-rustdesk.bwb.pt}"

# SSH options
SSH_IDENTITY_FILE="${SSH_IDENTITY_FILE:-}"
SSH_COMMON_OPTS="-o StrictHostKeyChecking=accept-new -o BatchMode=yes -o ConnectTimeout=10"
if [[ -n "$SSH_IDENTITY_FILE" && -f "$SSH_IDENTITY_FILE" ]]; then
  SSH_COMMON_OPTS="$SSH_COMMON_OPTS -i $SSH_IDENTITY_FILE"
fi

RSYNC_OPTS="-avz --delete"
REMOTE_DIR="${DEPLOY_PATH}"

# ═══════════════════════════════════════════════════════════════════════════════
# SUPABASE MIGRATION PHASE (Run on Mac BEFORE deploying)
# ═══════════════════════════════════════════════════════════════════════════════
run_supabase_migrations() {
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║         Supabase Migration Phase                           ║"
  echo "║         (Runs locally on Mac before deploy)                ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  echo ""

  # Check if supabase CLI is installed
  if ! command -v supabase &> /dev/null; then
    echo "❌ ERROR: supabase CLI not found"
    echo ""
    echo "   Install with: brew install supabase/tap/supabase"
    echo ""
    exit 1
  fi
  echo "✅ Supabase CLI found: $(supabase --version)"
  echo ""

  # Check if project is linked
  if [[ ! -f "$REPO_ROOT/supabase/.temp/project-ref" ]]; then
    echo "⚠️  WARNING: Supabase project may not be linked"
    echo "   Run: supabase link --project-ref <your-project-ref>"
    echo ""
    echo "   Skipping db push - manual migration may be required"
    echo ""
    return 0
  fi

  echo "🔄 Running supabase db push..."
  echo ""

  # Run db push to apply any pending migrations
  if ! (cd "$REPO_ROOT" && supabase db push); then
    echo ""
    echo "❌ ERROR: supabase db push failed"
    echo ""
    echo "   Check the error above and fix migration issues."
    echo "   Deploy ABORTED to prevent database drift."
    echo ""
    exit 1
  fi

  echo ""
  echo "✅ Supabase migrations applied successfully"
  echo ""
}

# ═══════════════════════════════════════════════════════════════════════════════
# COMPLIANCE GATE (MeshCentral Auth - No Auth0)
# ═══════════════════════════════════════════════════════════════════════════════
compliance_gate() {
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║         Compliance Gate - MeshCentral Auth                 ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  echo ""

  local GATE_FAILED=0

  # A) middleware.ts MUST exist at repo root
  echo "🔍 [A] Checking middleware.ts..."
  if [[ -f "$REPO_ROOT/middleware.ts" ]]; then
    echo "   ✅ PASS: middleware.ts exists"
  else
    echo "   ❌ FAIL: middleware.ts NOT found"
    GATE_FAILED=1
  fi

  # B) No Auth0 package in dependencies
  echo ""
  echo "🔍 [B] Checking for Auth0 dependencies..."
  if grep -q "@auth0/nextjs-auth0" "$REPO_ROOT/package.json" 2>/dev/null; then
    echo "   ❌ FAIL: @auth0/nextjs-auth0 still in package.json"
    echo "      Remove with: npm uninstall @auth0/nextjs-auth0"
    GATE_FAILED=1
  else
    echo "   ✅ PASS: No Auth0 package in dependencies"
  fi

  # C) No Auth0 imports in code
  echo ""
  echo "🔍 [C] Checking for Auth0 imports..."
  local AUTH0_IMPORTS
  AUTH0_IMPORTS=$(grep -rn "@auth0" "$REPO_ROOT/src" --include="*.ts" --include="*.tsx" 2>/dev/null || true)
  if [[ -n "$AUTH0_IMPORTS" ]]; then
    echo "   ❌ FAIL: Auth0 imports found in src/"
    echo "$AUTH0_IMPORTS" | head -5 | sed 's/^/      /'
    GATE_FAILED=1
  else
    echo "   ✅ PASS: No Auth0 imports in code"
  fi

  # D) SESSION_SECRET must be set (required for MeshCentral auth)
  echo ""
  echo "🔍 [D] Checking for SESSION_SECRET in .env files..."
  if grep -q "SESSION_SECRET" "$REPO_ROOT/.env.local" 2>/dev/null || \
     grep -q "SESSION_SECRET" "$REPO_ROOT/.env" 2>/dev/null; then
    echo "   ✅ PASS: SESSION_SECRET configured"
  else
    echo "   ⚠️  WARN: SESSION_SECRET not found in local .env files"
    echo "      Make sure it's set on the droplet"
  fi

  # E) src/app/auth directory should NOT exist (conflicts with /api/auth routes)
  echo ""
  echo "🔍 [E] Checking for conflicting auth directory..."
  if [[ -d "$REPO_ROOT/src/app/auth" ]]; then
    echo "   ❌ FAIL: src/app/auth/ directory exists (legacy)"
    echo "      Remove it to avoid route conflicts"
    GATE_FAILED=1
  else
    echo "   ✅ PASS: No conflicting src/app/auth/ directory"
  fi

  # F) Login page must exist
  echo ""
  echo "🔍 [F] Checking login page..."
  if [[ -f "$REPO_ROOT/src/app/login/page.tsx" ]]; then
    echo "   ✅ PASS: Login page exists at src/app/login/page.tsx"
  else
    echo "   ❌ FAIL: Login page NOT found"
    GATE_FAILED=1
  fi

  echo ""

  if [[ $GATE_FAILED -eq 1 ]]; then
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║   ❌ COMPLIANCE GATE FAILED                                ║"
    echo "║   Fix violations before deploying.                         ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    exit 1
  else
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║   ✅ COMPLIANCE GATE PASSED                                ║"
    echo "╚════════════════════════════════════════════════════════════╝"
  fi
  echo ""
}

# ═══════════════════════════════════════════════════════════════════════════════
# POST-DEPLOY VALIDATION
# ═══════════════════════════════════════════════════════════════════════════════
post_deploy_validation() {
  local REMOTE_TARGET="$1"
  
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║         Post-Deploy Validation                             ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  echo ""

  local VALIDATION_FAILED=0

  # Test 1: Root endpoint
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

  # Test 2: Login page
  echo "🔍 [2/4] Testing http://127.0.0.1:3000/login ..."
  local LOGIN_STATUS
  LOGIN_STATUS=$(ssh $SSH_COMMON_OPTS "$REMOTE_TARGET" "curl -s -o /dev/null -w '%{http_code}' 'http://127.0.0.1:3000/login'" 2>/dev/null || echo "000")
  echo "   HTTP Status: $LOGIN_STATUS"
  if [[ "$LOGIN_STATUS" == "200" ]]; then
    echo "   ✅ PASS: Login page accessible"
  else
    echo "   ❌ FAIL: Login page returned $LOGIN_STATUS"
    VALIDATION_FAILED=1
  fi

  echo ""

  # Test 3: Login API endpoint
  echo "🔍 [3/4] Testing POST /api/auth/login ..."
  local LOGIN_API_STATUS
  LOGIN_API_STATUS=$(ssh $SSH_COMMON_OPTS "$REMOTE_TARGET" "curl -s -o /dev/null -w '%{http_code}' -X POST 'http://127.0.0.1:3000/api/auth/login' -H 'Content-Type: application/json' -d '{}'" 2>/dev/null || echo "000")
  echo "   HTTP Status: $LOGIN_API_STATUS"
  # Should return 400 (bad request - missing credentials) not 404
  if [[ "$LOGIN_API_STATUS" =~ ^(400|401|500)$ ]]; then
    echo "   ✅ PASS: Login API route exists (returns $LOGIN_API_STATUS)"
  elif [[ "$LOGIN_API_STATUS" == "404" ]]; then
    echo "   ❌ FAIL: Login API route returns 404"
    VALIDATION_FAILED=1
  else
    echo "   ⚠️  WARN: Unexpected status $LOGIN_API_STATUS"
  fi

  echo ""

  # Test 4: Dashboard redirect (should redirect to login)
  echo "🔍 [4/4] Testing /dashboard (should redirect to /login)..."
  local DASH_STATUS
  DASH_STATUS=$(ssh $SSH_COMMON_OPTS "$REMOTE_TARGET" "curl -s -o /dev/null -w '%{http_code}' 'http://127.0.0.1:3000/dashboard'" 2>/dev/null || echo "000")
  echo "   HTTP Status: $DASH_STATUS"
  if [[ "$DASH_STATUS" =~ ^(307|302|303)$ ]]; then
    echo "   ✅ PASS: Dashboard redirects (protected route working)"
  else
    echo "   ⚠️  WARN: Expected redirect (307), got $DASH_STATUS"
  fi

  echo ""

  if [[ $VALIDATION_FAILED -eq 1 ]]; then
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║   ❌ POST-DEPLOY VALIDATION FAILED                         ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""
    echo "📋 Diagnostics:"
    echo "   Last 100 lines of frontend logs:"
    ssh $SSH_COMMON_OPTS "$REMOTE_TARGET" "sudo -n /usr/bin/journalctl -u rustdesk-frontend --no-pager -n 100" 2>/dev/null | tail -50 | sed 's/^/   /'
    return 1
  else
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║   ✅ POST-DEPLOY VALIDATION PASSED                         ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    return 0
  fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# MAIN SCRIPT
# ═══════════════════════════════════════════════════════════════════════════════

echo "╔════════════════════════════════════════════════════════════╗"
echo "║    Step 4: Deploy to Droplet (MeshCentral Auth)            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "📦 Version: 20260104.0100"
echo "📁 Local:  $REPO_ROOT"
echo "📍 Remote: $REMOTE_DIR"
echo "🌐 Domain: $DEPLOY_DOMAIN"
echo "🔐 Auth:   MeshCentral (encrypted cookie sessions)"
echo ""

# ---------------------------------------------------------
# 0. Compliance Gate (blocks deploy on failure)
# ---------------------------------------------------------
compliance_gate

# ---------------------------------------------------------
# 1. Supabase Migrations (run from Mac before deploy)
# ---------------------------------------------------------
run_supabase_migrations

# ---------------------------------------------------------
# 2. Verify local build exists
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
# 8. Rsync files
# ---------------------------------------------------------
echo "📦 Uploading files to droplet..."
echo ""

# Source code
echo "   📁 src/"
rsync $RSYNC_OPTS -e "ssh $SSH_COMMON_OPTS" "$REPO_ROOT/src/" "$REMOTE_TARGET:$REMOTE_DIR/src/"

# Public assets
echo "   📁 public/"
rsync $RSYNC_OPTS -e "ssh $SSH_COMMON_OPTS" "$REPO_ROOT/public/" "$REMOTE_TARGET:$REMOTE_DIR/public/"

# Middleware
echo "   🔑 middleware.ts"
rsync -avz -e "ssh $SSH_COMMON_OPTS" "$REPO_ROOT/middleware.ts" "$REMOTE_TARGET:$REMOTE_DIR/middleware.ts"

# Config files
echo "   📄 Config files..."
rsync -avz -e "ssh $SSH_COMMON_OPTS" \
  "$REPO_ROOT/package.json" \
  "$REPO_ROOT/next.config.mjs" \
  "$REPO_ROOT/tsconfig.json" \
  "$REPO_ROOT/postcss.config.js" \
  "$REPO_ROOT/tailwind.config.js" \
  "$REMOTE_TARGET:$REMOTE_DIR/"

# Lockfile
if [[ -f "$REPO_ROOT/package-lock.json" ]]; then
  echo "   📄 package-lock.json"
  rsync -avz -e "ssh $SSH_COMMON_OPTS" "$REPO_ROOT/package-lock.json" "$REMOTE_TARGET:$REMOTE_DIR/"
fi

echo ""
echo "✅ Files uploaded"
echo ""

# ---------------------------------------------------------
# 9. Build on droplet
# ---------------------------------------------------------
echo "🏗️  Building on droplet..."
ssh $SSH_COMMON_OPTS "$REMOTE_TARGET" "cd '$REMOTE_DIR' && npm ci && npm run build"
echo ""
echo "✅ Build completed on droplet"
echo ""

# ---------------------------------------------------------
# 10. Start service
# ---------------------------------------------------------
echo "🚀 Starting rustdesk-frontend.service..."
if ! ssh $SSH_COMMON_OPTS "$REMOTE_TARGET" "sudo -n /usr/bin/systemctl start rustdesk-frontend.service"; then
  echo "❌ ERROR: Failed to start service"
  ssh $SSH_COMMON_OPTS "$REMOTE_TARGET" "sudo -n /usr/bin/journalctl -u rustdesk-frontend --no-pager -n 50" 2>/dev/null || true
  exit 1
fi

echo "⏳ Waiting for service to be ready (15s)..."
sleep 15
echo ""

# ---------------------------------------------------------
# 11. Post-deploy validation
# ---------------------------------------------------------
if ! post_deploy_validation "$REMOTE_TARGET"; then
  echo ""
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║   ❌ DEPLOY FAILED                                         ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  exit 1
fi

# ---------------------------------------------------------
# 12. Create deploy stamp
# ---------------------------------------------------------
echo ""
echo "📝 Creating DEPLOYED_VERSION.txt..."
DEPLOY_TIMESTAMP="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

DEPLOY_STAMP="GIT_SHA=${GIT_SHA}
GIT_BRANCH=${GIT_BRANCH}
BUILD_ID=${BUILD_ID}
AUTH_METHOD=MeshCentral
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
echo "   ✅ Auth Method:     MeshCentral (no Auth0)"
echo "   ✅ Login Page:      /login"
echo "   ✅ Login API:       /api/auth/login"
echo "   ✅ BUILD_ID:        $BUILD_ID"
echo "   ✅ GIT_SHA:         $GIT_SHA"
echo "   ✅ Deployed at:     $DEPLOY_TIMESTAMP"
echo ""
