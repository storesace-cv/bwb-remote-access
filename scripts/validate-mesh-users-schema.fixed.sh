#!/usr/bin/env bash
#
# Valida se a tabela mesh_users tem o schema correcto para o sync MeshCentral → Supabase
#
# Uso: bash scripts/validate-mesh-users-schema.sh
#
set -euo pipefail

ENV_FILE="${ENV_FILE:-/opt/rustdesk-frontend/.env.local}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "════════════════════════════════════════════════════════════"
echo "  Validação de Schema: mesh_users"
echo "════════════════════════════════════════════════════════════"
echo ""

# Carregar variáveis de ambiente
if [ ! -f "$ENV_FILE" ]; then
  echo -e "${RED}ERRO: .env.local não encontrado em $ENV_FILE${NC}"
  exit 1
fi

set -a
source "$ENV_FILE" 2>/dev/null || true
set +a

# Extrair SUPABASE_URL
if [ -z "${SUPABASE_URL:-}" ] && [ -n "${NEXT_PUBLIC_SUPABASE_URL:-}" ]; then
  SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL"
fi

if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo -e "${RED}ERRO: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios${NC}"
  exit 1
fi

REST_URL="${SUPABASE_URL%/}/rest/v1"

echo "Testando conectividade com Supabase..."
RESPONSE=$(curl -sS -w "\n%{http_code}" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  "${REST_URL}/mesh_users?limit=1" 2>&1 || echo -e "\n000")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" != "200" ]; then
  echo -e "${RED}✗ Erro de conectividade (HTTP $HTTP_CODE)${NC}"
  echo "Resposta: $BODY"
  exit 1
fi

echo -e "${GREEN}✓ Conectividade OK${NC}"
echo ""

# Extrair colunas do primeiro registo - COM DEBUG DETALHADO
echo "Extraindo colunas da resposta JSON..."

if [ "${DEBUG:-0}" = "1" ]; then
  echo "DEBUG: Resposta HTTP completa (primeiros 500 chars):"
  echo "${BODY:0:500}"
  echo ""
fi

# Primeiro: verificar se temos JSON válido
if ! echo "$BODY" | jq empty 2>/dev/null; then
  echo -e "${RED}✗ Resposta não é JSON válido${NC}"
  exit 1
fi

# Segundo: verificar se temos pelo menos um registo
RECORD_COUNT=$(echo "$BODY" | jq 'length' 2>/dev/null || echo "0")
if [ "$RECORD_COUNT" -eq 0 ]; then
  echo -e "${RED}✗ Tabela mesh_users está vazia (sem registos)${NC}"
  exit 1
fi

if [ "${DEBUG:-0}" = "1" ]; then
  echo "DEBUG: Número de registos: $RECORD_COUNT"
  echo ""
fi

# Terceiro: extrair as keys do primeiro registo
COLS_LIST=$(echo "$BODY" | jq -r '.[0] | keys | sort | .[]' 2>/dev/null)

if [ -z "$COLS_LIST" ]; then
  echo -e "${RED}✗ Não foi possível extrair colunas do JSON${NC}"
  echo "DEBUG: Output de jq: '$COLS_LIST'"
  exit 1
fi

if [ "${DEBUG:-0}" = "1" ]; then
  echo "DEBUG: Variável COLS_LIST (via od -c):"
  echo "$COLS_LIST" | od -c | head -30
  echo ""
  echo "DEBUG: Variável COLS_LIST (linhas numeradas):"
  echo "$COLS_LIST" | nl
  echo ""
fi

echo "Colunas actuais na tabela mesh_users:"
echo "$COLS_LIST" | sed 's/^/  - /'
echo ""

# Colunas obrigatórias para o sync funcionar
REQUIRED_COLUMNS=(
  "id"
  "mesh_username"
  "auth_user_id"
  "external_user_id"
  "domain_key"
  "domain"
  "domain_dns"
  "email"
  "name"
  "display_name"
  "disabled"
  "siteadmin"
  "domainadmin"
  "role"
  "source"
  "created_at"
  "deleted_at"
)

echo "Verificando colunas obrigatórias..."
MISSING_COLUMNS=()

for col in "${REQUIRED_COLUMNS[@]}"; do
  # Usar grep com linha exacta
  if echo "$COLS_LIST" | grep -Fxq "$col"; then
    echo -e "  ${GREEN}✓${NC} $col"
  else
    echo -e "  ${RED}✗${NC} $col ${YELLOW}(FALTA)${NC}"
    MISSING_COLUMNS+=("$col")
    
    if [ "${DEBUG:-0}" = "1" ]; then
      echo "    DEBUG: grep -Fx '$col' não encontrou match"
      echo "    DEBUG: Procurando com grep normal..."
      echo "$COLS_LIST" | grep -F "$col" || echo "    -> Nada encontrado com grep normal"
    fi
  fi
done

echo ""

if [ ${#MISSING_COLUMNS[@]} -gt 0 ]; then
  echo -e "${RED}════════════════════════════════════════════════════════════${NC}"
  echo -e "${RED}  SCHEMA INCOMPLETO - SYNC VAI FALHAR${NC}"
  echo -e "${RED}════════════════════════════════════════════════════════════${NC}"
  echo ""
  echo "Colunas em falta: ${MISSING_COLUMNS[*]}"
  echo ""
  echo "SOLUÇÃO:"
  echo ""
  echo "1. Aplicar migração SQL no Supabase SQL Editor:"
  echo ""
  echo "   Acede a: https://supabase.com/dashboard/project/<ref>/sql/new"
  echo ""
  echo "2. Copia e executa o SQL de:"
  echo "   supabase/migrations/20251219040000_migration_mesh_users_multidomain.sql"
  echo ""
  echo "3. OU via Supabase CLI:"
  echo "   supabase db push"
  echo ""
  echo "4. Após aplicar a migração, corre novamente este script para validar."
  echo ""
  exit 1
else
  echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}  ✓ SCHEMA VÁLIDO - SYNC PODE SER EXECUTADO${NC}"
  echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
  echo ""
  echo "Próximos passos:"
  echo ""
  echo "1. Executar sync manual:"
  echo "   bash /opt/rustdesk-frontend/scripts/sync-meshcentral-to-supabase.sh"
  echo ""
  echo "2. Ou activar o timer systemd:"
  echo "   systemctl start meshcentral-supabase-sync.timer"
  echo ""
  exit 0
fi