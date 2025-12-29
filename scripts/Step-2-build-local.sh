#!/usr/bin/env bash
#
# Step 2: Build Local - Next.js (Auth0-aware)
#
# SoT Reference: /docs/SoT/AUTH_AND_MIDDLEWARE_ARCHITECTURE.md
#
# Versão: 20251229.2100
# Última atualização: 2025-12-29 21:00 UTC
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
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

  # Check for deprecated middleware.ts
  if [[ -f "$REPO_ROOT/middleware.ts" ]]; then
    echo "   ❌ FAIL: middleware.ts exists (deprecated in Next.js 16)"
    echo "      SoT Rule: Use proxy.ts instead of middleware.ts"
    GATE_FAILED=1
  else
    echo "   ✅ PASS: No deprecated middleware.ts"
  fi

  # Check for misplaced src/proxy.ts
  if [[ -f "$REPO_ROOT/src/proxy.ts" ]]; then
    echo "   ❌ FAIL: src/proxy.ts exists (wrong location)"
    echo "      SoT Rule: proxy.ts must be at root, not in src/"
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
    echo "      SoT Rule: NextResponse.next() ONLY allowed in /proxy.ts"
    GATE_FAILED=1
  fi

  echo ""

  # C) Auth0 SDK route reservation (/auth/* must not have app routes)
  echo "🔍 [C] Checking /auth/* route reservation..."
  if [[ -d "$REPO_ROOT/src/app/auth" ]]; then
    echo "   ❌ FAIL: src/app/auth/ directory exists"
    echo "      SoT Rule: /auth/* is RESERVED for Auth0 SDK"
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
    echo "   ❌ FAIL: auth0.middleware() found in route handlers:"
    echo "$AUTH0_MW_VIOLATIONS" | head -5 | sed 's/^/      /'
    echo "      SoT Rule: auth0.middleware() ONLY allowed in /proxy.ts"
    GATE_FAILED=1
  fi

  echo ""

  # Gate result
  if [[ $GATE_FAILED -eq 1 ]]; then
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║   ❌ SoT COMPLIANCE GATE FAILED                            ║"
    echo "║   Fix violations before proceeding with build/deploy       ║"
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
# MAIN SCRIPT
# ═══════════════════════════════════════════════════════════════════════════════

echo "╔════════════════════════════════════════════════════════════╗"
echo "║       Step 2: Build Local - Next.js (Auth0-aware)          ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "📦 Versão: 20251229.2100"
echo "🕐 Atualizado: 2025-12-29 21:00 UTC"
echo ""
echo "[Step-2] Root do repositório: $REPO_ROOT"
echo ""

# ---------------------------------------------------------
# 0. SoT Compliance Gate (MANDATORY)
# ---------------------------------------------------------
sot_compliance_gate

# ---------------------------------------------------------
# 1. Carregar .env.local (OBRIGATÓRIO) para o ambiente
# ---------------------------------------------------------
ENV_FILE="$REPO_ROOT/.env.local"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "[Step-2] ERRO: .env.local não encontrado na raiz do repositório."
  echo "         Este ficheiro é OBRIGATÓRIO."
  exit 1
fi

echo "[Step-2] A carregar variáveis de $ENV_FILE"

if ! bash -n "$ENV_FILE" >/dev/null 2>&1; then
  echo "[Step-2] ERRO: .env.local tem sintaxe inválida como ficheiro shell."
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

# ---------------------------------------------------------
# 2. Limpeza SEGURA
# ---------------------------------------------------------
echo "[Step-2] 🧹 A limpar artefactos de execuções anteriores..."

pkill -9 -f "next-server" 2>/dev/null || true
pkill -9 -f "next dev" 2>/dev/null || true
pkill -9 -f "node.*next" 2>/dev/null || true
sleep 0.5

if [[ -d "$REPO_ROOT/.next" ]]; then
  echo "[Step-2]   - A remover .next/"
  rm -rf "$REPO_ROOT/.next" 2>/dev/null || true
fi

[[ -d "$REPO_ROOT/node_modules/.cache" ]] && rm -rf "$REPO_ROOT/node_modules/.cache" 2>/dev/null || true
[[ -f "$REPO_ROOT/tsconfig.tsbuildinfo" ]] && rm -f "$REPO_ROOT/tsconfig.tsbuildinfo" 2>/dev/null || true

echo "[Step-2] ✓ Limpeza concluída"

# ---------------------------------------------------------
# 3. Instalar dependências
# ---------------------------------------------------------
echo "[Step-2] 📦 A instalar dependências..."

if [[ -f "$REPO_ROOT/yarn.lock" ]]; then
  echo "[Step-2]   - A usar yarn install"
  yarn install --frozen-lockfile || yarn install
elif [[ -f "$REPO_ROOT/package-lock.json" ]]; then
  echo "[Step-2]   - A usar npm ci"
  npm ci 2>/dev/null || npm install
else
  echo "[Step-2]   - A usar npm install"
  npm install
fi

echo "[Step-2] ✓ Dependências instaladas"

# ---------------------------------------------------------
# 4. Lint (fail on errors)
# ---------------------------------------------------------
echo "[Step-2] 🔍 A executar lint..."

set +e
npm run lint
LINT_STATUS=$?
set -e

if [[ $LINT_STATUS -ne 0 ]]; then
  echo "[Step-2] ❌ Lint falhou. Corrige os erros antes de continuar."
  exit 1
fi
echo "[Step-2] ✓ Lint passed"

# ---------------------------------------------------------
# 5. Build de produção
# ---------------------------------------------------------
echo "[Step-2] 🏗️  A executar build de produção..."
npm run build

# ---------------------------------------------------------
# 6. Validação pós-build
# ---------------------------------------------------------
echo ""
echo "[Step-2] 🔍 A validar build..."

if [[ ! -f "$REPO_ROOT/.next/BUILD_ID" ]]; then
  echo "[Step-2] ❌ ERRO: BUILD_ID não foi gerado."
  exit 1
fi

BUILD_ID="$(cat "$REPO_ROOT/.next/BUILD_ID")"
echo "[Step-2] ✓ BUILD_ID gerado: $BUILD_ID"

# Verify proxy was compiled (Next.js 16 shows it in build output)
echo "[Step-2] 🔍 A verificar compilação do proxy..."
if [[ -d "$REPO_ROOT/.next/server" ]]; then
  echo "[Step-2] ✓ Server build presente"
else
  echo "[Step-2] ❌ Server build não encontrado"
  exit 1
fi

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║              Build Concluído com Sucesso!                  ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "✅ BUILD_ID: $BUILD_ID"
echo "✅ SoT Compliance: PASSED"
echo ""
echo "📋 Próximos passos:"
echo "   1️⃣  Testar localmente:  ./scripts/Step-3-test-local.sh"
echo "   2️⃣  Deploy ao droplet:  ./scripts/Step-4-deploy-tested-build.sh"
echo ""
