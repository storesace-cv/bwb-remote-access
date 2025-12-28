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

# ESLint: warnings do NOT fail the build, only errors do
# The eslint config uses "warn" for stylistic rules
set +e
npm run lint
ESLINT_STATUS=$?
set -e

if [[ $ESLINT_STATUS -eq 0 ]]; then
  log "✅ ESLint passou (sem erros)"
elif [[ $ESLINT_STATUS -eq 1 ]]; then
  # Exit code 1 = linting errors found
  log "❌ ESLint encontrou ERROS (não apenas warnings)"
  echo ""
  echo "⚠️  ESLint falhou com erros. Reveja os erros acima antes de prosseguir."
  exit 1
else
  # Exit code 2 = config/runtime error
  log "❌ ESLint falhou com erro de configuração (exit code $ESLINT_STATUS)"
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

# =============================================================================
# SUPABASE DEPLOY GATE
# =============================================================================
# Detects changes in supabase/functions/** and supabase/migrations/**
# and warns the user about required manual deploys.
# =============================================================================

echo "════════════════════════════════════════════════════════════"
echo "🔍 SUPABASE DEPLOY GATE - Verificação de alterações"
echo "════════════════════════════════════════════════════════════"
echo ""

SUPABASE_PROJECT_REF="${SUPABASE_PROJECT_REF:-kqwaibgvmzcqeoctukoy}"
HAS_EDGE_CHANGES=0
HAS_MIGRATION_CHANGES=0

# Function to detect changes in a path
detect_changes() {
  local path="$1"
  local change_count=0

  if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    # Check working tree (uncommitted changes)
    local wt_count
    wt_count="$(git status --porcelain -- "$path" 2>/dev/null | wc -l | tr -d ' ')"
    
    # Check against upstream (if available)
    local upstream_count=0
    if UPSTREAM_REF="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null)"; then
      upstream_count="$(git diff --name-only "$UPSTREAM_REF"...HEAD -- "$path" 2>/dev/null | wc -l | tr -d ' ')"
    fi

    # Check against last tag or recent commits (fallback for local-only branches)
    local recent_count=0
    if [[ -f "$ROOT_DIR/.last-deploy-commit" ]]; then
      local last_deploy_commit
      last_deploy_commit="$(cat "$ROOT_DIR/.last-deploy-commit")"
      if git rev-parse "$last_deploy_commit" >/dev/null 2>&1; then
        recent_count="$(git diff --name-only "$last_deploy_commit"...HEAD -- "$path" 2>/dev/null | wc -l | tr -d ' ')"
      fi
    fi

    change_count=$((wt_count + upstream_count + recent_count))
  fi

  echo "$change_count"
}

# Detect Edge Function changes
EDGE_CHANGES=$(detect_changes "supabase/functions")
if [[ "$EDGE_CHANGES" -gt 0 ]]; then
  HAS_EDGE_CHANGES=1
fi

# Detect Migration changes
MIGRATION_CHANGES=$(detect_changes "supabase/migrations")
if [[ "$MIGRATION_CHANGES" -gt 0 ]]; then
  HAS_MIGRATION_CHANGES=1
fi

# Report Edge Function changes
if [[ "$HAS_EDGE_CHANGES" -eq 1 ]]; then
  echo "┌────────────────────────────────────────────────────────────┐"
  echo "│ ⚠️  ATENÇÃO: Alterações em Supabase Edge Functions         │"
  echo "└────────────────────────────────────────────────────────────┘"
  echo ""
  echo "Foram detetadas alterações em supabase/functions/**"
  echo ""
  echo "📋 AÇÃO REQUERIDA: Deploy das Edge Functions"
  echo ""
  echo "   Comando manual (recomendado):"
  echo "   ┌─────────────────────────────────────────────────────────┐"
  echo "   │ supabase functions deploy --project-ref $SUPABASE_PROJECT_REF │"
  echo "   └─────────────────────────────────────────────────────────┘"
  echo ""
  echo "   Ou usa o script incluído:"
  echo "   ┌─────────────────────────────────────────────────────────┐"
  echo "   │ ./scripts/supabase-deploy-functions.sh                  │"
  echo "   └─────────────────────────────────────────────────────────┘"
  echo ""
  echo "   Para deploy automático no Step-4, define:"
  echo "   ┌─────────────────────────────────────────────────────────┐"
  echo "   │ export RUN_SUPABASE_EDGE_DEPLOY=1                       │"
  echo "   │ ./scripts/Step-4-deploy-tested-build.sh                 │"
  echo "   └─────────────────────────────────────────────────────────┘"
  echo ""
else
  echo "✅ Sem alterações em supabase/functions/**"
fi

echo ""

# Report Migration changes
if [[ "$HAS_MIGRATION_CHANGES" -eq 1 ]]; then
  echo "┌────────────────────────────────────────────────────────────┐"
  echo "│ ⚠️  ATENÇÃO: Alterações em Supabase Migrations             │"
  echo "└────────────────────────────────────────────────────────────┘"
  echo ""
  echo "Foram detetadas alterações em supabase/migrations/**"
  echo ""
  echo "📋 AÇÃO REQUERIDA: Aplicar migrações à base de dados"
  echo ""
  echo "   ⚠️  CUIDADO: Migrações podem ser DESTRUTIVAS."
  echo "   Revê os ficheiros SQL antes de aplicar!"
  echo ""
  echo "   Para listar migrações pendentes:"
  echo "   ┌─────────────────────────────────────────────────────────┐"
  echo "   │ supabase db diff --project-ref $SUPABASE_PROJECT_REF   │"
  echo "   └─────────────────────────────────────────────────────────┘"
  echo ""
  echo "   Para aplicar migrações (após revisão):"
  echo "   ┌─────────────────────────────────────────────────────────┐"
  echo "   │ supabase db push --project-ref $SUPABASE_PROJECT_REF   │"
  echo "   └─────────────────────────────────────────────────────────┘"
  echo ""
  echo "   🚫 Migrações NÃO são aplicadas automaticamente."
  echo ""
else
  echo "✅ Sem alterações em supabase/migrations/**"
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo ""

# Summary and next steps
echo "📋 Próximo passo:"
echo ""

if [[ "$HAS_EDGE_CHANGES" -eq 1 ]] || [[ "$HAS_MIGRATION_CHANGES" -eq 1 ]]; then
  echo "   ⚠️  Existem alterações Supabase que requerem ação manual."
  echo ""
  if [[ "$HAS_EDGE_CHANGES" -eq 1 ]]; then
    echo "   → Edge Functions: deploy obrigatório antes ou durante Step-4"
  fi
  if [[ "$HAS_MIGRATION_CHANGES" -eq 1 ]]; then
    echo "   → Migrations: aplicar manualmente via Supabase CLI"
  fi
  echo ""
  echo "   Após tratar das alterações Supabase, corre:"
  echo "     ./scripts/Step-4-deploy-tested-build.sh"
else
  echo "   Podes avançar directamente para o deploy:"
  echo "     ./scripts/Step-4-deploy-tested-build.sh"
fi

echo ""
