#!/usr/bin/env bash
#
# Step 2: Build Local - Next.js (Auth0-aware, SoT Compliant)
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
    echo "   📄 File size: $(wc -c < "$REPO_ROOT/$CANONICAL_BOUNDARY_FILE") bytes"
  else
    echo "   ❌ FAIL: $CANONICAL_BOUNDARY_FILE NOT found at root"
    echo "      This file is REQUIRED for Auth0 routes to work."
    echo "      Without it, /auth/login will return 404 in production."
    GATE_FAILED=1
  fi

  # Check for deprecated/wrong boundary files
  if [[ "$CANONICAL_BOUNDARY_FILE" == "proxy.ts" ]]; then
    if [[ -f "$REPO_ROOT/middleware.ts" ]]; then
      echo "   ❌ FAIL: middleware.ts exists (deprecated in Next.js 16)"
      echo "      SoT requires proxy.ts, not middleware.ts"
      GATE_FAILED=1
    else
      echo "   ✅ PASS: No deprecated middleware.ts"
    fi
  fi

  # Check for misplaced boundary files
  if [[ -f "$REPO_ROOT/src/proxy.ts" ]]; then
    echo "   ❌ FAIL: src/proxy.ts exists (wrong location)"
    echo "      Boundary file must be at root, not in src/"
    GATE_FAILED=1
  else
    echo "   ✅ PASS: No misplaced src/proxy.ts"
  fi

  if [[ -f "$REPO_ROOT/src/middleware.ts" ]]; then
    echo "   ❌ FAIL: src/middleware.ts exists (wrong location)"
    GATE_FAILED=1
  else
    echo "   ✅ PASS: No misplaced src/middleware.ts"
  fi

  echo ""

  # B) NextResponse.next() only in canonical boundary file
  echo "🔍 [B] Checking NextResponse.next() usage..."
  local VIOLATIONS
  VIOLATIONS=$(grep -Rna "NextResponse\.next" "$REPO_ROOT" --include="*.ts" --include="*.tsx" 2>/dev/null | grep -vE "^\./$CANONICAL_BOUNDARY_FILE:|^$CANONICAL_BOUNDARY_FILE:|node_modules" || true)
  if [[ -z "$VIOLATIONS" ]]; then
    echo "   ✅ PASS: NextResponse.next() only in $CANONICAL_BOUNDARY_FILE"
  else
    echo "   ❌ FAIL: NextResponse.next() found outside $CANONICAL_BOUNDARY_FILE:"
    echo "$VIOLATIONS" | head -5 | sed 's/^/      /'
    echo "      SoT Rule: NextResponse.next() ONLY allowed in /$CANONICAL_BOUNDARY_FILE"
    GATE_FAILED=1
  fi

  echo ""

  # C) Auth0 SDK route reservation (/auth/* must not have app routes)
  echo "🔍 [C] Checking /auth/* route reservation..."
  if [[ -d "$REPO_ROOT/src/app/auth" ]]; then
    echo "   ❌ FAIL: src/app/auth/ directory exists"
    echo "      SoT Rule: /auth/* is RESERVED for Auth0 SDK"
    echo "      This WILL cause 404 on /auth/login in production"
    ls -la "$REPO_ROOT/src/app/auth/" 2>/dev/null | head -5 | sed 's/^/      /'
    GATE_FAILED=1
  else
    echo "   ✅ PASS: No conflicting src/app/auth/ directory"
  fi

  echo ""

  # D) auth0.middleware() not in route handlers
  echo "🔍 [D] Checking auth0.middleware() usage in route handlers..."
  local AUTH0_MW_VIOLATIONS
  AUTH0_MW_VIOLATIONS=$(grep -Rna "auth0\.middleware" "$REPO_ROOT/src/app" --include="*.ts" --include="*.tsx" 2>/dev/null || true)
  if [[ -z "$AUTH0_MW_VIOLATIONS" ]]; then
    echo "   ✅ PASS: No auth0.middleware() in route handlers"
  else
    echo "   ❌ FAIL: auth0.middleware() found in route handlers:"
    echo "$AUTH0_MW_VIOLATIONS" | head -5 | sed 's/^/      /'
    echo "      SoT Rule: auth0.middleware() ONLY allowed in /$CANONICAL_BOUNDARY_FILE"
    GATE_FAILED=1
  fi

  echo ""

  # Gate result
  if [[ $GATE_FAILED -eq 1 ]]; then
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║   ❌ SoT COMPLIANCE GATE FAILED                            ║"
    echo "║                                                            ║"
    echo "║   Fix violations before proceeding with build/deploy.      ║"
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
echo "📦 Versão: 20251229.2200"
echo "📁 Root: $REPO_ROOT"
echo "🔑 Git SHA: $(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
echo ""

