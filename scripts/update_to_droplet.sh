#!/usr/bin/env bash
#
# Deploy do branch my-rustdesk-mesh-integration para o droplet.
# - Gera log local em ./logs/deploy/
# - Executa scripts/update_supabase.sh (pode ser ignorado com SKIP_SUPABASE=1)
# - Faz push do branch para origin
# - Actualiza código no droplet, faz build e reinicia o serviço
# - Recolhe o log remoto (/root/install-debug-<timestamp>.log)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BRANCH="my-rustdesk-mesh-integration"
REMOTE_USER=${REMOTE_USER:-"root"}
REMOTE_HOST=${REMOTE_HOST:-"46.101.78.179"}
REMOTE_DIR=${REMOTE_DIR:-"/opt/rustdesk-frontend"}
REMOTE_REPO_URL=${REMOTE_REPO_URL:-"$(git -C "$ROOT_DIR" config --get remote.origin.url || true)"}
SKIP_SUPABASE=${SKIP_SUPABASE:-0}
SKIP_DIRTY_CHECK=${SKIP_DIRTY_CHECK:-0}
TIMESTAMP="$(date +"%Y%m%d-%H%M%S")"
LOG_DIR="$ROOT_DIR/logs/deploy"
DROPLET_LOG_DIR="$ROOT_DIR/logs/droplet"
LOCAL_LOG="$LOG_DIR/deploy-$TIMESTAMP.log"
REMOTE_LOG="/root/install-debug-$TIMESTAMP.log"
DROPLET_LOG="$DROPLET_LOG_DIR/install-debug-$TIMESTAMP.log"

mkdir -p "$LOG_DIR" "$DROPLET_LOG_DIR"
exec > >(tee -a "$LOCAL_LOG") 2>&1

log() {
  printf '[update_to_droplet][%s] %s\n' "$(date +"%Y-%m-%dT%H:%M:%S%z")" "$*"
}

fail() {
  log "ERRO: $*"
  exit 1
}

log "Raiz do repositório: $ROOT_DIR"
log "Log local: $LOCAL_LOG"

[[ -n "$REMOTE_REPO_URL" ]] || fail "Não foi possível determinar REMOTE_REPO_URL (git remote origin). Define REMOTE_REPO_URL explicitamente."

ENV_FILE="${ENV_FILE:-"$ROOT_DIR/.env.local"}"
if [[ -f "$ENV_FILE" ]]; then
  log "A carregar variáveis de ambiente de $ENV_FILE"
  # shellcheck disable=SC1090
  set -a
  source "$ENV_FILE"
  set +a
else
  log "Nenhum ficheiro de ambiente encontrado em $ENV_FILE (a continuar sem carregar .env.local)"
fi

cd "$ROOT_DIR"

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[[ "$CURRENT_BRANCH" == "$BRANCH" ]] || fail "Branch actual é '$CURRENT_BRANCH'. Faz checkout para '$BRANCH' antes de deploy."

if [[ "$SKIP_DIRTY_CHECK" != "1" && -n "$(git status --porcelain)" ]]; then
  fail "Existem alterações não commitadas. Comita/descarta ou exporta SKIP_DIRTY_CHECK=1."
fi

if [[ "$SKIP_SUPABASE" != "1" ]]; then
  log "Executar scripts/update_supabase.sh"
  "$SCRIPT_DIR/update_supabase.sh"
else
  log "SKIP_SUPABASE=1 — a actualizar Supabase foi ignorado."
fi

log "git push origin $BRANCH"
git push origin "$BRANCH"

log "Iniciar deploy remoto para $REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR"
set +e
ssh "$REMOTE_USER@$REMOTE_HOST" "TIMESTAMP='$TIMESTAMP' BRANCH='$BRANCH' REMOTE_DIR='$REMOTE_DIR' REMOTE_REPO_URL='$REMOTE_REPO_URL' bash -s" <<'EOF'
set -euo pipefail
: "${TIMESTAMP:?}" "${BRANCH:?}" "${REMOTE_DIR:?}" "${REMOTE_REPO_URL:?}"
LOG_FILE="/root/install-debug-${TIMESTAMP}.log"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "[remote] Deploy iniciado. Log: $LOG_FILE"
if [[ ! -d "$REMOTE_DIR/.git" ]]; then
  echo "[remote] Repositório Git não encontrado em $REMOTE_DIR — preparar clone"
  mkdir -p "$(dirname "$REMOTE_DIR")"
  rm -rf "$REMOTE_DIR"
  echo "[remote] git clone $REMOTE_REPO_URL $REMOTE_DIR"
  git clone "$REMOTE_REPO_URL" "$REMOTE_DIR"
fi

cd "$REMOTE_DIR"

echo "[remote] git fetch --prune origin"
git fetch --prune origin

echo "[remote] git checkout $BRANCH"
git checkout "$BRANCH"

echo "[remote] git reset --hard origin/$BRANCH"
git reset --hard "origin/$BRANCH"

echo "[remote] npm ci --prefer-offline --no-audit --no-fund"
npm ci --prefer-offline --no-audit --no-fund

echo "[remote] npm run build"
npm run build

echo "[remote] systemctl restart rustdesk-frontend.service"
systemctl restart rustdesk-frontend.service

echo "[remote] systemctl status rustdesk-frontend.service --no-pager"
systemctl status rustdesk-frontend.service --no-pager

echo "[remote] curl -fsS -I http://127.0.0.1:3000"
curl -fsS -I http://127.0.0.1:3000

echo "[remote] Deploy concluído. Log em $LOG_FILE"
EOF
SSH_STATUS=$?
set -e

if [[ $SSH_STATUS -ne 0 ]]; then
  log "Deploy remoto falhou (código $SSH_STATUS). A recolher log remoto se existir."
else
  log "Deploy remoto concluído."
fi

set +e
scp "$REMOTE_USER@$REMOTE_HOST:$REMOTE_LOG" "$DROPLET_LOG"
SCP_STATUS=$?
set -e

if [[ $SCP_STATUS -ne 0 ]]; then
  log "Não foi possível copiar o log remoto de $REMOTE_LOG (código $SCP_STATUS)."
fi

if [[ $SSH_STATUS -ne 0 ]]; then
  fail "Deploy remoto falhou. Verifica $LOCAL_LOG e o log remoto em $REMOTE_LOG."
fi

if [[ $SCP_STATUS -eq 0 ]]; then
  log "Log remoto copiado para $DROPLET_LOG"
fi

log "Deploy concluído com sucesso. Log remoto: $REMOTE_LOG (cópia local em $DROPLET_LOG) | Log local: $LOCAL_LOG"
