#!/usr/bin/env bash
#
# Synchronize the local working branch with origin/main.
# The goal is to make the local branch an exact copy of origin/main without
# pushing any changes. Safe defaults protect uncommitted work unless
# explicitly overridden via ALLOW_DIRTY_RESET=1.

set -euo pipefail

BRANCH_LOCAL=${BRANCH_LOCAL:-"my-rustdesk-mesh-integration"}
BRANCH_REMOTE=${BRANCH_REMOTE:-"main"}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ALLOW_DIRTY_RESET=${ALLOW_DIRTY_RESET:-0}

log() {
  printf '[update_from_github][%s] %s\n' "$(date +"%Y-%m-%dT%H:%M:%S%z")" "$*"
}

cd "$REPO_DIR"
log "Repositório: $REPO_DIR"
log "Sincronizar '$BRANCH_LOCAL' a partir de 'origin/$BRANCH_REMOTE'"

if [[ -f .git/MERGE_HEAD || -d .git/rebase-apply || -d .git/rebase-merge ]]; then
  log "ERRO: existe um merge/rebase em curso. Resolve-o (git merge --abort / git rebase --abort) antes de sincronizar."
  exit 1
fi

if [[ "$ALLOW_DIRTY_RESET" != "1" ]]; then
  conflicting_files=$(git ls-files -u)
  if [[ -n "$conflicting_files" ]]; then
    log "ERRO: há ficheiros em estado de conflito. Exporta ALLOW_DIRTY_RESET=1 para forçar reset hard."
    exit 1
  fi
fi

if [[ "$ALLOW_DIRTY_RESET" != "1" ]]; then
  status_output=$(git status --porcelain)
  if [[ -n "$status_output" ]]; then
    log "ERRO: existem alterações não commitadas (inclui ficheiros não rastreados). Exporta ALLOW_DIRTY_RESET=1 para forçar reset hard."
    exit 1
  fi
fi

if ! git show-ref --verify --quiet "refs/remotes/origin/$BRANCH_REMOTE"; then
  log "ERRO: origin/$BRANCH_REMOTE não existe. Verifica o remoto antes de continuar."
  exit 1
fi

log "git fetch --prune origin"
git fetch --prune origin

if git show-ref --verify --quiet "refs/heads/$BRANCH_LOCAL"; then
  log "Checkout para $BRANCH_LOCAL"
  git checkout "$BRANCH_LOCAL"
else
  log "Criar branch $BRANCH_LOCAL a partir de origin/$BRANCH_REMOTE"
  git checkout -b "$BRANCH_LOCAL" "origin/$BRANCH_REMOTE"
fi

log "Reset hard para origin/$BRANCH_REMOTE"
git reset --hard "origin/$BRANCH_REMOTE"
log "Limpar ficheiros não rastreados (git clean -fd)"
git clean -fd
log "Branch '$BRANCH_LOCAL' agora espelha origin/$BRANCH_REMOTE."
