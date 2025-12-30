#!/usr/bin/env bash
#
# Step 2: Build Local - Next.js (Auth0-aware, SoT Compliant)
#
# SoT Reference: /docs/SoT/AUTH_AND_MIDDLEWARE_ARCHITECTURE.md
#
# Version: 20251230.0100
# Last Updated: 2025-12-30 01:00 UTC
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# ═══════════════════════════════════════════════════════════════════════════════
# CANONICAL MIDDLEWARE FILE (per SoT)
# Auth0 SDK v4 + Next.js requires middleware.ts at project root
# ═══════════════════════════════════════════════════════════════════════════════
CANONICAL_MIDDLEWARE_FILE="middleware.ts"

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
  echo "📋 Canonical middleware file: $CANONICAL_MIDDLEWARE_FILE"
  echo ""

  local GATE_FAILED=0

  # -------------------------------------------------------------------------
  # A) middleware.ts MUST exist at repo root
  # -------------------------------------------------------------------------
  echo "🔍 [A] Checking canonical middleware file..."
  if [[ -f "$REPO_ROOT/$CANONICAL_MIDDLEWARE_FILE" ]]; then
    echo "   ✅ PASS: $CANONICAL_MIDDLEWARE_FILE exists at root"
    echo "   📄 File size: $(wc -c < "$REPO_ROOT/$CANONICAL_MIDDLEWARE_FILE") bytes"
  else
    echo "   ❌ FAIL: $CANONICAL_MIDDLEWARE_FILE NOT found at root"
    echo "      This file is REQUIRED for Auth0 routes to work."
    echo "      Without it, /auth/login will return 404 in production."
    GATE_FAILED=1
  fi

  # -------------------------------------------------------------------------
  # B) proxy.ts MUST NOT exist (deprecated pattern)
  # -------------------------------------------------------------------------
  echo ""
  echo "🔍 [B] Checking for deprecated proxy.ts..."
  if [[ -f "$REPO_ROOT/proxy.ts" ]]; then
    echo "   ❌ FAIL: proxy.ts exists (deprecated pattern)"
    echo "      SoT requires middleware.ts, not proxy.ts"
    echo "      Remove proxy.ts and use middleware.ts instead."
    GATE_FAILED=1
  else
    echo "   ✅ PASS: No deprecated proxy.ts"
  fi

  # -------------------------------------------------------------------------
  # C) src/middleware.ts MUST NOT exist (wrong location)
  # -------------------------------------------------------------------------
  echo ""
  echo "🔍 [C] Checking for misplaced middleware files..."
  if [[ -f "$REPO_ROOT/src/middleware.ts" ]]; then
    echo "   ❌ FAIL: src/middleware.ts exists (wrong location)"
    echo "      Middleware file must be at root, not in src/"
    GATE_FAILED=1
  else
    echo "   ✅ PASS: No misplaced src/middleware.ts"
  fi

  if [[ -f "$REPO_ROOT/src/proxy.ts" ]]; then
    echo "   ❌ FAIL: src/proxy.ts exists (wrong location and name)"
    GATE_FAILED=1
  else
    echo "   ✅ PASS: No misplaced src/proxy.ts"
  fi

  # -------------------------------------------------------------------------
  # D) src/app/auth/ directory MUST NOT exist (shadows Auth0 SDK routes)
  # -------------------------------------------------------------------------
  echo ""
  echo "🔍 [D] Checking /auth/* route reservation..."
  if [[ -d "$REPO_ROOT/src/app/auth" ]]; then
    echo "   ❌ FAIL: src/app/auth/ directory exists"
    echo "      SoT Rule: /auth/* is RESERVED for Auth0 SDK v4"
    echo "      This WILL cause 404 on /auth/login in production"
    ls -la "$REPO_ROOT/src/app/auth/" 2>/dev/null | head -5 | sed 's/^/      /'
    GATE_FAILED=1
  else
    echo "   ✅ PASS: No conflicting src/app/auth/ directory"
  fi

  # -------------------------------------------------------------------------
  # E) No explicit Auth0 route handlers (v3 pattern, conflicts with v4)
  # -------------------------------------------------------------------------
  echo ""
  echo "🔍 [E] Checking for explicit Auth0 route handlers (v3 pattern)..."
  local V3_HANDLER_APP="$REPO_ROOT/src/app/auth/[...auth0]/route.ts"
  local V3_HANDLER_PAGES="$REPO_ROOT/src/pages/api/auth/[...auth0].ts"
  
  if [[ -f "$V3_HANDLER_APP" ]]; then
    echo "   ❌ FAIL: src/app/auth/[...auth0]/route.ts exists"
    echo "      This is a v3 pattern that conflicts with Auth0 SDK v4."
    echo "      In v4, auth routes are auto-mounted via middleware."
    GATE_FAILED=1
  else
    echo "   ✅ PASS: No v3 App Router Auth0 handler"
  fi

  if [[ -f "$V3_HANDLER_PAGES" ]]; then
    echo "   ❌ FAIL: src/pages/api/auth/[...auth0].ts exists"
    echo "      This is a Pages Router pattern that conflicts with App Router."
    GATE_FAILED=1
  else
    echo "   ✅ PASS: No Pages Router Auth0 handler"
  fi

  # -------------------------------------------------------------------------
  # F) NextResponse.next() ONLY in middleware.ts
  # Robust path normalization to handle ./middleware.ts, absolute paths, etc.
  # -------------------------------------------------------------------------
  echo ""
  echo "🔍 [F] Checking NextResponse.next() usage..."
  
  # Get canonical absolute path of middleware.ts
  local CANONICAL_PATH
  if [[ -f "$REPO_ROOT/$CANONICAL_MIDDLEWARE_FILE" ]]; then
    CANONICAL_PATH="$(cd "$REPO_ROOT" && pwd)/$CANONICAL_MIDDLEWARE_FILE"
    # Use realpath if available for symlink resolution
    if command -v realpath >/dev/null 2>&1; then
      CANONICAL_PATH="$(realpath "$REPO_ROOT/$CANONICAL_MIDDLEWARE_FILE" 2>/dev/null || echo "$CANONICAL_PATH")"
    fi
  else
    CANONICAL_PATH=""
  fi
  
  # Find all NextResponse.next() usages, excluding common non-source directories
  local VIOLATIONS=""
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    # Extract file path (everything before first colon)
    local file_path="${line%%:*}"
    # Skip if file_path is empty
    [[ -z "$file_path" ]] && continue
    # Get absolute path of the matched file
    local abs_path
    if [[ "$file_path" = /* ]]; then
      abs_path="$file_path"
    else
      abs_path="$(cd "$REPO_ROOT" && pwd)/$file_path"
    fi
    # Normalize with realpath if available
    if command -v realpath >/dev/null 2>&1; then
      abs_path="$(realpath "$abs_path" 2>/dev/null || echo "$abs_path")"
    fi
    # Compare against canonical path
    if [[ "$abs_path" != "$CANONICAL_PATH" ]]; then
      VIOLATIONS="${VIOLATIONS}${line}"$'\n'
    fi
  done < <(grep -Rn "NextResponse\.next" "$REPO_ROOT" \
    --include="*.ts" --include="*.tsx" \
    --exclude-dir=node_modules --exclude-dir=.next \
    --exclude-dir=.git --exclude-dir=dist \
    --exclude-dir=build --exclude-dir=coverage 2>/dev/null || true)
  
  # Trim trailing newline
  VIOLATIONS="${VIOLATIONS%$'\n'}"
  
  if [[ -z "$VIOLATIONS" ]]; then
    echo "   ✅ PASS: NextResponse.next() only in $CANONICAL_MIDDLEWARE_FILE"
  else
    echo "   ❌ FAIL: NextResponse.next() found outside $CANONICAL_MIDDLEWARE_FILE:"
    echo "$VIOLATIONS" | head -5 | sed 's/^/      /'
    echo "      SoT Rule: NextResponse.next() ONLY allowed in /middleware.ts"
    GATE_FAILED=1
  fi

  # -------------------------------------------------------------------------
  # G) auth0.middleware() NOT in route handlers
  # -------------------------------------------------------------------------
  echo ""
  echo "🔍 [G] Checking auth0.middleware() usage in route handlers..."
  local AUTH0_MW_VIOLATIONS
  AUTH0_MW_VIOLATIONS=$(grep -Rna "auth0\.middleware" "$REPO_ROOT/src/app" --include="*.ts" --include="*.tsx" 2>/dev/null || true)
  if [[ -z "$AUTH0_MW_VIOLATIONS" ]]; then
    echo "   ✅ PASS: No auth0.middleware() in route handlers"
  else
    echo "   ❌ FAIL: auth0.middleware() found in route handlers:"
    echo "$AUTH0_MW_VIOLATIONS" | head -5 | sed 's/^/      /'
    echo "      SoT Rule: auth0.middleware() ONLY allowed in /middleware.ts"
    GATE_FAILED=1
  fi

  echo ""

  # -------------------------------------------------------------------------
  # Gate result
  # -------------------------------------------------------------------------
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
echo "📦 Version: 20251230.0100"
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

if [[ -f "$REPO_ROOT/package-lock.json" ]]; then
  echo "   Using: npm ci"
  npm ci
elif [[ -f "$REPO_ROOT/yarn.lock" ]]; then
  echo "   Using: yarn install --frozen-lockfile"
  yarn install --frozen-lockfile 2>/dev/null || yarn install
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

# Verify middleware file still exists (sanity check)
if [[ ! -f "$REPO_ROOT/$CANONICAL_MIDDLEWARE_FILE" ]]; then
  echo "[Step-2] ❌ CRITICAL: $CANONICAL_MIDDLEWARE_FILE disappeared during build!"
  exit 1
fi
echo "[Step-2] ✓ Middleware file intact: $CANONICAL_MIDDLEWARE_FILE"

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
echo "   ✅ Middleware file: $CANONICAL_MIDDLEWARE_FILE"
echo "   ✅ BUILD_ID:       $BUILD_ID"
echo "   ✅ GIT_SHA:        $GIT_SHA"
echo "   ✅ GIT_BRANCH:     $GIT_BRANCH"
echo ""
echo "📋 Next steps:"
echo "   1️⃣  Test locally:  ./scripts/Step-3-test-local.sh"
echo "   2️⃣  Deploy:        ./scripts/Step-4-deploy-tested-build.sh"
echo ""
