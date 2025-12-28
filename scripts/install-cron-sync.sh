#!/usr/bin/env bash
#
# Script para instalar cron job que sincroniza devices RustDesk -> Supabase
# a cada 30 segundos
#
# Versão: 2.0.0
# Data: 2025-12-13
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SYNC_SCRIPT="$SCRIPT_DIR/sync-devices.sh"

echo "=========================================="
echo "  Instalação de Cron Job - sync-devices"
echo "=========================================="
echo ""

# Verificar se sync-devices.sh existe
if [ ! -f "$SYNC_SCRIPT" ]; then
  echo "❌ ERRO: Script sync-devices.sh não encontrado em: $SYNC_SCRIPT"
  exit 1
fi

# Tornar executável
chmod +x "$SYNC_SCRIPT"
echo "✅ Script marcado como executável"

# Verificar se cron está instalado
if ! command -v crontab >/dev/null 2>&1; then
  echo "❌ ERRO: cron não está instalado!"
  echo ""
  echo "Para instalar:"
  echo "  Ubuntu/Debian: sudo apt-get install cron"
  echo "  CentOS/RHEL:   sudo yum install cronie"
  exit 1
fi

echo "✅ cron está instalado"
echo ""

# Criar entradas do cron (2 linhas para executar a cada 30 segundos)
CRON_ENTRY_1="* * * * * $SYNC_SCRIPT >> /var/log/rustdesk-sync.log 2>&1"
CRON_ENTRY_2="* * * * * sleep 30; $SYNC_SCRIPT >> /var/log/rustdesk-sync.log 2>&1"

# Verificar se já existe
if crontab -l 2>/dev/null | grep -F "$SYNC_SCRIPT" >/dev/null; then
  echo "⚠️  Cron job já existe! Deseja substituir? (s/N)"
  read -r response
  
  if [[ ! "$response" =~ ^[sS]$ ]]; then
    echo "❌ Instalação cancelada"
    exit 0
  fi
  
  # Remover entradas antigas
  crontab -l 2>/dev/null | grep -vF "$SYNC_SCRIPT" | crontab -
  echo "✅ Cron jobs antigos removidos"
fi

# Adicionar novos cron jobs
(crontab -l 2>/dev/null || true; echo "$CRON_ENTRY_1"; echo "$CRON_ENTRY_2") | crontab -

echo "✅ Cron job instalado com sucesso!"
echo ""
echo "📋 Configuração:"
echo "   Frequência: A cada 30 segundos"
echo "   Script:     $SYNC_SCRIPT"
echo "   Log:        /var/log/rustdesk-sync.log"
echo ""
echo "📝 Para visualizar logs em tempo real:"
echo "   tail -f /var/log/rustdesk-sync.log"
echo ""
echo "🔧 Para verificar cron jobs ativos:"
echo "   crontab -l"
echo ""
echo "🗑️  Para remover o cron job:"
echo "   crontab -e"
echo "   (e apagar as 2 linhas que contêm sync-devices.sh)"
echo ""
echo "✅ Instalação completa!"