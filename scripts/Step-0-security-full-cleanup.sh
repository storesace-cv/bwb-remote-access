#!/usr/bin/env sh
set -eu

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DROPLET_SSH_USER=${DROPLET_SSH_USER:-"root"}
DROPLET_SSH_HOST=${DROPLET_SSH_HOST:-"142.93.106.94"}
DROPLET_APP_DIR=${DROPLET_APP_DIR:-"/opt/rustdesk-frontend"}

log() {
  printf '[Step-0-security][%s] %s\n' "$(date +"%Y-%m-%dT%H:%M:%S%z")" "$*"
}

log "🔒 LIMPEZA COMPLETA DE SEGURANÇA (LOCAL + DROPLET)"
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# PHASE 1: Scan local code
log "FASE 1: Verificar código local..."
if bash "$ROOT_DIR/scripts/local-security-scan.sh"; then
  log "✅ Código local verificado e limpo"
else
  log "🚨 CÓDIGO LOCAL COMPROMETIDO!"
  read -p "Continuar mesmo assim? (yes/NO): " CONTINUE
  if [[ "$CONTINUE" != "yes" ]]; then
    log "Operação cancelada. Limpe o código primeiro."
    exit 1
  fi
fi

# PHASE 2: Clean local environment
log ""
log "FASE 2: Limpar ambiente local..."
cd "$ROOT_DIR"

log "2.1. A remover node_modules local..."
rm -rf node_modules || true

log "2.2. A remover .next build artifacts..."
rm -rf .next || true

log "2.3. A reinstalar dependências limpas..."
npm ci

log "✅ Ambiente local limpo e reconstruído"

# PHASE 3: Clean droplet
log ""
log "FASE 3: Limpar droplet remoto..."

log "3.1. A copiar script de limpeza para droplet..."
scp "$ROOT_DIR/scripts/droplet-security-cleanup.sh" "${DROPLET_SSH_USER}@${DROPLET_SSH_HOST}:/tmp/"

log "3.2. A executar limpeza no droplet..."
ssh "${DROPLET_SSH_USER}@${DROPLET_SSH_HOST}" "bash /tmp/droplet-security-cleanup.sh"

log "3.3. A remover script temporário..."
ssh "${DROPLET_SSH_USER}@${DROPLET_SSH_HOST}" "rm -f /tmp/droplet-security-cleanup.sh"

# PHASE 4: Verify cleanup
log ""
log "FASE 4: Verificar limpeza..."

log "4.1. Verificar processos no droplet..."
ssh "${DROPLET_SSH_USER}@${DROPLET_SSH_HOST}" "ps aux | grep -E '(node|next|npm)' | grep -v grep || echo 'Nenhum processo Node.js activo (OK)'"

log "4.2. Verificar estado do serviço..."
ssh "${DROPLET_SSH_USER}@${DROPLET_SSH_HOST}" "systemctl status rustdesk-frontend --no-pager || echo 'Serviço parado (esperado)'"

# Summary
log ""
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "✅ LIMPEZA COMPLETA CONCLUÍDA"
log ""
log "Ambiente local: LIMPO"
log "Droplet remoto: LIMPO"
log ""
log "Próximo passo recomendado:"
log "  ./scripts/Step-4-deploy-tested-build.sh"
log ""
log "Este deploy irá:"
log "  1. Enviar código limpo para o droplet"
log "  2. Reinstalar dependências (npm ci)"
log "  3. Reiniciar serviço de forma segura"
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"