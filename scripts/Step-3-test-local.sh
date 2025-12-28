#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT_DIR/logs/local"
TIMESTAMP="$(date +"%Y%m%d-%H%M%S")"
LOG_FILE="$LOG_DIR/Step-3-test-local-$TIMESTAMP.log"

mkdir -p "$LOG_DIR"
exec > >(tee -a "$LOG_FILE") 2>&1

log() {
  printf '[Step-3][%s] %s\n' "$(date +"%Y-%m-%dT%H:%M:%S%z")" "$*"
}

cd "$ROOT_DIR"

echo "╔════════════════════════════════════════════════════════════╗"
echo "║           Step 3: Testes e Validação Local                 ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
log "Iniciar testes e lint (logs: $LOG_FILE)"
echo ""

# ---------------------------------------------------------
# 1. ESLint - Análise estática de código
# ---------------------------------------------------------
echo "🔍 [1/3] A executar ESLint..."
log "npm run lint"

if npm run lint; then
  log "✅ ESLint passou sem erros"
else
  log "❌ ESLint encontrou problemas"
  echo ""
  echo "⚠️  ESLint falhou. Reveja os erros acima antes de prosseguir."
  exit 1
fi

echo ""

# ---------------------------------------------------------
# 2. Jest - Testes unitários
# ---------------------------------------------------------
echo "🧪 [2/3] A executar testes unitários (Jest)..."
log "npm test"

if npm test; then
  log "✅ Testes unitários passaram"
else
  log "❌ Testes unitários falharam"
  echo ""
  echo "⚠️  Testes falharam. Reveja os erros acima antes de prosseguir."
  exit 1
fi

echo ""

# ---------------------------------------------------------
# 3. TypeScript - Verificação de tipos
# ---------------------------------------------------------
echo "📐 [3/3] A verificar tipos TypeScript..."
log "npx tsc --noEmit"

if npx tsc --noEmit; then
  log "✅ TypeScript: sem erros de tipos"
else
  log "❌ TypeScript: erros de tipos encontrados"
  echo ""
  echo "⚠️  TypeScript encontrou erros de tipos. Reveja os erros acima antes de prosseguir."
  exit 1
fi

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║           Testes Concluídos com Sucesso!                   ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
log "✅ Todas as validações passaram:"
log "   ✓ ESLint (análise de código)"
log "   ✓ Jest (testes unitários)"
log "   ✓ TypeScript (verificação de tipos)"
echo ""

echo "🔎 A analisar se existem alterações em Supabase Edge Functions (supabase/functions/**)..."

HAS_SUPABASE_EDGE_CHANGES=0

if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  WT_COUNT="$(git status --porcelain -- supabase/functions 2>/dev/null | wc -l | tr -d ' ')"

  if UPSTREAM_REF="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null)"; then
    UPSTREAM_COUNT="$(git diff --name-only "$UPSTREAM_REF"...HEAD -- supabase/functions 2>/dev/null | wc -l | tr -d ' ')"
  else
    UPSTREAM_COUNT="0"
  fi

  TOTAL_EDGE_CHANGED=$((WT_COUNT + UPSTREAM_COUNT))

  if [[ "$TOTAL_EDGE_CHANGED" -gt 0 ]]; then
    HAS_SUPABASE_EDGE_CHANGES=1
    echo "➡️ Foram detetadas alterações em supabase/functions/** (working tree e/ou em relação ao upstream $UPSTREAM_REF)."
  else
    echo "ℹ️ Não foram detetadas alterações em supabase/functions/**."
  fi
else
  echo "ℹ️ Git não está disponível ou este diretório não é um repositório Git."
  echo "   Não é possível detetar automaticamente alterações em supabase/functions/**."
fi

echo ""
echo "📋 Próximo passo:"

if [[ "$HAS_SUPABASE_EDGE_CHANGES" -eq 1 ]]; then
  echo "   Foram encontradas alterações em Supabase Edge Functions."
  echo "   Recomenda-se correr o Step-4 incluindo o deploy das Edge Functions:"
  echo ""
  echo "     export RUN_SUPABASE_EDGE_DEPLOY=1"
  echo "     # opcional: escolher script de deploy de Edge Functions (por omissão: scripts/supabase-deploy-functions.sh)"
  echo "     # export SUPABASE_EDGE_SCRIPT=\"scripts/deploy-edge-functions.sh\""
  echo "     ./scripts/Step-4-deploy-tested-build.sh"
  echo ""
  echo "   Se quiseres rever manualmente as alterações em supabase/functions/** antes do deploy:"
  echo "     git status -- supabase/functions"
  echo "     git diff -- supabase/functions"
else
  echo "   Em princípio, podes correr o Step-4 sem deploy automático das Edge Functions:"
  echo ""
  echo "     ./scripts/Step-4-deploy-tested-build.sh"
  echo ""
  echo "   Se, ainda assim, quiseres forçar o deploy das Edge Functions, usa:"
  echo ""
  echo "     export RUN_SUPABASE_EDGE_DEPLOY=1"
  echo "     ./scripts/Step-4-deploy-tested-build.sh"
fi

echo ""
