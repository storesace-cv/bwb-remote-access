#!/usr/bin/env bash
set -euo pipefail

# Security cleanup script for droplet
# Removes malware, zombie processes, and suspicious files

log() {
  printf '[droplet-cleanup][%s] %s\n' "$(date +"%Y-%m-%dT%H:%M:%S%z")" "$*"
}

log "🔒 INICIANDO LIMPEZA DE SEGURANÇA DO DROPLET"

# 1. Stop all Next.js and Node processes
log "1. A parar todos os processos Node.js e Next.js..."
pkill -9 node || true
pkill -9 npm || true
pkill -9 next-server || true

# 2. Stop the systemd service
log "2. A parar serviço systemd..."
systemctl stop rustdesk-frontend || true

# 3. Remove suspicious executables and scripts
log "3. A remover ficheiros suspeitos..."
rm -f /tmp/x86 /tmp/*.sh /dev/fghgf /dev/stink.sh || true
find /tmp -type f -executable -name "x86*" -delete || true
find /tmp -type f -name "*.sh" -mtime -1 -delete || true

# 4. Clean up node_modules to remove potential compromised packages
log "4. A limpar node_modules no droplet..."
cd /opt/rustdesk-frontend || exit 1
rm -rf node_modules package-lock.json || true

# 5. Remove any suspicious cron jobs
log "5. A verificar cron jobs..."
crontab -l > /tmp/crontab.backup 2>/dev/null || true
crontab -r 2>/dev/null || true

# 6. Check for suspicious network connections
log "6. A verificar conexões suspeitas..."
netstat -tulpn | grep -E "(89.144|ESTABLISHED)" || true

# 7. Clean systemd journal to free space
log "7. A limpar journal logs antigos..."
journalctl --vacuum-time=1d || true

# 8. Remove any .next build artifacts (will be rebuilt on next deploy)
log "8. A limpar artefactos de build..."
rm -rf .next || true

# 9. Check running processes
log "9. Processos Node.js/Next.js restantes:"
ps aux | grep -E "(node|next|npm)" | grep -v grep || echo "Nenhum processo encontrado (OK)"

# 10. Verify service status
log "10. Estado do serviço:"
systemctl status rustdesk-frontend --no-pager || true

log "✅ LIMPEZA CONCLUÍDA - Droplet pronto para re-deploy seguro"
log "Próximo passo: Executar Step-4-deploy-tested-build.sh com código limpo"