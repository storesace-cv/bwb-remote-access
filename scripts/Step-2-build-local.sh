#!/usr/bin/env bash
#
# Versão: 20251212.1155
# Última atualização: 2025-12-12 11:55 UTC
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

echo "╔════════════════════════════════════════════════════════════╗"
echo "║           Step 2: Build Local - Next.js                   ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "📦 Versão: 20251212.1155"
echo "🕐 Atualizado: 2025-12-12 11:55 UTC"
echo ""
echo "[Step-2] Root do repositório: $REPO_ROOT"

# ---------------------------------------------------------
# 1. Carregar .env.local (OBRIGATÓRIO) para o ambiente
# ---------------------------------------------------------
ENV_FILE="$REPO_ROOT/.env.local"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "[Step-2] ERRO: .env.local não encontrado na raiz do repositório."
  echo "         Este ficheiro é OBRIGATÓRIO e deve conter as variáveis públicas do Supabase:"
  echo "           - NEXT_PUBLIC_SUPABASE_URL"
  echo "           - NEXT_PUBLIC_SUPABASE_ANON_KEY"
  exit 1
fi

echo "[Step-2] A carregar variáveis de $ENV_FILE"

# Validação de sintaxe antes de fazer source: ficheiro tem de ser shell válido
if ! bash -n "$ENV_FILE" >/dev/null 2>&1; then
  echo "[Step-2] ERRO: .env.local tem sintaxe inválida como ficheiro shell."
  echo "         Cada linha deve ter o formato NOME=valor (ou NOME=\"valor\"),"
  echo "         sem aspas em falta, sem JSON bruto, e sem caracteres estranhos."
  echo "         Verifica a linha indicada pelo bash (ex: \"line 2: syntax error near unexpected token 'newline'\")."
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

# ---------------------------------------------------------
# 2. Validar envs críticas do Supabase
# ---------------------------------------------------------
missing_envs=()

