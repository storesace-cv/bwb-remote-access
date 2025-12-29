#!/usr/bin/env bash
#
# Step 4: Deploy to Droplet (Auth0-aware, SoT Compliant)
#
# SoT Reference: /docs/SoT/AUTH_AND_MIDDLEWARE_ARCHITECTURE.md
#
# Strategy: rsync source + build on droplet (deterministic)
#
# Versão: 20251229.2100
# Última atualização: 2025-12-29 21:00 UTC
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

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

  local GATE_FAILED=0

  # A) Proxy placement (Next.js 16 requires /proxy.ts at root)
  echo "🔍 [A] Checking proxy.ts placement (Next.js 16)..."
  if [[ -f "$REPO_ROOT/proxy.ts" ]]; then
    echo "   ✅ PASS: proxy.ts exists at root"
  else
    echo "   ❌ FAIL: proxy.ts NOT found at root"
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
    echo "   ❌ FAIL: NextResponse.next() found outside proxy.ts"
    GATE_FAILED=1
  fi

  echo ""

  # C) Auth0 SDK route reservation
  echo "🔍 [C] Checking /auth/* route reservation..."
  if [[ -d "$REPO_ROOT/src/app/auth" ]]; then
    echo "   ❌ FAIL: src/app/auth/ directory exists"
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
    echo "║   Fix violations before deploying                          ║"
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
# POST-DEPLOY VALIDATION
# Verifies /auth/login is NOT 404 after deploy
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
    echo "      This indicates Auth0 SDK routes are NOT mounted."
    echo "      Check: proxy.ts, src/app/auth/ conflicts"
    VALIDATION_FAILED=1
  elif [[ "$AUTH_STATUS" == "000" ]]; then
    echo "   ⚠️  WARN: Could not connect to localhost:3000"
    echo "      Service may not be running"
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
    # Don't fail - might be DNS/nginx issue unrelated to code
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

  # Result
  if [[ $VALIDATION_FAILED -eq 1 ]]; then
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║   ❌ POST-DEPLOY VALIDATION FAILED                         ║"
    echo "║   /auth/login is returning 404 in production              ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""
    echo "📋 Fetching last 100 lines of frontend logs..."
    ssh $SSH_COMMON_OPTS "$REMOTE_TARGET" "sudo -n journalctl -u rustdesk-frontend --no-pager -n 100" 2>/dev/null || true
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
echo "📦 Versão: 20251229.2100"
echo "📍 Repositório local: $REPO_ROOT"
echo "📍 Pasta remota:      $REMOTE_DIR"
echo ""

# ---------------------------------------------------------
# 0. SoT Compliance Gate (MANDATORY)
# ---------------------------------------------------------
sot_compliance_gate

# ---------------------------------------------------------
# 1. Local prerequisites
# ---------------------------------------------------------
echo "🔍 A validar pré-requisitos locais..."

if [[ ! -d "$REPO_ROOT/.next" || ! -f "$REPO_ROOT/.next/BUILD_ID" ]]; then
  echo "❌ ERRO: .next/ ou .next/BUILD_ID não encontrados."
  echo "   Corre primeiro: ./scripts/Step-2-build-local.sh"
  exit 1
fi

BUILD_ID="$(cat "$REPO_ROOT/.next/BUILD_ID")"
echo "✅ BUILD_ID local: $BUILD_ID"

# ---------------------------------------------------------
# 2. Determine SSH target
# ---------------------------------------------------------
REMOTE_TARGET="${DEPLOY_USER}@${DEPLOY_HOST}"

if [[ -n "$DEPLOY_SSH_ALIAS" ]]; then
  echo "🔐 A testar alias SSH '${DEPLOY_SSH_ALIAS}'..."
  if ssh $SSH_COMMON_OPTS "$DEPLOY_SSH_ALIAS" "echo ok >/dev/null" 2>/dev/null; then
    echo "✅ Alias '${DEPLOY_SSH_ALIAS}' disponível"
    REMOTE_TARGET="$DEPLOY_SSH_ALIAS"
  else
    echo "ℹ️ Alias indisponível; a usar '${REMOTE_TARGET}'"
  fi
fi

echo "📍 Destino: $REMOTE_TARGET:$REMOTE_DIR"
echo ""

# ---------------------------------------------------------
# 3. Test SSH connectivity
# ---------------------------------------------------------
echo "🔐 A testar SSH..."
if ! ssh $SSH_COMMON_OPTS "$REMOTE_TARGET" "echo 'SSH OK' >/dev/null"; then
  echo "❌ ERRO: SSH falhou"
  exit 1
fi
echo "✅ SSH OK"
echo ""

# ---------------------------------------------------------
# 4. Stop service before deploy
# ---------------------------------------------------------
echo "🛑 A parar rustdesk-frontend.service..."
if ! ssh $SSH_COMMON_OPTS "$REMOTE_TARGET" "sudo -n /usr/bin/systemctl stop rustdesk-frontend.service" 2>/dev/null; then
  echo "⚠️  AVISO: Não foi possível parar o serviço (pode já estar parado)"
