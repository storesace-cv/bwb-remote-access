#!/bin/sh
set -eu

# ==========================================================
# Canonical Supabase Edge Functions Deploy Script (POSIX sh)
# ==========================================================
# RULE: Any change under supabase/functions/** REQUIRES a deploy.
# This script provides reproducible deploy + evidence output.
#
# Inputs (priority order) for project ref:
#   1) SUPABASE_PROJECT_REF (if defined)
#   2) PROJECT_REF (fallback)
#   3) Derived from SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL (.env.local)
#
# Other inputs:
#   SUPABASE_URL (optional; also used for curl hint)
#   DEPLOY_ALL=1 (default) or DEPLOY_ALL=0 + FUNCTIONS="fn1 fn2"
# ==========================================================

# Resolve repo root relative to this script using POSIX sh
ROOT_DIR=$(
  CDPATH= cd -- "$(dirname "$0")/.." >/dev/null 2>&1 && pwd
)

cd "$ROOT_DIR"

ENV_FILE_DEFAULT="$ROOT_DIR/.env.local"
ENV_FILE=${ENV_FILE:-$ENV_FILE_DEFAULT}

if [ -f "$ENV_FILE" ]; then
  echo "==> Loading environment from $ENV_FILE"
  # shellcheck disable=SC1090
  set -a
  . "$ENV_FILE"
  set +a
else
  echo "==> No env file found at $ENV_FILE (continuing without loading .env.local)"
fi

derive_project_ref() {
  url=$1
  if [ -z "$url" ]; then
    return 0
  fi
  ref=$(printf '%s\n' "$url" | sed -n 's|https\?://\([^./]*\)\.supabase\.co.*|\1|p')
  if [ -n "$ref" ]; then
    printf '%s\n' "$ref"
  fi
}

# Try to derive SUPABASE_PROJECT_REF from URLs if not set
if [ -z "${SUPABASE_PROJECT_REF:-}" ]; then
  for candidate in ${SUPABASE_URL:-} ${NEXT_PUBLIC_SUPABASE_URL:-}; do
    [ -n "$candidate" ] || continue
    derived_ref=$(derive_project_ref "$candidate")
    if [ -n "$derived_ref" ]; then
      SUPABASE_PROJECT_REF=$derived_ref
      echo "==> Derived SUPABASE_PROJECT_REF from URL: $SUPABASE_PROJECT_REF"
      break
    fi
  done
fi

PROJECT_REF=${SUPABASE_PROJECT_REF:-${PROJECT_REF:-}}

SUPABASE_URL=${SUPABASE_URL:-}
DEPLOY_ALL=${DEPLOY_ALL:-1}
FUNCTIONS=${FUNCTIONS:-}

die() {
  echo "ERROR: $*" >&2
  exit 1
}

if ! command -v supabase >/dev/null 2>&1; then
  die "Supabase CLI not found. Install it first."
fi

if [ -z "$PROJECT_REF" ]; then
  die "Missing project ref. Define SUPABASE_PROJECT_REF, PROJECT_REF or ensure SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL include the full Supabase project URL."
fi

if [ ! -d "supabase/functions" ]; then
  die "supabase/functions directory not found at repo root: $ROOT_DIR"
fi

echo "==> supabase version:"
supabase --version || true

echo "==> Linking project: $PROJECT_REF"
supabase link --project-ref "$PROJECT_REF"

echo "==> Deploying Edge Functions..."
if [ "$DEPLOY_ALL" = "1" ]; then
  # Prefer --all if supported by current CLI
  if supabase functions deploy --help 2>/dev/null | grep -q -- "--all"; then
    supabase functions deploy --all --project-ref "$PROJECT_REF"
  else
    echo "WARN: 'supabase functions deploy --all' not supported. Deploying per folder."
    for fn in $(cd supabase/functions && ls -1); do
      [ -d "supabase/functions/$fn" ] || continue
      echo "→ Deploying: $fn"
      supabase functions deploy "$fn" --project-ref "$PROJECT_REF"
    done
  fi
else
  [ -n "$FUNCTIONS" ] || die "DEPLOY_ALL=0 but FUNCTIONS is empty. Provide FUNCTIONS=\"fn1 fn2\"."
  for fn in $FUNCTIONS; do
    echo "→ Deploying: $fn"
    supabase functions deploy "$fn" --project-ref "$PROJECT_REF"
  done
fi

echo "==> Deploy completed."

echo "==> Evidence block (copy into PR response):"
echo "DEPLOY_EVIDENCE:"
echo "  project_ref: $PROJECT_REF"
echo "  deploy_all: $DEPLOY_ALL"
if [ "$DEPLOY_ALL" != "1" ]; then
  echo "  functions: $FUNCTIONS"
fi
echo "END_DEPLOY_EVIDENCE"

if [ -n "$SUPABASE_URL" ]; then
  echo "==> Post-deploy test example:"
  echo "curl -i \"$SUPABASE_URL/functions/v1/<function-name>\" \\"
  echo "  -H \"Authorization: Bearer <ACCESS_TOKEN>\" \\"
  echo "  -H \"Content-Type: application/json\""
else
  echo "==> NOTE: Set SUPABASE_URL to print ready-to-run curl hints."
fi

echo "SUCCESS"