if [[ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" || "${NEXT_PUBLIC_SUPABASE_URL}" == "undefined" ]]; then
  missing_envs+=("NEXT_PUBLIC_SUPABASE_URL")
fi

if [[ -z "${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}" || "${NEXT_PUBLIC_SUPABASE_ANON_KEY}" == "undefined" ]]; then
  missing_envs+=("NEXT_PUBLIC_SUPABASE_ANON_KEY")
fi

if ((${#missing_envs[@]} > 0)); then
  echo "[Step-2] ERRO: As seguintes variáveis públicas do Supabase estão em falta ou inválidas:"
  for name in "${missing_envs[@]}"; do
    printf '  - %s\n' "$name"
  done
  exit 1
fi

echo "[Step-2] NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}"
echo "[Step-2] NEXT_PUBLIC_SUPABASE_ANON_KEY definido (não mostrado por segurança)"

# ---------------------------------------------------------
# 3. Validar estrutura de diretórios requeridos
# ---------------------------------------------------------
echo "[Step-2] Validar que todos os diretórios de source necessários existem..."

REQUIRED_DIRS=(
  "src/integrations/supabase"
  "src/lib"
  "src/services"
  "src/app"
)

missing_dirs=()
for dir in "${REQUIRED_DIRS[@]}"; do
  if [[ ! -d "$REPO_ROOT/$dir" ]]; then
    missing_dirs+=("$dir")
  fi
done

if ((${#missing_dirs[@]} > 0)); then
  echo "[Step-2] ERRO: Os seguintes diretórios requeridos estão em falta:"
  for dir in "${missing_dirs[@]}"; do
    printf '  - %s\n' "$dir"
  done
  exit 1
fi

echo "[Step-2] ✓ Todos os diretórios necessários estão presentes"

# ---------------------------------------------------------
# 4. Limpeza SEGURA (sem background jobs)
# ---------------------------------------------------------
echo "[Step-2] 🧹 A limpar artefactos de execuções anteriores..."

# Matar processos Next.js/Node
echo "[Step-2]   - A matar processos Node.js/Next.js..."
pkill -9 -f "next-server" 2>/dev/null || true
pkill -9 -f "next dev" 2>/dev/null || true
pkill -9 -f "node.*next" 2>/dev/null || true
sleep 0.5

# Libertar porta 3000
if command -v lsof >/dev/null 2>&1; then
  if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "[Step-2]   - A libertar porta 3000..."
    lsof -ti:3000 | xargs kill -9 2>/dev/null || true
    sleep 0.5
  fi
fi

# Remover .next (rápido - poucos ficheiros)
if [[ -d "$REPO_ROOT/.next" ]]; then
  echo "[Step-2]   - A remover .next/"
  rm -rf "$REPO_ROOT/.next" 2>/dev/null || true
fi

# Limpar caches pequenos
[[ -d "$REPO_ROOT/node_modules/.cache" ]] && rm -rf "$REPO_ROOT/node_modules/.cache" 2>/dev/null || true
[[ -f "$REPO_ROOT/tsconfig.tsbuildinfo" ]] && rm -f "$REPO_ROOT/tsconfig.tsbuildinfo" 2>/dev/null || true

# Limpeza de node_modules: SEGURA mas pode demorar
# Flag para pular se definida: SKIP_NODE_MODULES_CLEAN=1
if [[ "${SKIP_NODE_MODULES_CLEAN:-0}" == "1" ]]; then
  echo "[Step-2]   - A PULAR limpeza de node_modules (SKIP_NODE_MODULES_CLEAN=1)"
else
  if [[ -d "$REPO_ROOT/node_modules" ]]; then
    echo "[Step-2]   - A remover node_modules/ (isto pode demorar alguns minutos)..."
    echo "[Step-2]     ℹ️  Para pular esta etapa: export SKIP_NODE_MODULES_CLEAN=1"
    
    # Matar qualquer processo de cleanup em background anterior
    pkill -9 -f "node_modules.old" 2>/dev/null || true
    
    # Remover pastas .old anteriores (não bloquear se não existirem)
    rm -rf "$REPO_ROOT"/node_modules.old.* 2>/dev/null || true
    
    # Remover node_modules atual
    rm -rf "$REPO_ROOT/node_modules" 2>/dev/null || true
    
    echo "[Step-2]     ✓ node_modules removido"
  fi
fi

# Limpar cache do npm
echo "[Step-2]   - A limpar cache do npm"
npm cache clean --force 2>/dev/null || true

echo "[Step-2] ✓ Limpeza concluída"

# ---------------------------------------------------------
# 5. Instalar dependências
# ---------------------------------------------------------
echo "[Step-2] 📦 A instalar dependências..."

# Garantir que node_modules existe (vazio)
mkdir -p "$REPO_ROOT/node_modules"

# npm ci é mais rápido e determinístico
if [[ -f "$REPO_ROOT/package-lock.json" ]]; then
  echo "[Step-2]   - A usar npm ci (instalação limpa)"
  
  if ! npm ci 2>/dev/null; then
    echo "[Step-2]   ⚠️  npm ci falhou, a usar npm install"
    rm -f "$REPO_ROOT/package-lock.json"
    npm install
  fi
else
  echo "[Step-2]   - A usar npm install (gera novo lock file)"
  npm install
fi

echo "[Step-2] ✓ Dependências instaladas"

# ---------------------------------------------------------
# 6. Build de produção
# ---------------------------------------------------------
echo "[Step-2] 🏗️  A executar build de produção..."
echo "[Step-2]   npm run build"

npm run build

# ---------------------------------------------------------
# 7. Validação pós-build
# ---------------------------------------------------------
echo ""
echo "[Step-2] 🔍 A validar build..."

# Verificar se o BUILD_ID foi gerado
if [[ ! -f "$REPO_ROOT/.next/BUILD_ID" ]]; then
  echo "[Step-2] ❌ ERRO: BUILD_ID não foi gerado. Build pode ter falhar parcialmente."
  exit 1
fi

BUILD_ID="$(cat "$REPO_ROOT/.next/BUILD_ID")"
echo "[Step-2] ✓ BUILD_ID gerado: $BUILD_ID"

# Verificar pastas essenciais do build
REQUIRED_BUILD_DIRS=(
  ".next/server"
  ".next/static"
)

for dir in "${REQUIRED_BUILD_DIRS[@]}"; do
  if [[ ! -d "$REPO_ROOT/$dir" ]]; then
    echo "[Step-2] ❌ ERRO: Pasta de build essencial não encontrada: $dir"
    exit 1
  fi
done

echo "[Step-2] ✓ Estrutura de build validada"

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║              Build Concluído com Sucesso!                  ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "✅ Build ID: $BUILD_ID"
echo "✅ Artefactos gerados em: .next/"
echo "✅ Dependências instaladas: node_modules/"
echo ""
echo "📋 Próximos passos:"
echo "   1️⃣  Testar localmente:  ./scripts/Step-3-test-local.sh"
echo "   2️⃣  Deploy ao droplet:  ./scripts/Step-4-deploy-tested-build.sh"
echo ""
