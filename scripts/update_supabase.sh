#!/usr/bin/env bash
#
# Orquestra todas as operações do Supabase via CLI.
# - Aplica migrações e seeds
# - Faz deploy de Edge Functions
# - Gera logs em ./logs/supabase/
#
# Requerimentos:
# - SUPABASE_PROJECT_REF (ex: abcdefghijklmnopqrstu)
# - Supabase CLI autenticado (via supabase login ou SUPABASE_ACCESS_TOKEN)
# - supabase/config.toml e supabase/link configurados para o projecto

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$ROOT_DIR/logs/supabase"
TIMESTAMP="$(date +"%Y%m%d-%H%M%S")"
LOG_FILE="$LOG_DIR/supabase-update-$TIMESTAMP.log"
ENV_FILE="${ENV_FILE:-"$ROOT_DIR/.env.local"}"

mkdir -p "$LOG_DIR"
exec > >(tee -a "$LOG_FILE") 2>&1

log() {
  printf '[update_supabase][%s] %s\n' "$(date +"%Y-%m-%dT%H:%M:%S%z")" "$*"
}

fail() {
  log "ERRO: $*"
  exit 1
}

log "Raiz do repositório: $ROOT_DIR"
log "Log: $LOG_FILE"

if [[ -f "$ENV_FILE" ]]; then
  log "A carregar variáveis de ambiente de $ENV_FILE"
  # shellcheck disable=SC1090
  set -a
  source "$ENV_FILE"
  set +a
else
  log "Nenhum ficheiro de ambiente encontrado em $ENV_FILE (a continuar sem carregar .env.local)"
fi

command -v supabase >/dev/null 2>&1 || fail "Supabase CLI não encontrado no PATH. Instala antes de continuar."
log "Versão Supabase CLI: $(supabase --version)"

derive_project_ref() {
  local url="$1"
  if [[ -n "$url" && "$url" =~ https?://([^./]+)\.supabase\.co ]]; then
    echo "${BASH_REMATCH[1]}"
  fi
}

SUPABASE_PROJECT_REF=${SUPABASE_PROJECT_REF:-""}
if [[ -z "$SUPABASE_PROJECT_REF" ]]; then
  for candidate in "${SUPABASE_URL:-}" "${NEXT_PUBLIC_SUPABASE_URL:-}"; do
    derived_ref="$(derive_project_ref "$candidate")"
    if [[ -n "$derived_ref" ]]; then
      SUPABASE_PROJECT_REF="$derived_ref"
      log "SUPABASE_PROJECT_REF não definido; derivado de URL Supabase: $SUPABASE_PROJECT_REF"
      break
    fi
  done
fi

[[ -n "$SUPABASE_PROJECT_REF" ]] || fail "Define SUPABASE_PROJECT_REF para identificar o projecto remoto (ou garante que SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL incluem o project-ref)."
[[ -f "$ROOT_DIR/supabase/config.toml" ]] || fail "supabase/config.toml não encontrado. Corre 'supabase init' e 'supabase link --project-ref $SUPABASE_PROJECT_REF'."

log "Garantir ligação ao projecto (supabase link)"
supabase link --project-ref "$SUPABASE_PROJECT_REF" --workdir "$ROOT_DIR"

if compgen -G "$ROOT_DIR/supabase/migrations/*.sql" > /dev/null; then
  log "Aplicar migrações ao projecto remoto (supabase db push)"
  supabase db push --workdir "$ROOT_DIR" --project-ref "$SUPABASE_PROJECT_REF"
else
  log "Nenhuma migração encontrada em supabase/migrations. Skip db push."
fi

if compgen -G "$ROOT_DIR/supabase/seed/*.sql" > /dev/null; then
  for seed in "$ROOT_DIR"/supabase/seed/*.sql; do
    log "Aplicar seed: $(basename "$seed")"
    supabase db execute --file "$seed" --workdir "$ROOT_DIR" --project-ref "$SUPABASE_PROJECT_REF"
  done
else
  log "Nenhum seed SQL encontrado. Skip seeds."
fi

FUNCTIONS_DIR="$ROOT_DIR/supabase/functions"
if [[ -d "$FUNCTIONS_DIR" ]] && find "$FUNCTIONS_DIR" -mindepth 2 -maxdepth 2 -type f | grep -q .; then
  for fn in $(find "$FUNCTIONS_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%f\n'); do
    if find "$FUNCTIONS_DIR/$fn" -type f | grep -q .; then
      log "Fazer deploy da Edge Function: $fn"
      supabase functions deploy "$fn" --workdir "$ROOT_DIR" --project-ref "$SUPABASE_PROJECT_REF"
    else
      log "Function $fn não tem ficheiros; skip."
    fi
  done
else
  log "Nenhum ficheiro encontrado em supabase/functions. Skip deploy de funções."
fi

log "Supabase actualizado com sucesso. Log guardado em $LOG_FILE"
