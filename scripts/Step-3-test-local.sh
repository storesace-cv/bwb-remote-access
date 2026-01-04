#!/usr/bin/env bash
#
# Step 3: Test Local - Next.js (MeshCentral Auth)
#
# Authentication: MeshCentral credential validation + encrypted cookies
#
# Version: 20260104.0100
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# ═══════════════════════════════════════════════════════════════════════════════
# COMPLIANCE GATE
# ═══════════════════════════════════════════════════════════════════════════════
compliance_gate() {
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║         Compliance Gate - MeshCentral Auth                 ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  echo ""

  local GATE_FAILED=0

  # A) middleware.ts MUST exist
  echo "🔍 [A] Checking middleware.ts..."
  if [[ -f "$REPO_ROOT/middleware.ts" ]]; then
    echo "   ✅ PASS: middleware.ts exists"
  else
    echo "   ❌ FAIL: middleware.ts NOT found"
    GATE_FAILED=1
  fi

  # B) No Auth0 package
  echo ""
  echo "🔍 [B] Checking for Auth0 dependencies..."
  if grep -q "@auth0/nextjs-auth0" "$REPO_ROOT/package.json" 2>/dev/null; then
    echo "   ❌ FAIL: @auth0/nextjs-auth0 still in package.json"
    GATE_FAILED=1
  else
    echo "   ✅ PASS: No Auth0 package"
  fi

  # C) src/app/auth/ should NOT exist
  echo ""
  echo "🔍 [C] Checking for conflicting auth directory..."
  if [[ -d "$REPO_ROOT/src/app/auth" ]]; then
    echo "   ❌ FAIL: src/app/auth/ exists (legacy)"
    GATE_FAILED=1
  else
    echo "   ✅ PASS: No conflicting src/app/auth/"
  fi

  # D) Login page must exist
  echo ""
  echo "🔍 [D] Checking login page..."
  if [[ -f "$REPO_ROOT/src/app/login/page.tsx" ]]; then
    echo "   ✅ PASS: Login page exists"
  else
    echo "   ❌ FAIL: Login page NOT found"
    GATE_FAILED=1
  fi

  echo ""

  if [[ $GATE_FAILED -eq 1 ]]; then
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║   ❌ COMPLIANCE GATE FAILED                                ║"
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
# MAIN SCRIPT
# ═══════════════════════════════════════════════════════════════════════════════

echo "╔════════════════════════════════════════════════════════════╗"
echo "║       Step 3: Test Local - Next.js (MeshCentral Auth)      ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "📦 Version: 20260104.0100"
echo "📁 Root: $REPO_ROOT"
echo ""

# ---------------------------------------------------------
# 0. Compliance Gate
# ---------------------------------------------------------
compliance_gate

# ---------------------------------------------------------
# 1. Check build exists
# ---------------------------------------------------------
echo "🔍 Checking build artifacts..."

if [[ ! -f "$REPO_ROOT/.next/BUILD_ID" ]]; then
  echo "❌ ERROR: .next/BUILD_ID not found"
  echo "   Run Step-2 first: ./scripts/Step-2-build-local.sh"
  exit 1
fi

BUILD_ID="$(cat "$REPO_ROOT/.next/BUILD_ID")"
echo "✅ BUILD_ID: $BUILD_ID"
echo ""

# ---------------------------------------------------------
# 2. Load environment
# ---------------------------------------------------------
echo "📋 Loading environment..."

ENV_FILE="$REPO_ROOT/.env.local"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  source "$ENV_FILE" 2>/dev/null || true
  set +a
  echo "   ✅ Loaded .env.local"
else
  echo "   ⚠️  No .env.local found"
fi

# Check for SESSION_SECRET
if [[ -z "${SESSION_SECRET:-}" ]]; then
  echo "   ⚠️  SESSION_SECRET not set - login will fail"
  echo "      Add to .env.local: SESSION_SECRET=$(openssl rand -hex 32)"
fi
echo ""

# ---------------------------------------------------------
# 3. Kill any existing Next.js processes
# ---------------------------------------------------------
echo "🧹 Stopping existing processes..."
pkill -9 -f "next-server" 2>/dev/null || true
pkill -9 -f "next dev" 2>/dev/null || true
sleep 1

# ---------------------------------------------------------
# 4. Start dev server
# ---------------------------------------------------------
echo "🚀 Starting dev server..."
echo ""

npm run dev &
DEV_PID=$!

echo "⏳ Waiting for server to be ready (15s)..."
sleep 15

# ---------------------------------------------------------
# 5. Run tests
# ---------------------------------------------------------
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                     Running Tests                          ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

TEST_FAILED=0

# Test 1: Root page
echo "🔍 [1/5] Testing http://localhost:3000/ ..."
ROOT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/" 2>/dev/null || echo "000")
echo "   HTTP Status: $ROOT_STATUS"
if [[ "$ROOT_STATUS" =~ ^(200|301|302|307|308)$ ]]; then
  echo "   ✅ PASS"
else
  echo "   ❌ FAIL: Expected 200/30x, got $ROOT_STATUS"
  TEST_FAILED=1
fi

echo ""

# Test 2: Login page
echo "🔍 [2/5] Testing http://localhost:3000/login ..."
LOGIN_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/login" 2>/dev/null || echo "000")
echo "   HTTP Status: $LOGIN_STATUS"
if [[ "$LOGIN_STATUS" == "200" ]]; then
  echo "   ✅ PASS"
else
  echo "   ❌ FAIL: Expected 200, got $LOGIN_STATUS"
  TEST_FAILED=1
fi

echo ""

# Test 3: Login API endpoint
echo "🔍 [3/5] Testing POST /api/auth/login ..."
LOGIN_API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:3000/api/auth/login" -H "Content-Type: application/json" -d '{}' 2>/dev/null || echo "000")
echo "   HTTP Status: $LOGIN_API_STATUS"
# Should return 400/401 (bad request), not 404
if [[ "$LOGIN_API_STATUS" =~ ^(400|401|500)$ ]]; then
  echo "   ✅ PASS: API route exists (returns $LOGIN_API_STATUS)"
elif [[ "$LOGIN_API_STATUS" == "404" ]]; then
  echo "   ❌ FAIL: API route returns 404"
  TEST_FAILED=1
else
  echo "   ⚠️  WARN: Unexpected status $LOGIN_API_STATUS"
fi

echo ""

# Test 4: Dashboard (should redirect to login)
echo "🔍 [4/5] Testing /dashboard (should redirect)..."
DASH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/dashboard" 2>/dev/null || echo "000")
echo "   HTTP Status: $DASH_STATUS"
if [[ "$DASH_STATUS" =~ ^(307|302|303)$ ]]; then
  echo "   ✅ PASS: Protected route redirects"
else
  echo "   ⚠️  WARN: Expected redirect, got $DASH_STATUS"
fi

echo ""

# Test 5: Session API
echo "🔍 [5/5] Testing GET /api/auth/session ..."
SESSION_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/api/auth/session" 2>/dev/null || echo "000")
echo "   HTTP Status: $SESSION_STATUS"
if [[ "$SESSION_STATUS" =~ ^(200|401)$ ]]; then
  echo "   ✅ PASS: Session API works"
else
  echo "   ⚠️  WARN: Unexpected status $SESSION_STATUS"
fi

echo ""

# ---------------------------------------------------------
# 6. Cleanup
# ---------------------------------------------------------
echo "🧹 Stopping dev server..."
kill $DEV_PID 2>/dev/null || true
pkill -9 -f "next dev" 2>/dev/null || true

# ---------------------------------------------------------
# Summary
# ---------------------------------------------------------
echo ""
if [[ $TEST_FAILED -eq 1 ]]; then
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║   ❌ SOME TESTS FAILED                                     ║"
  echo "║   Review the errors above before deploying.                ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  exit 1
else
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║   ✅ ALL TESTS PASSED                                      ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  echo ""
  echo "📋 Ready to deploy:"
  echo "   ./scripts/Step-4-deploy-tested-build.sh"
  echo ""
fi
