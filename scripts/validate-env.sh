#!/usr/bin/env bash
set -euo pipefail

# Environment Variables Validator
# Validates .env.local or custom env file for Supabase integration
#
# Usage:
#   bash scripts/validate-env.sh                  # Validates .env.local
#   bash scripts/validate-env.sh /path/to/.env    # Validates custom file

ENV_FILE="${1:-.env.local}"

echo "════════════════════════════════════════════════════════════"
echo "  Environment Variables Validation"
echo "════════════════════════════════════════════════════════════"
echo ""

if [ ! -f "$ENV_FILE" ]; then
  echo "✗ File not found: $ENV_FILE"
  echo ""
  echo "Please create $ENV_FILE with:"
  echo "  NEXT_PUBLIC_SUPABASE_URL=https://..."
  echo "  NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc..."
  echo "  SUPABASE_SERVICE_ROLE_KEY=eyJhbGc..."
  echo ""
  echo "Or use Softgen's fetch_and_update_api_keys tool to get keys automatically."
  exit 1
fi

echo "Validating: $ENV_FILE"
echo ""
echo "════════════════════════════════════════════════════════════"
echo "  ⚠️  CRITICAL: Understanding Supabase API Key Types"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "Supabase Dashboard has TWO TABS with different key formats:"
echo ""
echo "Tab 1: 'Publishable and secret API keys' (NEW FORMAT)"
echo "  - Publishable key: sb_publishable_..."
echo "  - Secret key: sb_secret_..."
echo "  → Used for: Management API, Supabase CLI"
echo "  → NOT for: REST API, sync scripts"
echo ""
echo "Tab 2: 'Legacy anon, service_role API keys' (JWT FORMAT)"
echo "  - anon public: eyJhbGc... (JWT with 3 parts)"
echo "  - service_role secret: eyJhbGc... (JWT with 3 parts)"
echo "  → Used for: REST API, database operations, sync scripts"
echo "  → THIS IS WHAT YOU NEED for sync-meshcentral-to-supabase.sh!"
echo ""
echo "⚠️  For sync scripts: ALWAYS use JWT from 'Legacy' tab!"
echo "════════════════════════════════════════════════════════════"
echo ""

# Load variables (without exporting to avoid side effects)
set -a
source "$ENV_FILE"
set +a

ERRORS=0
WARNINGS=0

