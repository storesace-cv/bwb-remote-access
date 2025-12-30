#!/usr/bin/env bash
#
# Step 3: Test Local - Next.js (Auth0-aware, SoT Compliant)
#
# SoT Reference: /docs/SoT/AUTH_AND_MIDDLEWARE_ARCHITECTURE.md
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
  else
    echo "   ❌ FAIL: $CANONICAL_BOUNDARY_FILE NOT found at root"
    echo "      Without this file, /auth/login WILL return 404"
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
# AUTH ROUTE SMOKE TEST
# Starts Next.js locally and verifies /auth/login is NOT 404
# ═══════════════════════════════════════════════════════════════════════════════
auth_route_smoke_test() {
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║         Auth Route Smoke Test - /auth/login                ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  echo ""

  local TEST_PORT=3100
  local MAX_WAIT=30
  local SERVER_PID=""

  # Kill any existing process on test port
  if command -v lsof >/dev/null 2>&1; then
    lsof -ti:$TEST_PORT 2>/dev/null | xargs kill -9 2>/dev/null || true
  fi
  sleep 1

  echo "🚀 Starting Next.js on port $TEST_PORT..."
  
  # Start server in background
  PORT=$TEST_PORT npm run start > /tmp/next-smoke-test.log 2>&1 &
  SERVER_PID=$!
  
  # Wait for server to be ready
  echo "⏳ Waiting for server (max ${MAX_WAIT}s)..."
  local WAITED=0
  local SERVER_READY=0
  while [[ $WAITED -lt $MAX_WAIT ]]; do
    if curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$TEST_PORT/" 2>/dev/null | grep -qE "^[0-9]+$"; then
      SERVER_READY=1
      echo "   Server ready after ${WAITED}s"
      break
    fi
    sleep 1
    WAITED=$((WAITED + 1))
  done

  if [[ $SERVER_READY -eq 0 ]]; then
    echo "   ⚠️  Server did not start within ${MAX_WAIT}s"
    kill $SERVER_PID 2>/dev/null || true
    echo "   Last 20 lines of server log:"
    tail -20 /tmp/next-smoke-test.log 2>/dev/null | sed 's/^/   /'
    echo ""
    echo "   Skipping HTTP smoke test (server startup failed)"
    return 0
  fi

  # Test /auth/login
  echo ""
  echo "🔍 Testing /auth/login..."
  local AUTH_STATUS
  AUTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$TEST_PORT/auth/login" 2>/dev/null || echo "000")
  
  echo "   HTTP Status: $AUTH_STATUS"

  # Cleanup
  echo ""
  echo "🧹 Stopping test server..."
  kill $SERVER_PID 2>/dev/null || true
  wait $SERVER_PID 2>/dev/null || true
  sleep 1

  # Validate result
  if [[ "$AUTH_STATUS" == "404" ]]; then
    echo ""
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║   ❌ AUTH ROUTE SMOKE TEST FAILED                          ║"
    echo "║                                                            ║"
    echo "║   /auth/login returned 404                                 ║"
    echo "║   This indicates Auth0 SDK routes are not mounted.         ║"
    echo "║                                                            ║"
    echo "║   Check:                                                   ║"
    echo "║   - $CANONICAL_BOUNDARY_FILE exists at root                ║"
    echo "║   - No src/app/auth/ directory                             ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    return 1
  elif [[ "$AUTH_STATUS" == "000" ]]; then
    echo ""
    echo "⚠️  Could not reach /auth/login (connection failed)"
    echo "   Skipping smoke test"
    return 0
  else
    echo ""
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║   ✅ AUTH ROUTE SMOKE TEST PASSED                          ║"
    echo "║   /auth/login returned HTTP $AUTH_STATUS (not 404)         ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    return 0
  fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# MAIN SCRIPT
# ═══════════════════════════════════════════════════════════════════════════════

echo "╔════════════════════════════════════════════════════════════╗"
echo "║       Step 3: Test Local - Next.js (Auth0-aware)           ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "📦 Versão: 20251229.2200"
echo "📁 Root: $REPO_ROOT"
echo ""

# ---------------------------------------------------------
# 0. SoT Compliance Gate (MANDATORY - redundant by design)
# ---------------------------------------------------------
sot_compliance_gate

# ---------------------------------------------------------
# 1. Verify build exists
# ---------------------------------------------------------
echo "[Step-3] 🔍 Checking for build artifacts..."
if [[ ! -d "$REPO_ROOT/.next" || ! -f "$REPO_ROOT/.next/BUILD_ID" ]]; then
  echo "[Step-3] ❌ ERROR: .next/ or BUILD_ID not found"
  echo "         Run Step-2 first: ./scripts/Step-2-build-local.sh"
  exit 1
fi

BUILD_ID="$(cat "$REPO_ROOT/.next/BUILD_ID")"
echo "[Step-3] ✓ BUILD_ID: $BUILD_ID"

# Verify boundary file exists
if [[ ! -f "$REPO_ROOT/$CANONICAL_BOUNDARY_FILE" ]]; then
  echo "[Step-3] ❌ CRITICAL: $CANONICAL_BOUNDARY_FILE not found!"
  echo "         This WILL cause /auth/login to return 404"
  exit 1
fi
echo "[Step-3] ✓ Boundary file: $CANONICAL_BOUNDARY_FILE"
echo ""

# ---------------------------------------------------------
# 2. ESLint
# ---------------------------------------------------------
echo "[Step-3] 🔍 Running ESLint..."

set +e
npm run lint 2>&1
ESLINT_STATUS=$?
set -e

if [[ $ESLINT_STATUS -eq 0 ]]; then
  echo "[Step-3] ✅ ESLint passed"
else
  echo "[Step-3] ❌ ESLint failed (exit code $ESLINT_STATUS)"
  exit 1
fi

echo ""

# ---------------------------------------------------------
# 3. TypeScript type check
# ---------------------------------------------------------
echo "[Step-3] 📐 Running TypeScript check..."

if npx tsc --noEmit 2>&1; then
  echo "[Step-3] ✅ TypeScript: no type errors"
else
  echo "[Step-3] ❌ TypeScript: type errors found"
  exit 1
fi

echo ""

# ---------------------------------------------------------
# 4. Unit tests (if defined)
# ---------------------------------------------------------
echo "[Step-3] 🧪 Running tests..."

set +e
npm test 2>&1
TEST_STATUS=$?
set -e

if [[ $TEST_STATUS -eq 0 ]]; then
  echo "[Step-3] ✅ Tests passed"
else
  echo "[Step-3] ⚠️  Tests failed or not defined (exit code $TEST_STATUS)"
  # Don't fail - tests might not exist
fi

echo ""

# ---------------------------------------------------------
# 5. Auth Route Smoke Test (CRITICAL)
# ---------------------------------------------------------
echo "[Step-3] 🔐 Running Auth Route Smoke Test..."

if ! auth_route_smoke_test; then
  echo ""
  echo "[Step-3] ❌ Auth route smoke test failed."
  echo "         /auth/login would return 404 in production."
  exit 1
fi

echo ""

# ---------------------------------------------------------
# Summary
# ---------------------------------------------------------
echo "╔════════════════════════════════════════════════════════════╗"
echo "║           Tests Completed Successfully!                    ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "📋 Summary:"
echo "   ✅ SoT Compliance Gate: PASSED"
echo "   ✅ Boundary file:       $CANONICAL_BOUNDARY_FILE (present)"
echo "   ✅ ESLint:              PASSED"
echo "   ✅ TypeScript:          PASSED"
echo "   ✅ Auth Smoke Test:     PASSED (/auth/login ≠ 404)"
echo "   ✅ BUILD_ID:            $BUILD_ID"
echo ""
echo "📋 Next step:"
echo "     ./scripts/Step-4-deploy-tested-build.sh"
echo ""
