#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/update-supabase-function-secrets.sh
#
# This script:
#   - Loads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local
#   - Uses the Supabase CLI to update Edge Function secrets with those values
#   - Redeploys the main Edge Functions used by this project
#
# IMPORTANT:
#   - You must have the Supabase CLI installed and logged in (supabase login).
#   - supabase/config.toml must be linked to the correct project (supabase link).

ENV_FILE=".env.local"

echo "[update-supabase-function-secrets] Loading environment from ${ENV_FILE}..."

if [ ! -f "${ENV_FILE}" ]; then
  echo "Error: ${ENV_FILE} not found. Ensure you run this from the project root and have your env configured." >&2
  exit 1
fi

# shellcheck source=/dev/null
set -a
. "./${ENV_FILE}"
set +a

: "${NEXT_PUBLIC_SUPABASE_URL:?NEXT_PUBLIC_SUPABASE_URL is required in .env.local}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is required in .env.local}"

if ! command -v supabase >/dev/null 2>&1; then
  echo "Error: supabase CLI not found. Install it first (see docs/supabase-cli-for-ai.md)." >&2
  exit 1
fi

echo "[update-supabase-function-secrets] Setting secrets on Supabase Edge Functions..."
supabase functions secrets set \
  SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL}" \
  SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY}"

echo "[update-supabase-function-secrets] Deploying functions..."
supabase functions deploy \
  get-devices \
  register-device \
  remove-device \
  get-qr \
  generate-qr-image \
  get-registration-token \
  start-registration-session \
  check-registration-status \
  admin-update-device \
  admin-delete-device \
  admin-list-mesh-users \
  login

echo "[update-supabase-function-secrets] Done. Edge Functions now use the secrets from your current .env.local."