# Validate SUPABASE_URL
echo "Checking SUPABASE_URL..."
if [ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" ] && [ -z "${SUPABASE_URL:-}" ]; then
  echo "✗ SUPABASE_URL missing"
  echo "  Required: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL"
  ERRORS=$((ERRORS + 1))
else
  URL="${NEXT_PUBLIC_SUPABASE_URL:-${SUPABASE_URL}}"
  echo "✓ SUPABASE_URL: ${URL:0:40}..."
fi
echo ""

# Validate ANON_KEY (JWT token - required for REST API)
echo "Checking NEXT_PUBLIC_SUPABASE_ANON_KEY..."
if [ -z "${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}" ] && [ -z "${SUPABASE_ANON_KEY:-}" ]; then
  echo "✗ ANON_KEY missing (required for REST API)"
  echo ""
  echo "  This key is CRITICAL for REST API operations (frontend, sync scripts)."
  echo ""
  echo "  How to get:"
  echo "    1. Go to Supabase Dashboard → Project Settings → API"
  echo "    2. Copy the 'anon' public key (starts with 'eyJhbGc...')"
  echo "    3. Add to $ENV_FILE:"
  echo "       NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...FULL_JWT_HERE"
  ERRORS=$((ERRORS + 1))
else
  ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-${SUPABASE_ANON_KEY}}"
  ANON_PARTS=$(echo "$ANON_KEY" | tr '.' '\n' | wc -l)
  ANON_LENGTH=${#ANON_KEY}
  
  if [ "$ANON_PARTS" -ne 3 ]; then
    echo "✗ ANON_KEY invalid: $ANON_PARTS parts (expected 3)"
    echo "  JWT format required: header.payload.signature"
    ERRORS=$((ERRORS + 1))
  elif [ "$ANON_LENGTH" -lt 150 ]; then
    echo "⚠ ANON_KEY seems too short: $ANON_LENGTH chars (expected 200+)"
    WARNINGS=$((WARNINGS + 1))
  elif [[ ! "$ANON_KEY" =~ ^eyJ ]]; then
    echo "✗ ANON_KEY invalid format (must start with 'eyJ')"
    echo "  Current key starts with: ${ANON_KEY:0:10}"
    ERRORS=$((ERRORS + 1))
  else
    echo "✓ ANON_KEY: 3 parts, $ANON_LENGTH chars, valid JWT format"
  fi
fi
echo ""

# Check SERVICE_ROLE_KEY (optional - two possible formats)
echo "Checking SUPABASE_SERVICE_ROLE_KEY..."
if [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "⚠ SERVICE_ROLE_KEY missing (optional)"
  echo ""
  echo "  This key is used for:"
  echo "    - Management API operations (deploy functions, manage secrets)"
  echo "    - Admin-level REST API operations (bypass RLS)"
  echo ""
  echo "  Two possible formats:"
  echo "    1. Secret format: sb_secret_... (Management API)"
  echo "    2. JWT format: eyJhbGc... (REST API with service_role privileges)"
  echo ""
  echo "  If you only need REST API (sync scripts), ANON_KEY is sufficient."
  WARNINGS=$((WARNINGS + 1))
else
  SERVICE_KEY="$SUPABASE_SERVICE_ROLE_KEY"
  SERVICE_LENGTH=${#SERVICE_KEY}
  
  if [[ "$SERVICE_KEY" =~ ^sb_secret_ ]]; then
    # Secret format (Management API)
    echo "✓ SERVICE_ROLE_KEY: Secret format (sb_secret_...), $SERVICE_LENGTH chars"
    echo "  → Usable for: Management API, supabase CLI"
    echo "  → NOT usable for: REST API (use ANON_KEY or SERVICE_ROLE_JWT)"
  elif [[ "$SERVICE_KEY" =~ ^eyJ ]]; then
    # JWT format (REST API)
    SERVICE_PARTS=$(echo "$SERVICE_KEY" | tr '.' '\n' | wc -l)
    
    if [ "$SERVICE_PARTS" -ne 3 ]; then
      echo "✗ SERVICE_ROLE_KEY (JWT): invalid format, $SERVICE_PARTS parts (expected 3)"
      ERRORS=$((ERRORS + 1))
    elif [ "$SERVICE_LENGTH" -lt 150 ]; then
      echo "⚠ SERVICE_ROLE_KEY (JWT): seems too short, $SERVICE_LENGTH chars (expected 200+)"
      WARNINGS=$((WARNINGS + 1))
    else
      echo "✓ SERVICE_ROLE_KEY: JWT format, 3 parts, $SERVICE_LENGTH chars"
      echo "  → Usable for: REST API with service_role privileges (bypass RLS)"
    fi
  else
    echo "✗ SERVICE_ROLE_KEY: unknown format (not sb_secret_ or eyJhbGc...)"
    echo "  Current key starts with: ${SERVICE_KEY:0:10}"
    ERRORS=$((ERRORS + 1))
  fi
fi
echo ""

# Summary
echo "════════════════════════════════════════════════════════════"
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
  echo "  ✓ ALL CHECKS PASSED"
  echo "════════════════════════════════════════════════════════════"
  exit 0
elif [ $ERRORS -eq 0 ]; then
  echo "  ⚠ PASSED WITH $WARNINGS WARNING(S)"
  echo "════════════════════════════════════════════════════════════"
  exit 0
else
  echo "  ✗ FAILED: $ERRORS ERROR(S), $WARNINGS WARNING(S)"
  echo "════════════════════════════════════════════════════════════"
  echo ""
  echo "Please fix the errors above before running any scripts."
  echo ""
  echo "RECOMMENDED: Use Softgen's fetch_and_update_api_keys tool"
  echo "  In Softgen chat, ask AI to run: fetch_and_update_api_keys"
  echo "  This will automatically fetch and update all keys."
  echo ""
  echo "Or manually get keys from:"
  echo "  https://supabase.com/dashboard/project/<ref>/settings/api"
  exit 1
fi