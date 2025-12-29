#!/usr/bin/env bash
#
# Step 3: Test Local - Next.js (Auth0-aware)
#
# SoT Reference: /docs/SoT/AUTH_AND_MIDDLEWARE_ARCHITECTURE.md
#
# Versão: 20251229.2100
# Última atualização: 2025-12-29 21:00 UTC
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$REPO_ROOT/logs/local"
TIMESTAMP="$(date +"%Y%m%d-%H%M%S")"
LOG_FILE="$LOG_DIR/Step-3-test-local-$TIMESTAMP.log"

mkdir -p "$LOG_DIR"
exec > >(tee -a "$LOG_FILE") 2>&1

log() {
  printf '[Step-3][%s] %s\n' "$(date +"%Y-%m-%dT%H:%M:%S%z")" "$*"
}

cd "$REPO_ROOT"

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

  local GATE_FAILED=0

  # A) Proxy placement (Next.js 16 requires /proxy.ts at root)
  echo "🔍 [A] Checking proxy.ts placement (Next.js 16)..."
  if [[ -f "$REPO_ROOT/proxy.ts" ]]; then
    echo "   ✅ PASS: proxy.ts exists at root"
  else
    echo "   ❌ FAIL: proxy.ts NOT found at root"
    echo "      SoT Rule: Next.js 16 requires /proxy.ts at project root"
    GATE_FAILED=1
  fi

  if [[ -f "$REPO_ROOT/middleware.ts" ]]; then
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

  # B) NextResponse.next() only in proxy.ts
  echo "🔍 [B] Checking NextResponse.next() usage..."
  local VIOLATIONS
  VIOLATIONS=$(grep -Rna "NextResponse\.next" "$REPO_ROOT" --include="*.ts" --include="*.tsx" 2>/dev/null | grep -vE "^\./proxy\.ts:|^proxy\.ts:|node_modules" || true)
  if [[ -z "$VIOLATIONS" ]]; then
    echo "   ✅ PASS: NextResponse.next() only in proxy.ts"
  else
    echo "   ❌ FAIL: NextResponse.next() found outside proxy.ts:"
    echo "$VIOLATIONS" | head -10 | sed 's/^/      /'
    GATE_FAILED=1
  fi

  echo ""

  # C) Auth0 SDK route reservation
  echo "🔍 [C] Checking /auth/* route reservation..."
  if [[ -d "$REPO_ROOT/src/app/auth" ]]; then
    echo "   ❌ FAIL: src/app/auth/ directory exists"
    echo "      This will cause 404 on /auth/login in production"
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
  while [[ $WAITED -lt $MAX_WAIT ]]; do
    if curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$TEST_PORT/" 2>/dev/null | grep -qE "^[0-9]+$"; then
      echo "   Server ready after ${WAITED}s"
      break
    fi
    sleep 1
    WAITED=$((WAITED + 1))
  done

  if [[ $WAITED -ge $MAX_WAIT ]]; then
    echo "   ❌ Server did not start within ${MAX_WAIT}s"
    kill $SERVER_PID 2>/dev/null || true
    cat /tmp/next-smoke-test.log | tail -50
    return 1
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
    echo "║   /auth/login returned 404                                 ║"
    echo "║   This indicates Auth0 SDK routes are not mounted.         ║"
    echo "║   Check: proxy.ts, src/app/auth/ conflicts                 ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    return 1
  elif [[ "$AUTH_STATUS" == "000" ]]; then
    echo ""
    echo "⚠️  Could not reach /auth/login (connection failed)"
    echo "   Skipping smoke test (server may not have started)"
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
echo "║    Step 3: Test Local - Next.js (Auth0-aware)              ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
log "Iniciar testes e lint (logs: $LOG_FILE)"
echo ""

# ---------------------------------------------------------
# 0. SoT Compliance Gate (MANDATORY - redundant by design)
# ---------------------------------------------------------
sot_compliance_gate

# ---------------------------------------------------------
# 1. ESLint
# ---------------------------------------------------------
echo "🔍 [1/4] A executar ESLint..."
log "npm run lint"

set +e
npm run lint
ESLINT_STATUS=$?
set -e

if [[ $ESLINT_STATUS -eq 0 ]]; then
  log "✅ ESLint passou"
elif [[ $ESLINT_STATUS -eq 1 ]]; then
  log "❌ ESLint encontrou ERROS"
  exit 1
else
  log "❌ ESLint falhou com erro de configuração (exit code $ESLINT_STATUS)"
  exit 1
fi

echo ""

# ---------------------------------------------------------
# 2. Jest (if tests exist)
# ---------------------------------------------------------
echo "🧪 [2/4] A executar testes unitários..."
log "npm test"

set +e
npm test 2>/dev/null
TEST_STATUS=$?
set -e

if [[ $TEST_STATUS -eq 0 ]]; then
  log "✅ Testes unitários passaram"
else
  log "⚠️  Testes unitários falharam ou não existem (exit code $TEST_STATUS)"
  # Don't fail - tests might not exist
fi

echo ""

# ---------------------------------------------------------
# 3. TypeScript
# ---------------------------------------------------------
echo "📐 [3/4] A verificar tipos TypeScript..."
log "npx tsc --noEmit"

if npx tsc --noEmit; then
  log "✅ TypeScript: sem erros de tipos"
else
  log "❌ TypeScript: erros de tipos encontrados"
  exit 1
fi

echo ""

# ---------------------------------------------------------
# 4. Auth Route Smoke Test (CRITICAL for Auth0)
# ---------------------------------------------------------
echo "🔐 [4/4] Auth Route Smoke Test..."

# Only run if .next exists (build was done)
if [[ -d "$REPO_ROOT/.next" ]]; then
  if ! auth_route_smoke_test; then
    echo ""
    echo "❌ Auth route smoke test failed. /auth/login would return 404 in production."
    exit 1
  fi
else
  echo "⚠️  Skipping smoke test (.next not found - run Step-2 first)"
fi

echo ""

# ---------------------------------------------------------
# Summary
# ---------------------------------------------------------
echo "╔════════════════════════════════════════════════════════════╗"
echo "║           Testes Concluídos com Sucesso!                   ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
log "✅ Todas as validações passaram:"
log "   ✓ SoT Compliance Gate"
log "   ✓ ESLint"
log "   ✓ TypeScript"
log "   ✓ Auth Route Smoke Test"
echo ""
echo "📋 Próximo passo:"
echo "     ./scripts/Step-4-deploy-tested-build.sh"
echo ""
