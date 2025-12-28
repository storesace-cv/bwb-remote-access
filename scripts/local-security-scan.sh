#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

log() {
  printf '[security-scan][%s] %s\n' "$(date +"%Y-%m-%dT%H:%M:%S%z")" "$*"
}

SUSPICIOUS_FOUND=0

log "🔍 INICIANDO VERIFICAÇÃO DE SEGURANÇA DO CÓDIGO LOCAL"

# 1. Check for suspicious IP addresses
log "1. A verificar IPs suspeitos..."
if grep -r "89.144.31.18" --exclude-dir={node_modules,.next,local-logs,logs,.git} . 2>/dev/null; then
  log "⚠️  ALERTA: IP suspeito encontrado!"
  SUSPICIOUS_FOUND=1
else
  log "✅ Nenhum IP suspeito encontrado"
fi

# 2. Check for suspicious executables
log "2. A verificar executáveis suspeitos (x86, etc.)..."
if find . -type f -name "x86" -o -name "x86_64" | grep -v node_modules | grep -v .git; then
  log "⚠️  ALERTA: Executável suspeito encontrado!"
  SUSPICIOUS_FOUND=1
else
  log "✅ Nenhum executável suspeito encontrado"
fi

# 3. Check for suspicious scripts
log "3. A verificar scripts suspeitos..."
if grep -r "fghgf\|stink" --exclude-dir={node_modules,.next,local-logs,logs,.git} . 2>/dev/null; then
  log "⚠️  ALERTA: Script suspeito encontrado!"
  SUSPICIOUS_FOUND=1
else
  log "✅ Nenhum script suspeito encontrado"
fi

# 4. Check for suspicious network calls
log "4. A verificar chamadas de rede suspeitas..."
if grep -r "wget\|curl.*http" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --exclude-dir={node_modules,.next,local-logs,logs,.git} . 2>/dev/null | grep -v "fetch\|axios\|supabase"; then
  log "⚠️  ALERTA: Chamadas de rede suspeitas encontradas!"
  SUSPICIOUS_FOUND=1
else
  log "✅ Nenhuma chamada de rede suspeita encontrada"
fi

# 5. Check instrumentation.ts (common injection point)
log "5. A verificar src/instrumentation.ts..."
if [[ -f "src/instrumentation.ts" ]]; then
  if grep -E "(wget|curl|exec|spawn|child_process)" "src/instrumentation.ts"; then
    log "⚠️  ALERTA: Código suspeito em instrumentation.ts!"
    SUSPICIOUS_FOUND=1
  else
    log "✅ instrumentation.ts limpo"
  fi
else
  log "ℹ️  instrumentation.ts não existe"
fi

# 6. Check package.json for suspicious scripts
log "6. A verificar package.json..."
if grep -E "(postinstall|preinstall)" package.json | grep -v "#"; then
  log "⚠️  Atenção: Scripts de install encontrados (verificar manualmente)"
  cat package.json | grep -A 2 -E "(postinstall|preinstall)"
fi

# 7. Verify node_modules integrity (check for recently modified files)
log "7. A verificar node_modules..."
if [[ -d "node_modules" ]]; then
  RECENT_FILES=$(find node_modules -type f -mtime -1 2>/dev/null | wc -l)
  log "Ficheiros modificados nas últimas 24h em node_modules: $RECENT_FILES"
  if [[ $RECENT_FILES -gt 100 ]]; then
    log "⚠️  Muitas modificações recentes. Considerar rm -rf node_modules && npm ci"
  fi
fi

# 8. Summary
echo ""
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [[ $SUSPICIOUS_FOUND -eq 0 ]]; then
  log "✅ CÓDIGO LOCAL LIMPO - Nenhuma ameaça detectada"
  log "Seguro para deploy ao droplet"
else
  log "🚨 CÓDIGO COMPROMETIDO - MALWARE DETECTADO!"
  log "NÃO FAZER DEPLOY ATÉ LIMPAR O CÓDIGO!"
fi
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

exit $SUSPICIOUS_FOUND