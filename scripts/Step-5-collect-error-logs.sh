#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_ROOT="$ROOT_DIR/logs"
LOCAL_LOG_DIR="$LOG_ROOT/local"
DEPLOY_LOG_DIR="$LOG_ROOT/deploy"
ARCHIVE_DIR="$LOG_ROOT/archive"
TIMESTAMP="$(date +"%Y%m%d-%H%M%S")"
SEQUENCE_FILE="$LOG_ROOT/.log-sequence"

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
ARCHIVE_BASENAME="run-${RUN_ID}-logs-${TIMESTAMP}.tar.gz"
ARCHIVE="$ARCHIVE_DIR/$ARCHIVE_BASENAME"
LATEST_LINK="$ARCHIVE_DIR/logs-latest.tar.gz"

log_dirs=()

if [[ -d "$LOCAL_LOG_DIR" && -n "$(ls -A "$LOCAL_LOG_DIR" 2>/dev/null)" ]]; then
  log_dirs+=("local")
fi

if [[ -d "$DEPLOY_LOG_DIR" && -n "$(ls -A "$DEPLOY_LOG_DIR" 2>/dev/null)" ]]; then
  log_dirs+=("deploy")
fi

mkdir -p "$ARCHIVE_DIR"

if [[ ${#log_dirs[@]} -eq 0 ]]; then
  echo "[Step-5] Nenhum log encontrado em $LOCAL_LOG_DIR ou $DEPLOY_LOG_DIR. Corre os passos anteriores primeiro." >&2
  exit 1
fi

tar -czf "$ARCHIVE" -C "$LOG_ROOT" "${log_dirs[@]}"
ln -sfn "$ARCHIVE_BASENAME" "$LATEST_LINK"

cat <<EOF2
[Step-5] Logs comprimidos em: $ARCHIVE (run-id: $RUN_ID)
[Step-5] 'latest' actualizado para: $LATEST_LINK
[Step-5] Incluídos: ${log_dirs[*]} (originais mantêm-se em $LOG_ROOT)
EOF2
