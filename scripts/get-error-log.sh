#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DROPLET_SSH_USER=${DROPLET_SSH_USER:-"root"}
DROPLET_SSH_HOST=${DROPLET_SSH_HOST:-"142.93.106.94"}
DROPLET_DEBUG_LOG_PATH=${DROPLET_DEBUG_LOG_PATH:-"/var/log/rustdesk-mesh/app-debug.log"}

REQUIRED_VARS=("DROPLET_SSH_USER" "DROPLET_SSH_HOST" "DROPLET_DEBUG_LOG_PATH")
missing=()
for var in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!var-}" ]]; then
    missing+=("$var")
  fi
done

if (( ${#missing[@]} > 0 )); then
  cat <<USAGE
[ERROR] Missing required environment variables: ${missing[*]}
Usage (defaults are prefilled from SoT):
  DROPLET_SSH_USER=${DROPLET_SSH_USER} \
  DROPLET_SSH_HOST=${DROPLET_SSH_HOST} \
  DROPLET_DEBUG_LOG_PATH=${DROPLET_DEBUG_LOG_PATH} \
    scripts/get-error-log.sh
USAGE
  exit 1
fi

LOGS_DIR="$ROOT_DIR/logs"
LOCAL_DIR="$LOGS_DIR/droplet"
SEQUENCE_FILE="$LOGS_DIR/.log-sequence"
RUN_ID=""
LOCAL_FILE=""
LATEST_LINK=""
REMOTE="${DROPLET_SSH_USER}@${DROPLET_SSH_HOST}:${DROPLET_DEBUG_LOG_PATH}"
STEP5_PATTERN="$ROOT_DIR/logs/archive/run-*-logs-*.tar.gz"
STEP5_TARGET=""
TARGET_DIR="$ROOT_DIR/local-logs"
PUBLISH=${PUBLISH:-1}
COMMIT_MESSAGE=${PUBLISH_COMMIT_MESSAGE:-"chore: publish logs"}

usage() {
  cat <<'USAGE'
Usage: scripts/get-error-log.sh [--no-publish]

Downloads the droplet debug log into ./logs/droplet and mirrors ./logs into
./local-logs/, force-staging the result, committing, and pushing to the current
branch. Use --no-publish (or PUBLISH=0) only when you explicitly want to skip
the automatic publish step.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --publish)
      echo "[get-error-log] --publish is now the default; you can omit it." >&2
      shift
      ;;
    --no-publish)
      PUBLISH=0
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "[get-error-log] Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

next_sequence() {
  local current=0
  if [[ -f "$SEQUENCE_FILE" ]]; then
    current=$(cat "$SEQUENCE_FILE" 2>/dev/null || echo 0)
  fi
  current=$((current + 1))
  echo "$current" >"$SEQUENCE_FILE"
  printf "%04d" "$current"
}

RUN_ID="$(next_sequence)"
LOCAL_FILE="${LOCAL_DIR}/run-${RUN_ID}-app-debug.log"
LATEST_LINK="${LOCAL_DIR}/latest-app-debug.log"

mkdir -p "$LOCAL_DIR"

echo "[get-error-log] (run-id: $RUN_ID) Copying ${REMOTE} -> ${LOCAL_FILE}"
if scp "$REMOTE" "$LOCAL_FILE"; then
  ln -sfn "$(basename "$LOCAL_FILE")" "$LATEST_LINK"
  echo "[get-error-log] Log retrieved successfully into $LOCAL_DIR." \
       "Latest pointer updated: $LATEST_LINK -> $(basename "$LOCAL_FILE")"
else
  echo "[get-error-log] Failed to retrieve log from droplet." >&2
  exit 1
fi

shopt -s nullglob
step5_candidates=($STEP5_PATTERN)
shopt -u nullglob

if (( ${#step5_candidates[@]} > 0 )); then
  step5_latest=$(ls -t "${step5_candidates[@]}" | head -n 1)
  step5_basename="$(basename "$step5_latest")"
  STEP5_TARGET="${LOCAL_DIR}/run-${RUN_ID}-${step5_basename}"
  STEP5_LATEST_LINK="${LOCAL_DIR}/latest-step5-logs.tar.gz"
  cp "$step5_latest" "$STEP5_TARGET"
  ln -sfn "$(basename "$STEP5_TARGET")" "$STEP5_LATEST_LINK"
  echo "[get-error-log] Found Step-5 archive: ${step5_latest}. Copied to ${STEP5_TARGET}." \
       "Latest pointer updated: $STEP5_LATEST_LINK -> $(basename "$STEP5_TARGET")"
else
  echo "[get-error-log] Warning: No Step-5 archive found. Skipping."
fi

if (( PUBLISH == 1 )); then
  if ! git symbolic-ref -q HEAD >/dev/null; then
    echo "[get-error-log] Cannot publish logs while on a detached HEAD. Checkout a branch and rerun." >&2
    exit 1
  fi

  shopt -s nullglob dotglob
  log_entries=()
  for entry in "$LOGS_DIR"/*; do
    base=$(basename "$entry")
    if [[ "$base" == "README.md" || "$base" == ".gitkeep" ]]; then
      continue
    fi
    log_entries+=("$entry")
  done
  shopt -u nullglob dotglob

  if (( ${#log_entries[@]} == 0 )); then
    echo "[get-error-log] No log files found under $LOGS_DIR (excluding README.md/.gitkeep). Nothing to publish." >&2
    exit 0
  fi

  mkdir -p "$TARGET_DIR"

  rsync -av --delete \
    --exclude 'README.md' \
    --exclude '.gitkeep' \
    "$LOGS_DIR/" "$TARGET_DIR/"

  echo "[get-error-log] Logs copied from $LOGS_DIR to $TARGET_DIR."

  git add -f "$TARGET_DIR"

  if git diff --cached --quiet -- "$TARGET_DIR"; then
    echo "[get-error-log] No new log changes to commit. Skipping push."
    exit 0
  fi

  git commit -m "$COMMIT_MESSAGE" -- "$TARGET_DIR"

  current_branch=$(git rev-parse --abbrev-ref HEAD)

  push_with_rebase_if_needed() {
    local branch="$1"

    # Sync remote refs so "behind" detection is accurate
    if git rev-parse --abbrev-ref --symbolic-full-name "@{u}" >/dev/null 2>&1; then
      git fetch --prune
    fi

    if git rev-parse --abbrev-ref --symbolic-full-name "@{u}" >/dev/null 2>&1; then
      if git push; then
        return 0
      fi

      if git status -sb | grep -q "behind"; then
        echo "[get-error-log] Branch is behind upstream. Attempting git pull --rebase --autostash..." >&2
        git pull --rebase --autostash
        git push
      else
        echo "[get-error-log] Push failed for an unknown reason. Please check git status manually." >&2
        return 1
      fi
    else
      git push -u origin "$branch"
    fi
  }

  if push_with_rebase_if_needed "$current_branch"; then
    echo "[get-error-log] Published logs to GitHub on branch ${current_branch}."
  else
    exit 1
  fi
else
  echo "[get-error-log] Publishing skipped (--no-publish/PUBLISH=0). Logs stored locally under ./logs."
fi