fi

# ---------------------------------------------------------
# 5. Fix ownership
# ---------------------------------------------------------
echo "🔧 A corrigir ownership..."
ssh $SSH_COMMON_OPTS "$REMOTE_TARGET" "sudo -n /usr/bin/chown -R rustdeskweb:rustdeskweb $REMOTE_DIR" 2>/dev/null || true

# ---------------------------------------------------------
# 6. Clear old .next on droplet
# ---------------------------------------------------------
echo "🧹 A limpar .next/ no droplet..."
ssh $SSH_COMMON_OPTS "$REMOTE_TARGET" "rm -rf $REMOTE_DIR/.next" 2>/dev/null || true

# ---------------------------------------------------------
# 7. Rsync source files
# ---------------------------------------------------------
echo "📦 A enviar ficheiros..."

# Source files
echo "   - src/"
rsync $RSYNC_OPTS -e "ssh $SSH_COMMON_OPTS" "$REPO_ROOT/src/" "$REMOTE_TARGET:$REMOTE_DIR/src/"

echo "   - public/"
rsync $RSYNC_OPTS -e "ssh $SSH_COMMON_OPTS" "$REPO_ROOT/public/" "$REMOTE_TARGET:$REMOTE_DIR/public/"

echo "   - proxy.ts (CRITICAL for Auth0)"
rsync -avz -e "ssh $SSH_COMMON_OPTS" "$REPO_ROOT/proxy.ts" "$REMOTE_TARGET:$REMOTE_DIR/proxy.ts"

echo "   - Config files..."
rsync -avz -e "ssh $SSH_COMMON_OPTS" \
  "$REPO_ROOT/package.json" \
  "$REPO_ROOT/next.config.mjs" \
  "$REPO_ROOT/tsconfig.json" \
  "$REMOTE_TARGET:$REMOTE_DIR/"

# Lockfile
if [[ -f "$REPO_ROOT/yarn.lock" ]]; then
  rsync -avz -e "ssh $SSH_COMMON_OPTS" "$REPO_ROOT/yarn.lock" "$REMOTE_TARGET:$REMOTE_DIR/"
elif [[ -f "$REPO_ROOT/package-lock.json" ]]; then
  rsync -avz -e "ssh $SSH_COMMON_OPTS" "$REPO_ROOT/package-lock.json" "$REMOTE_TARGET:$REMOTE_DIR/"
fi

echo "✅ Ficheiros enviados"
echo ""

# ---------------------------------------------------------
# 8. Build on droplet
# ---------------------------------------------------------
echo "🏗️  A fazer build no droplet..."
ssh $SSH_COMMON_OPTS "$REMOTE_TARGET" "cd $REMOTE_DIR && npm ci && npm run build"
echo "✅ Build concluído no droplet"
echo ""

# ---------------------------------------------------------
# 9. Start service
# ---------------------------------------------------------
echo "🚀 A iniciar rustdesk-frontend.service..."
if ! ssh $SSH_COMMON_OPTS "$REMOTE_TARGET" "sudo -n /usr/bin/systemctl start rustdesk-frontend.service"; then
  echo "❌ ERRO: Falha ao iniciar serviço"
  ssh $SSH_COMMON_OPTS "$REMOTE_TARGET" "sudo -n journalctl -u rustdesk-frontend --no-pager -n 50" 2>/dev/null || true
  exit 1
fi

# Wait for service to be ready
echo "⏳ A aguardar serviço (10s)..."
sleep 10

# ---------------------------------------------------------
# 10. Post-deploy validation (CRITICAL)
# ---------------------------------------------------------
if ! post_deploy_validation "$REMOTE_TARGET"; then
  echo ""
  echo "❌ Deploy FAILED: /auth/login is 404 in production"
  echo "   This is a critical failure - authentication is broken."
  exit 1
fi

# ---------------------------------------------------------
# 11. Deploy stamp
# ---------------------------------------------------------
echo ""
echo "📝 A criar DEPLOYED_VERSION.txt..."
GIT_SHA="$(git rev-parse HEAD 2>/dev/null || echo 'unknown')"
GIT_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')"
DEPLOY_TIMESTAMP="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

DEPLOY_STAMP="GIT_SHA=${GIT_SHA}
GIT_BRANCH=${GIT_BRANCH}
BUILD_ID=${BUILD_ID}
DEPLOYED_AT=${DEPLOY_TIMESTAMP}"

ssh $SSH_COMMON_OPTS "$REMOTE_TARGET" "echo '$DEPLOY_STAMP' > $REMOTE_DIR/DEPLOYED_VERSION.txt"

# ---------------------------------------------------------
# Summary
# ---------------------------------------------------------
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║              Deploy Concluído com Sucesso!                 ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "✅ SoT Compliance: PASSED"
echo "✅ Auth Routes: WORKING (/auth/login is NOT 404)"
echo "✅ BUILD_ID: $BUILD_ID"
echo "✅ GIT_SHA: $GIT_SHA"
echo ""
