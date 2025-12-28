#!/usr/bin/env bash
# Entrypoint for rustdesk-frontend.service
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Export environment variables from known files if present
load_env_file() {
  local file="$1"
  if [[ -f "$file" ]]; then
    echo "[start.sh] Loading environment from $file"
    set -a
    # shellcheck disable=SC1090
    source "$file"
    set +a
  fi
}

# Prefer production-specific env file but fall back to .env.local for now
load_env_file "$SCRIPT_DIR/.env.production"
load_env_file "$SCRIPT_DIR/.env.local"

export NODE_ENV="${NODE_ENV:-production}"
export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-3000}"
export PATH="/usr/local/bin:/usr/bin:/bin:${PATH:-}" # ensure node/npm are in PATH

if [[ ! -d "$SCRIPT_DIR/.next" ]]; then
  echo "[start.sh] Build output not found (.next missing). Run 'npm run build' before starting." >&2
  exit 1
fi

echo "[start.sh] Starting Next.js app on ${HOST}:${PORT} (NODE_ENV=${NODE_ENV})"
exec npm run start -- --hostname "$HOST" --port "$PORT"
