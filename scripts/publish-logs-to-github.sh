#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOGS_DIR="$ROOT_DIR/logs"
TARGET_DIR="$ROOT_DIR/local-logs"
STAGE=0

usage() {
  cat <<'USAGE'
Usage: scripts/publish-logs-to-github.sh [--stage]

Copies the current contents of ./logs into ./local-logs so they can be pushed to GitHub.
By default it only copies files. Use --stage to force-add the resulting ./local-logs changes.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --stage)
      STAGE=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "[publish-logs] Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ ! -d "$LOGS_DIR" ]]; then
  echo "[publish-logs] Missing $LOGS_DIR. Generate or download logs locally first." >&2
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
  echo "[publish-logs] No log files found under $LOGS_DIR (excluding README.md/.gitkeep). Nothing to publish."
  exit 0
fi

mkdir -p "$TARGET_DIR"

rsync -av --delete \
  --exclude 'README.md' \
  --exclude '.gitkeep' \
  "$LOGS_DIR/" "$TARGET_DIR/"

echo "[publish-logs] Logs copied from $LOGS_DIR to $TARGET_DIR."

if (( STAGE == 1 )); then
  git add -f "$TARGET_DIR"
  echo "[publish-logs] Forced ./local-logs staged. Commit and push manually."
else
  cat <<'NOTE'
[publish-logs] Copy complete. To publish, run:
  git add -f local-logs
  git commit -m "chore: publish logs"
  git push
NOTE
fi