# ---------------------------------------------------------
# 0. SoT Compliance Gate (MANDATORY - FAIL FAST)
# ---------------------------------------------------------
sot_compliance_gate

# ---------------------------------------------------------
# 1. Load .env.local (if exists)
# ---------------------------------------------------------
ENV_FILE="$REPO_ROOT/.env.local"
if [[ -f "$ENV_FILE" ]]; then
  echo "[Step-2] Loading variables from $ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE" 2>/dev/null || true
  set +a
else
  echo "[Step-2] No .env.local found (optional)"
fi

# ---------------------------------------------------------
# 2. Clean previous build artifacts
# ---------------------------------------------------------
echo ""
echo "[Step-2] 🧹 Cleaning previous build artifacts..."

pkill -9 -f "next-server" 2>/dev/null || true
pkill -9 -f "next dev" 2>/dev/null || true
sleep 0.5

if [[ -d "$REPO_ROOT/.next" ]]; then
  echo "   - Removing .next/"
  rm -rf "$REPO_ROOT/.next"
fi

[[ -d "$REPO_ROOT/node_modules/.cache" ]] && rm -rf "$REPO_ROOT/node_modules/.cache" || true
[[ -f "$REPO_ROOT/tsconfig.tsbuildinfo" ]] && rm -f "$REPO_ROOT/tsconfig.tsbuildinfo" || true

echo "[Step-2] ✓ Clean complete"

# ---------------------------------------------------------
# 3. Install dependencies (deterministic)
# ---------------------------------------------------------
echo ""
echo "[Step-2] 📦 Installing dependencies..."

if [[ -f "$REPO_ROOT/yarn.lock" ]]; then
  echo "   Using: yarn install --frozen-lockfile"
  yarn install --frozen-lockfile 2>/dev/null || yarn install
elif [[ -f "$REPO_ROOT/package-lock.json" ]]; then
  echo "   Using: npm ci"
  npm ci
else
  echo "   Using: npm install"
  npm install
fi

echo "[Step-2] ✓ Dependencies installed"

# ---------------------------------------------------------
# 4. Lint (fail on errors)
# ---------------------------------------------------------
echo ""
echo "[Step-2] 🔍 Running lint..."

set +e
npm run lint 2>&1
LINT_STATUS=$?
set -e

if [[ $LINT_STATUS -ne 0 ]]; then
  echo "[Step-2] ❌ Lint failed. Fix errors before continuing."
  exit 1
fi
echo "[Step-2] ✓ Lint passed"

# ---------------------------------------------------------
# 5. Production build
# ---------------------------------------------------------
echo ""
echo "[Step-2] 🏗️  Running production build..."
npm run build

# ---------------------------------------------------------
# 6. Post-build validation
# ---------------------------------------------------------
echo ""
echo "[Step-2] 🔍 Validating build output..."

if [[ ! -f "$REPO_ROOT/.next/BUILD_ID" ]]; then
  echo "[Step-2] ❌ ERROR: BUILD_ID not generated."
  exit 1
fi

BUILD_ID="$(cat "$REPO_ROOT/.next/BUILD_ID")"
GIT_SHA="$(git rev-parse HEAD 2>/dev/null || echo 'unknown')"
GIT_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')"

echo "[Step-2] ✓ BUILD_ID: $BUILD_ID"

# Verify boundary file still exists (sanity check)
if [[ ! -f "$REPO_ROOT/$CANONICAL_BOUNDARY_FILE" ]]; then
  echo "[Step-2] ❌ CRITICAL: $CANONICAL_BOUNDARY_FILE disappeared during build!"
  exit 1
fi
echo "[Step-2] ✓ Boundary file intact: $CANONICAL_BOUNDARY_FILE"

# ---------------------------------------------------------
# Summary
# ---------------------------------------------------------
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║              Build Completed Successfully!                 ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "📋 Summary:"
echo "   ✅ SoT Compliance: PASSED"
echo "   ✅ Boundary file:  $CANONICAL_BOUNDARY_FILE"
echo "   ✅ BUILD_ID:       $BUILD_ID"
echo "   ✅ GIT_SHA:        $GIT_SHA"
echo "   ✅ GIT_BRANCH:     $GIT_BRANCH"
echo ""
echo "📋 Next steps:"
echo "   1️⃣  Test locally:  ./scripts/Step-3-test-local.sh"
echo "   2️⃣  Deploy:        ./scripts/Step-4-deploy-tested-build.sh"
echo ""
