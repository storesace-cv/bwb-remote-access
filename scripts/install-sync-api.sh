#!/usr/bin/env bash
#
# Script de instalação da Sync API
#
# Versão: 1.0.0
# Data: 2025-12-12
#
set -euo pipefail

echo "=========================================="
echo "  Instalação da RustDesk Sync API"
echo "=========================================="
echo ""

# Verificar se está rodando como root
if [ "$EUID" -ne 0 ]; then
  echo "❌ Este script precisa ser executado como root (sudo)"
  exit 1
fi

# Paths
REPO_ROOT="/opt/rustdesk-frontend"
SERVER_DIR="$REPO_ROOT/server"
SERVICE_FILE="/etc/systemd/system/rustdesk-sync-api.service"
ENV_FILE="$SERVER_DIR/.env"

# Verificar se diretório existe
if [ ! -d "$SERVER_DIR" ]; then
  echo "❌ Diretório não encontrado: $SERVER_DIR"
  exit 1
fi

# Instalar dependências Node.js
echo "📦 Instalando dependências Node.js..."
cd "$SERVER_DIR"
npm install --production
echo "✅ Dependências instaladas"
echo ""

# Gerar token secreto se não existir
if [ ! -f "$ENV_FILE" ]; then
  echo "🔐 Gerando token secreto..."
  SECRET=$(openssl rand -hex 32)
  
  cat > "$ENV_FILE" <<EOF
# RustDesk Sync API Configuration
SYNC_API_PORT=3001
SYNC_API_SECRET=$SECRET
EOF
  
  chmod 600 "$ENV_FILE"
  echo "✅ Token gerado e salvo em: $ENV_FILE"
  echo ""
else
  echo "✅ Arquivo .env já existe"
  echo ""
fi

# Ler token para mostrar ao usuário
if [ -f "$ENV_FILE" ]; then
  source "$ENV_FILE"
  echo "📋 Token de API: $SYNC_API_SECRET"
  echo "   (Você precisará adicionar este token ao Supabase Edge Function)"
  echo ""
fi

# Instalar systemd service
echo "🔧 Instalando serviço systemd..."
cp "$REPO_ROOT/scripts/rustdesk-sync-api.service" "$SERVICE_FILE"
systemctl daemon-reload
echo "✅ Serviço instalado"
echo ""

# Iniciar serviço
echo "🚀 Iniciando serviço..."
systemctl enable rustdesk-sync-api
systemctl restart rustdesk-sync-api
echo "✅ Serviço iniciado"
echo ""

# Verificar status
echo "📊 Status do serviço:"
systemctl status rustdesk-sync-api --no-pager -l
echo ""

# Testar API
echo "🧪 Testando API..."
sleep 2

if [ -n "${SYNC_API_SECRET:-}" ]; then
  TEST_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $SYNC_API_SECRET" \
    -X POST http://127.0.0.1:3001/sync)
  
  if [ "$TEST_RESPONSE" = "200" ]; then
    echo "✅ API está funcionando corretamente!"
  else
    echo "⚠️  API retornou código: $TEST_RESPONSE"
    echo "   Verifique os logs: journalctl -u rustdesk-sync-api -n 50"
  fi
else
  echo "⚠️  Token não encontrado, pulando teste"
fi

echo ""
echo "=========================================="
echo "  ✅ INSTALAÇÃO COMPLETA!"
echo "=========================================="
echo ""
echo "📋 PRÓXIMOS PASSOS:"
echo ""
echo "1. Adicionar o token ao Supabase:"
echo "   - Acesse: Supabase Dashboard > Edge Functions > Secrets"
echo "   - Nome: SYNC_API_SECRET"
echo "   - Valor: $SYNC_API_SECRET"
echo ""
echo "2. Comandos úteis:"
echo "   - Ver logs:      journalctl -u rustdesk-sync-api -f"
echo "   - Reiniciar:     systemctl restart rustdesk-sync-api"
echo "   - Parar:         systemctl stop rustdesk-sync-api"
echo "   - Status:        systemctl status rustdesk-sync-api"
echo ""
echo "3. Testar manualmente:"
echo "   curl -X POST http://127.0.0.1:3001/sync \\"
echo "     -H 'Authorization: Bearer $SYNC_API_SECRET'"
echo ""