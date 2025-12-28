#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT_DIR/logs/local"
TIMESTAMP="$(date +"%Y%m%d-%H%M%S")"
LOG_FILE="$LOG_DIR/Step-1-download-from-main-$TIMESTAMP.log"

mkdir -p "$LOG_DIR"
exec > >(tee -a "$LOG_FILE") 2>&1

log() {
  printf '[Step-1][%s] %s\n' "$(date +"%Y-%m-%dT%H:%M:%S%z")" "$*"
}

BRANCH_LOCAL=${BRANCH_LOCAL:-"my-rustdesk-mesh-integration"}
BRANCH_REMOTE=${BRANCH_REMOTE:-"main"}
ALLOW_DIRTY_RESET=${ALLOW_DIRTY_RESET:-0}

log "Sincronizar a branch local '$BRANCH_LOCAL' com origin/$BRANCH_REMOTE (logs: $LOG_FILE)"
log "ALLOW_DIRTY_RESET=$ALLOW_DIRTY_RESET (exporta 1 para forçar reset hard mesmo com ficheiros em conflito/não commitados)"
BRANCH_LOCAL="$BRANCH_LOCAL" BRANCH_REMOTE="$BRANCH_REMOTE" ALLOW_DIRTY_RESET="$ALLOW_DIRTY_RESET" \
  "$ROOT_DIR/scripts/update_from_github.sh"
log "Repositório actualizado a partir de origin/$BRANCH_REMOTE para '$BRANCH_LOCAL'"
