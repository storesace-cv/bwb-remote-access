#!/usr/bin/env bash
#
# Setup rápido e minimalista do droplet para sync de devices
#
set -euo pipefail

DROPLET_USER="${DROPLET_USER:-root}"
DROPLET_HOST="${DROPLET_HOST:-46.101.78.179}"
DROPLET_DIR="/opt/rustdesk-integration"

echo "🚀 Quick Setup - Droplet Sync Infrastructure"
echo "============================================="
echo ""
echo "📍 Target: $DROPLET_USER@$DROPLET_HOST"
echo "📁 Directory: $DROPLET_DIR"
echo ""

# 1. Criar estrutura de diretórios no droplet
echo "1️⃣  Criando estrutura de diretórios..."
ssh "$DROPLET_USER@$DROPLET_HOST" << 'ENDSSH'
set -e

# Criar diretórios necessários
mkdir -p /opt/rustdesk-integration/{scripts,logs}

# Verificar
echo "   ✓ Diretórios criados:"
ls -la /opt/rustdesk-integration/
ENDSSH

echo ""

# 2. Verificar se sync-devices.sh existe localmente
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SYNC_SCRIPT="$SCRIPT_DIR/sync-devices.sh"

if [[ ! -f "$SYNC_SCRIPT" ]]; then
  echo "❌ ERRO: sync-devices.sh não encontrado em: $SYNC_SCRIPT"
  exit 1
fi

echo "2️⃣  Upload do sync-devices.sh..."
rsync -avz "$SYNC_SCRIPT" "$DROPLET_USER@$DROPLET_HOST:$DROPLET_DIR/scripts/"
echo "   ✓ Script uploaded"
echo ""

# 3. Ajustar permissões
echo "3️⃣  Ajustando permissões..."
ssh "$DROPLET_USER@$DROPLET_HOST" "chmod +x $DROPLET_DIR/scripts/sync-devices.sh"
echo "   ✓ Permissões configuradas"
echo ""

# 4. Criar arquivo de configuração (se não existe)
echo "4️⃣  Verificando configuração..."
ssh "$DROPLET_USER@$DROPLET_HOST" << 'ENDSSH'
CONFIG_FILE="/opt/meshcentral/meshcentral-data/sync-env.sh"

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "   ⚠️  Arquivo de configuração não existe"
  echo "   Criando template em: $CONFIG_FILE"
  
  mkdir -p /opt/meshcentral/meshcentral-data
  
  cat > "$CONFIG_FILE" << 'EOF'
#!/bin/bash
# Configuração para sync-devices.sh
export SUPABASE_URL="https://kqwaibgvmzcqeoctukoy.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY_HERE"
export SUPABASE_ANON_KEY="YOUR_ANON_KEY_HERE"
export SYNC_JWT="YOUR_SERVICE_ROLE_KEY_HERE"
EOF

  chmod 600 "$CONFIG_FILE"
  echo "   ⚠️  ATENÇÃO: Edite $CONFIG_FILE com suas chaves reais!"
else
  echo "   ✓ Arquivo de configuração existe"
fi
ENDSSH

echo ""

# 5. Testar se configuração está válida
echo "5️⃣  Testando configuração..."
ssh "$DROPLET_USER@$DROPLET_HOST" << 'ENDSSH'
CONFIG_FILE="/opt/meshcentral/meshcentral-data/sync-env.sh"

if [[ -f "$CONFIG_FILE" ]]; then
  # shellcheck disable=SC1091
  source "$CONFIG_FILE"
  
  if [[ "${SUPABASE_URL}" == *"YOUR_"* ]] || [[ -z "${SUPABASE_SERVICE_ROLE_KEY}" ]]; then
    echo "   ⚠️  Configuração não está completa (tem valores placeholder)"
    echo "   Por favor, edite: $CONFIG_FILE"
    exit 1
  else
    echo "   ✓ Configuração válida"
  fi
fi
ENDSSH

CONFIG_VALID=$?
echo ""

# 6. Configurar cron job (se configuração válida)
if [[ $CONFIG_VALID -eq 0 ]]; then
  echo "6️⃣  Configurando cron job..."
  ssh "$DROPLET_USER@$DROPLET_HOST" << 'ENDSSH'
  CRON_JOB="* * * * * /opt/rustdesk-integration/scripts/sync-devices.sh >> /opt/rustdesk-integration/logs/sync.log 2>&1"
  
  # Verificar se já existe
  if crontab -l 2>/dev/null | grep -F "sync-devices.sh" >/dev/null; then
    echo "   ℹ️  Cron job já existe"
  else
    # Adicionar
    (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
    echo "   ✓ Cron job adicionado (roda a cada 1 minuto)"
  fi
  
  # Mostrar crontab atual
  echo ""
  echo "   Crontab atual:"
  crontab -l | grep -F "sync-devices.sh" || echo "   (nenhum)"
ENDSSH
  
  echo ""
  
  # 7. Rodar primeiro sync
  echo "7️⃣  Executando primeiro sync..."
  ssh "$DROPLET_USER@$DROPLET_HOST" << 'ENDSSH'
  cd /opt/rustdesk-integration
  ./scripts/sync-devices.sh 2>&1 | tee logs/sync-initial-$(date +%Y%m%d-%H%M%S).log
ENDSSH
  
  echo ""
  echo "✅ Setup completo!"
  echo ""
  echo "📋 Próximos passos:"
  echo "   1. Verificar logs: ssh $DROPLET_USER@$DROPLET_HOST 'tail -f /opt/rustdesk-integration/logs/sync.log'"
  echo "   2. Verificar device no Supabase:"
  echo "      SELECT * FROM android_devices WHERE device_id = '1209508958';"
  echo "   3. Refresh no dashboard para ver device em 'Por Adotar'"
  
else
  echo "⚠️  Setup parcial completo!"
  echo ""
  echo "📋 Para completar:"
  echo "   1. SSH no droplet: ssh $DROPLET_USER@$DROPLET_HOST"
  echo "   2. Editar configuração: nano /opt/meshcentral/meshcentral-data/sync-env.sh"
  echo "   3. Adicionar suas chaves do Supabase"
  echo "   4. Rodar este script novamente"
fi

echo ""