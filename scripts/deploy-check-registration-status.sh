#!/usr/bin/env bash
#
# Deploy da Edge Function check-registration-status para Supabase
#
# Versão: 1.0.0
# Data: 2025-12-13
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

echo "=========================================="
echo "  Deploy: check-registration-status"
echo "=========================================="
echo ""

# Verificar se supabase CLI está instalado
if ! command -v supabase >/dev/null 2>&1; then
  echo "❌ ERRO: Supabase CLI não está instalado!"
  echo ""
  echo "Para instalar:"
  echo "  npm install -g supabase"
  echo "  # ou"
  echo "  brew install supabase/tap/supabase"
  exit 1
fi

echo "✅ Supabase CLI encontrado"
echo ""

# Verificar se está linkado a um projeto
if ! supabase status >/dev/null 2>&1; then
  echo "⚠️  Projeto Supabase não está linkado"
  echo ""
  echo "Para linkar:"
  echo "  supabase link --project-ref kqwaibgvmzcqeoctukoy"
  echo ""
  read -p "Deseja linkar agora? (s/N): " -r LINK_NOW
  
  if [[ $LINK_NOW =~ ^[sS]$ ]]; then
    supabase link --project-ref kqwaibgvmzcqeoctukoy
  else
    echo "Deploy cancelado"
    exit 1
  fi
fi

echo "✅ Projeto linkado"
echo ""

# Deploy da Edge Function
echo "📦 Fazendo deploy de check-registration-status..."
supabase functions deploy check-registration-status --no-verify-jwt

if [ $? -eq 0 ]; then
  echo ""
  echo "=========================================="
  echo "  ✅ DEPLOY CONCLUÍDO COM SUCESSO!"
  echo "=========================================="
  echo ""
  echo "📋 Próximos passos:"
  echo ""
  echo "1. Verificar no Supabase Dashboard:"
  echo "   https://supabase.com/dashboard/project/kqwaibgvmzcqeoctukoy/functions/check-registration-status"
  echo ""
  echo "2. Testar a função:"
  echo "   - Abrir a aplicação web"
  echo "   - Clicar em 'Adicionar Dispositivo'"
  echo "   - Escanear QR code no Android"
  echo "   - Clicar em 'Verificar Dispositivo'"
  echo ""
else
  echo ""
  echo "❌ ERRO ao fazer deploy!"
  echo ""
  echo "Possíveis soluções:"
  echo "  - Verificar credenciais: supabase login"
  echo "  - Verificar link: supabase status"
  echo "  - Ver logs: supabase functions logs check-registration-status"
  exit 1
fi