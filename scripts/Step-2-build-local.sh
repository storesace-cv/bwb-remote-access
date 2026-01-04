#!/usr/bin/env bash
#
# Step 2: Build Local - Next.js (MeshCentral Auth)
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
    echo "   📄 File size: $(wc -c < "$REPO_ROOT/middleware.ts") bytes"
  else
    echo "   ❌ FAIL: middleware.ts NOT found at root"
    GATE_FAILED=1
  fi

  # B) No Auth0 package
  echo ""
  echo "🔍 [B] Checking for Auth0 dependencies..."
  if grep -q "@auth0/nextjs-auth0" "$REPO_ROOT/package.json" 2>/dev/null; then
    echo "   ❌ FAIL: @auth0/nextjs-auth0 still in package.json"
    echo "      Run: npm uninstall @auth0/nextjs-auth0"
    GATE_FAILED=1
  else
    echo "   ✅ PASS: No Auth0 package in dependencies"
  fi

  # C) No Auth0 imports
  echo ""
  echo "🔍 [C] Checking for Auth0 imports in code..."
  local AUTH0_IMPORTS
  AUTH0_IMPORTS=$(grep -rn "@auth0" "$REPO_ROOT/src" --include="*.ts" --include="*.tsx" 2>/dev/null || true)
  if [[ -n "$AUTH0_IMPORTS" ]]; then
    echo "   ❌ FAIL: Auth0 imports found:"
    echo "$AUTH0_IMPORTS" | head -5 | sed 's/^/      /'
    GATE_FAILED=1
  else
    echo "   ✅ PASS: No Auth0 imports"
  fi

  # D) src/app/auth/ should NOT exist
  echo ""
  echo "🔍 [D] Checking for conflicting auth directory..."
  if [[ -d "$REPO_ROOT/src/app/auth" ]]; then
    echo "   ❌ FAIL: src/app/auth/ directory exists (legacy)"
    GATE_FAILED=1
  else
    echo "   ✅ PASS: No conflicting src/app/auth/"
  fi

  # E) Login page must exist
  echo ""
  echo "🔍 [E] Checking login page..."
  if [[ -f "$REPO_ROOT/src/app/login/page.tsx" ]]; then
    echo "   ✅ PASS: Login page exists"
  else
    echo "   ❌ FAIL: Login page NOT found"
    GATE_FAILED=1
  fi

  # F) mesh-auth.ts must exist
  echo ""
  echo "🔍 [F] Checking MeshCentral auth library..."
  if [[ -f "$REPO_ROOT/src/lib/mesh-auth.ts" ]]; then
    echo "   ✅ PASS: mesh-auth.ts exists"
  else
    echo "   ❌ FAIL: mesh-auth.ts NOT found"
    GATE_FAILED=1
  fi

  echo ""

  if [[ $GATE_FAILED -eq 1 ]]; then
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║   ❌ COMPLIANCE GATE FAILED                                ║"
    echo "║   Fix violations before building.                          ║"
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
echo "║       Step 2: Build Local - Next.js (MeshCentral Auth)     ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "📦 Version: 20260104.0100"
echo "📁 Root: $REPO_ROOT"
echo "🔑 Git SHA: $(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
echo ""

# ---------------------------------------------------------
# 0. Compliance Gate
# ---------------------------------------------------------
compliance_gate

# ---------------------------------------------------------
# 1. Load .env.local (if exists)
# ---------------------------------------------------------
ENV_FILE="$REPO_ROOT/.env.local"
if [[ -f "$ENV_FILE" ]]; then
  echo "[Step-2] Loading variables from $ENV_FILE"
  set -a
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
# 3. Lockfile Sync Gate
# ---------------------------------------------------------
echo ""
echo "[Step-2] 🔐 Lockfile Sync Gate..."

if [[ ! -f "$REPO_ROOT/package-lock.json" ]]; then
  echo "   ❌ FAIL: package-lock.json not found"
  echo ""
  echo "   Regenerate and commit:"
  echo "     rm -rf node_modules package-lock.json"
  echo "     npm install --package-lock-only"
  echo "     git add package-lock.json && git commit && git push"
  exit 1
fi
echo "   ✅ PASS: package-lock.json found"

# ---------------------------------------------------------
# 4. Install dependencies
# ---------------------------------------------------------
echo ""
echo "[Step-2] 📦 Installing dependencies..."

if [[ -f "$REPO_ROOT/package-lock.json" ]]; then
  echo "   Using: npm ci"
  npm ci
else
  echo "   Using: npm install"
  npm install
fi

echo "[Step-2] ✓ Dependencies installed"

# ---------------------------------------------------------
# 5. Lint
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
# 6. Production build
# ---------------------------------------------------------
echo ""
echo "[Step-2] 🏗️  Running production build..."
npm run build

# ---------------------------------------------------------
# 7. Post-build validation
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

# ---------------------------------------------------------
# Summary
# ---------------------------------------------------------
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║              Build Completed Successfully!                 ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "📋 Summary:"
echo "   ✅ Compliance: PASSED (MeshCentral Auth)"
echo "   ✅ BUILD_ID:   $BUILD_ID"
echo "   ✅ GIT_SHA:    $GIT_SHA"
echo "   ✅ GIT_BRANCH: $GIT_BRANCH"
echo ""
echo "📋 Next steps:"
echo "   1️⃣  Test locally:  ./scripts/Step-3-test-local.sh"
echo "   2️⃣  Deploy:        ./scripts/Step-4-deploy-tested-build.sh"
echo ""
