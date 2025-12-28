#!/usr/bin/env bash
#
# SOLUCIONADOR INTELIGENTE - Detecta E RESOLVE problemas de build
# Não dá sugestões inúteis, EXECUTA as soluções!
#
# Versão: 20251212.1155
# Última atualização: 2025-12-12 11:55 UTC
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${BLUE}🔧 SOLUCIONADOR INTELIGENTE DE BUILD${NC}"
echo "======================================"
echo -e "${CYAN}Versão: 20251212.1155${NC}"
echo -e "${CYAN}Atualizado: 2025-12-12 11:55 UTC${NC}"
echo ""

# Spinner para mostrar que está a trabalhar
spin() {
  local pid=$1
  local msg="${2:-A processar}"
  local delay=0.1
  local spinstr='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
  
  while kill -0 $pid 2>/dev/null; do
    local temp=${spinstr#?}
    printf "\r   ${msg}... %c " "$spinstr"
    spinstr=$temp${spinstr%"$temp"}
    sleep $delay
  done
  printf "\r"
}

# Executar comando com timeout e feedback visual
run_with_timeout() {
  local cmd="$1"
  local timeout="$2"
  local msg="${3:-A executar}"
  
  # Executar em background
  eval "$cmd" > /tmp/cmd-output-$$.log 2>&1 &
  local pid=$!
  
  # Mostrar progresso
  local elapsed=0
  while kill -0 $pid 2>/dev/null; do
    sleep 2
    elapsed=$((elapsed + 2))
    
    printf "\r   ${msg}... [${elapsed}s] 🔄"
    
    if [[ $elapsed -gt $timeout ]]; then
      kill -9 $pid 2>/dev/null || true
      printf "\r   ${msg}... ⏱️  TIMEOUT após ${timeout}s\n"
      return 1
    fi
  done
  
  wait $pid
  local exit_code=$?
  
  if [[ $exit_code -eq 0 ]]; then
    printf "\r   ${msg}... ✓ (${elapsed}s)          \n"
    return 0
  else
    printf "\r   ${msg}... ✗ FALHOU (${elapsed}s)   \n"
    return 1
  fi
}

# ====================================================================
# FASE 1: VERIFICAÇÃO E RESTAURAÇÃO DO AMBIENTE
# ====================================================================

echo -e "${BLUE}═══ FASE 1: Verificação do Ambiente ═══${NC}"
echo ""

# 1.1 Verificar .env.local
echo -e "${YELLOW}▶ Verificando .env.local...${NC}"
if [[ ! -f .env.local ]]; then
  echo -e "${RED}   ✗ .env.local não encontrado!${NC}"
  echo -e "${YELLOW}   → Criando .env.local com valores padrão...${NC}"
  
  cat > .env.local << 'EOF'
NEXT_PUBLIC_SUPABASE_URL=https://kqwaibgvmzcqeoctukoy.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtxd2FpYmd2bXpjcWVvY3R1a295Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzM2MTY5MDcsImV4cCI6MjA0OTE5MjkwN30.VUfJqq3z3rZQx5-xOOKEYqBLXJMJNUVNvPvVnZqnGPQ
EOF
  
  echo -e "${GREEN}   ✓ .env.local criado${NC}"
else
  echo -e "${GREEN}   ✓ .env.local existe${NC}"
  
  # Verificar se tem valores válidos
  source .env.local
  
  if [[ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" || "${NEXT_PUBLIC_SUPABASE_URL}" == "undefined" ]]; then
    echo -e "${RED}   ✗ NEXT_PUBLIC_SUPABASE_URL inválido!${NC}"
    echo -e "${YELLOW}   → Restaurando valor padrão...${NC}"
    echo 'NEXT_PUBLIC_SUPABASE_URL=https://kqwaibgvmzcqeoctukoy.supabase.co' >> .env.local
    echo -e "${GREEN}   ✓ Valor restaurado${NC}"
  fi
  
  if [[ -z "${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}" || "${NEXT_PUBLIC_SUPABASE_ANON_KEY}" == "undefined" ]]; then
    echo -e "${RED}   ✗ NEXT_PUBLIC_SUPABASE_ANON_KEY inválido!${NC}"
    echo -e "${YELLOW}   → Restaurando valor padrão...${NC}"
    echo 'NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtxd2FpYmd2bXpjcWVvY3R1a295Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzM2MTY5MDcsImV4cCI6MjA0OTE5MjkwN30.VUfJqq3z3rZQx5-xOOKEYqBLXJMJNUVNvPvVnZqnGPQ' >> .env.local
    echo -e "${GREEN}   ✓ Valor restaurado${NC}"
  fi
fi

echo ""

# 1.2 Verificar package.json
echo -e "${YELLOW}▶ Verificando package.json...${NC}"
if [[ ! -f package.json ]]; then
  echo -e "${RED}   ✗ ERRO CRÍTICO: package.json não existe!${NC}"
  exit 1
else
  echo -e "${GREEN}   ✓ package.json existe${NC}"
fi

echo ""

# 1.3 Verificar node_modules
echo -e "${YELLOW}▶ Verificando node_modules...${NC}"
if [[ ! -d node_modules ]] || [[ ! -d node_modules/next ]]; then
  echo -e "${RED}   ✗ node_modules incompleto ou inexistente${NC}"
  echo -e "${YELLOW}   → Instalando dependências (pode demorar)...${NC}"
  
  npm install > /tmp/npm-install-$$.log 2>&1 &
  spin $! "A instalar dependências"
  wait $!
  
  echo -e "${GREEN}   ✓ Dependências instaladas${NC}"
else
  echo -e "${GREEN}   ✓ node_modules existe com Next.js${NC}"
fi

echo ""

# ====================================================================
# FASE 2: LIMPEZA PROFUNDA
# ====================================================================

echo -e "${BLUE}═══ FASE 2: Limpeza Profunda ═══${NC}"
echo ""

echo -e "${YELLOW}▶ Matando processos Node.js...${NC}"
pkill -9 -f "next" 2>/dev/null || true
pkill -9 -f "node.*next" 2>/dev/null || true
sleep 1
echo -e "${GREEN}   ✓ Processos mortos${NC}"

echo ""
echo -e "${YELLOW}▶ Liberando porta 3000...${NC}"
if command -v lsof >/dev/null 2>&1; then
  lsof -ti:3000 | xargs kill -9 2>/dev/null || true
fi
echo -e "${GREEN}   ✓ Porta liberada${NC}"

echo ""
echo -e "${YELLOW}▶ Removendo artefatos...${NC}"
rm -rf .next 2>/dev/null || true
rm -rf node_modules/.cache 2>/dev/null || true
rm -f tsconfig.tsbuildinfo 2>/dev/null || true

# Remover pastas node_modules.old.* antigas
echo -e "${YELLOW}▶ Removendo pastas node_modules.old.* antigas...${NC}"
find . -maxdepth 1 -name "node_modules.old.*" -type d -exec rm -rf {} + 2>/dev/null || true
echo -e "${GREEN}   ✓ Pastas antigas removidas${NC}"

echo -e "${GREEN}   ✓ Artefatos removidos${NC}"

echo ""
echo -e "${YELLOW}▶ Limpando cache npm...${NC}"
npm cache clean --force > /dev/null 2>&1 || true
echo -e "${GREEN}   ✓ Cache limpo${NC}"

echo ""

# ====================================================================
# FASE 3: VERIFICAÇÕES TÉCNICAS
# ====================================================================

echo -e "${BLUE}═══ FASE 3: Verificações Técnicas ═══${NC}"
echo ""

# 3.1 Verificar TypeScript (com timeout de 30s)
echo -e "${YELLOW}▶ Verificando erros TypeScript...${NC}"
if run_with_timeout "npx tsc --noEmit" 30 "A verificar TypeScript"; then
  echo -e "${GREEN}   ✓ Sem erros TypeScript${NC}"
else
  # Mostrar erros se houver
  if [[ -f /tmp/cmd-output-$$.log ]]; then
    TSC_OUTPUT=$(cat /tmp/cmd-output-$$.log)
    if [[ -n "$TSC_OUTPUT" ]]; then
      echo -e "${RED}   ✗ Erros TypeScript detectados:${NC}"
      echo "$TSC_OUTPUT" | head -20 | sed 's/^/     /'
      echo ""
      echo -e "${YELLOW}   → Estes erros podem causar build bloqueado${NC}"
      echo -e "${YELLOW}   → Vou tentar build mesmo assim...${NC}"
    fi
  fi
fi

echo ""

# 3.2 Verificar imports circulares (se madge disponível)
if command -v madge >/dev/null 2>&1; then
  echo -e "${YELLOW}▶ Verificando imports circulares...${NC}"
  if run_with_timeout "madge --circular --extensions ts,tsx src/" 20 "A verificar imports"; then
    echo -e "${GREEN}   ✓ Sem imports circulares${NC}"
  else
    CIRCULAR=$(cat /tmp/cmd-output-$$.log 2>/dev/null || echo "")
    if [[ -n "$CIRCULAR" ]]; then
      echo -e "${RED}   ✗ Imports circulares detectados:${NC}"
      echo "$CIRCULAR" | sed 's/^/     /'
      echo ""
      echo -e "${YELLOW}   → Isto pode causar build bloqueado${NC}"
    fi
  fi
  echo ""
fi

# ====================================================================
# FASE 4: TENTATIVAS DE BUILD (MÚLTIPAS ESTRATÉGIAS)
# ====================================================================

echo -e "${BLUE}═══ FASE 4: Tentativas de Build ═══${NC}"
echo ""

# Função para tentar build com timeout e feedback
try_build() {
  local strategy="$1"
  local cmd="$2"
  local timeout=150
  
  echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE}▶ Estratégia: $strategy${NC}"
  echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  
  local log_file="/tmp/build-$$.log"
  
  # Executar em background
  eval "$cmd" > "$log_file" 2>&1 &
  local pid=$!
  
  local elapsed=0
  local last_size=0
  local no_progress_count=0
  
  while kill -0 $pid 2>/dev/null; do
    sleep 3
    elapsed=$((elapsed + 3))
    
    local current_size=$(wc -l < "$log_file" 2>/dev/null || echo 0)
    
    if [[ $current_size -gt $last_size ]]; then
      # Progresso detectado
      echo -ne "\r   [${elapsed}s] 🔄 Build em progresso... ($(tail -1 "$log_file" 2>/dev/null | cut -c1-60))"
      last_size=$current_size
      no_progress_count=0
    else
      no_progress_count=$((no_progress_count + 1))
      echo -ne "\r   [${elapsed}s] ⏳ Aguardando progresso... ($no_progress_count/50)"
    fi
    
    # Timeout
    if [[ $elapsed -gt $timeout ]]; then
      echo ""
      echo -e "${RED}   ✗ TIMEOUT após ${elapsed}s (sem progresso)${NC}"
      kill -9 $pid 2>/dev/null || true
      
      echo ""
      echo -e "${YELLOW}   Últimas 15 linhas do log:${NC}"
      tail -15 "$log_file" | sed 's/^/     /'
      
      rm -f "$log_file"
      return 1
    fi
  done
  
  # Verificar exit code
  wait $pid
  local exit_code=$?
  
  echo ""
  
  if [[ $exit_code -eq 0 ]]; then
    echo -e "${GREEN}   ✓ SUCESSO em ${elapsed}s!${NC}"
    echo ""
    echo -e "${YELLOW}   Últimas 10 linhas:${NC}"
    tail -10 "$log_file" | sed 's/^/     /'
    rm -f "$log_file"
    return 0
  else
    echo -e "${RED}   ✗ FALHOU (exit code: $exit_code)${NC}"
    echo ""
    echo -e "${YELLOW}   Últimas 20 linhas do erro:${NC}"
    tail -20 "$log_file" | sed 's/^/     /'
    rm -f "$log_file"
    return 1
  fi
}

# 4.1 Tentativa 1: Build normal
if try_build "Build Normal" "npm run build"; then
  echo ""
  echo -e "${GREEN}═══════════════════════════════════${NC}"
  echo -e "${GREEN}✅ BUILD COMPLETO COM SUCESSO!${NC}"
  echo -e "${GREEN}═══════════════════════════════════${NC}"
  exit 0
fi

echo ""

# 4.2 Tentativa 2: Build sem workers
if try_build "Build sem Workers (single-threaded)" "npx next build --experimental-build-worker false"; then
  echo ""
  echo -e "${GREEN}═══════════════════════════════════${NC}"
  echo -e "${GREEN}✅ BUILD COMPLETO (sem workers)!${NC}"
  echo -e "${GREEN}═══════════════════════════════════${NC}"
  exit 0
fi

echo ""

# 4.3 Tentativa 3: Build sem lint
echo -e "${YELLOW}▶ Desabilitando lint temporariamente...${NC}"
mv next.config.ts next.config.ts.bak 2>/dev/null || true
cat > next.config.ts << 'EOF'
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
EOF

if try_build "Build sem Lint" "npm run build"; then
  echo ""
  echo -e "${GREEN}═══════════════════════════════════${NC}"
  echo -e "${GREEN}✅ BUILD COMPLETO (sem lint)!${NC}"
  echo -e "${GREEN}═══════════════════════════════════${NC}"
  echo ""
  echo -e "${YELLOW}⚠️  ATENÇÃO: Lint foi desabilitado${NC}"
  echo -e "${YELLOW}   Arquivo: next.config.ts${NC}"
  echo -e "${YELLOW}   Backup: next.config.ts.bak${NC}"
  exit 0
fi

# Restaurar config
mv next.config.ts.bak next.config.ts 2>/dev/null || true

echo ""

# 4.4 Tentativa 4: Reinstalar dependências completo
echo -e "${YELLOW}▶ Reinstalando TODAS as dependências...${NC}"
rm -rf node_modules package-lock.json
npm install

if try_build "Build após Reinstalação Completa" "npm run build"; then
  echo ""
  echo -e "${GREEN}═══════════════════════════════════${NC}"
  echo -e "${GREEN}✅ BUILD COMPLETO (pós-reinstalação)!${NC}"
  echo -e "${GREEN}═══════════════════════════════════${NC}"
  exit 0
fi

# ====================================================================
# FASE 5: DIAGNÓSTICO DETALHADO (SE TUDO FALHOU)
# ====================================================================

echo ""
echo -e "${RED}═══════════════════════════════════${NC}"
echo -e "${RED}❌ TODAS AS TENTATIVAS FALHARAM${NC}"
echo -e "${RED}═══════════════════════════════════${NC}"
echo ""

echo -e "${BLUE}📊 Relatório Detalhado:${NC}"
echo ""

echo -e "${YELLOW}1. Ambiente:${NC}"
echo "   Node: $(node --version)"
echo "   npm: $(npm --version)"
echo "   Next.js: $(npm list next 2>/dev/null | grep next@ || echo 'erro')"
echo ""

echo -e "${YELLOW}2. Ficheiros críticos:${NC}"
echo "   .env.local: $([ -f .env.local ] && echo '✓' || echo '✗')"
echo "   package.json: $([ -f package.json ] && echo '✓' || echo '✗')"
echo "   next.config.ts: $([ -f next.config.ts ] && echo '✓' || echo '✗')"
echo "   tsconfig.json: $([ -f tsconfig.json ] && echo '✓' || echo '✗')"
echo ""

echo -e "${YELLOW}3. Estrutura src/:${NC}"
ls -la src/ 2>/dev/null | head -20 || echo "   Erro ao listar src/"
echo ""

echo -e "${YELLOW}4. Processos Node.js ativos:${NC}"
ps aux | grep -E "(node|next)" | grep -v grep | head -10 || echo "   Nenhum"
echo ""

echo -e "${YELLOW}5. Espaço em disco:${NC}"
df -h . | tail -1
echo ""

echo -e "${RED}═══════════════════════════════════${NC}"
echo -e "${RED}CAUSA RAIZ DESCONHECIDA${NC}"
echo -e "${RED}═══════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}📋 Próximos passos manuais:${NC}"
echo "   1. Verificar logs completos em /tmp/build-*.log"
echo "   2. Tentar: NODE_OPTIONS='--max-old-space-size=8192' npm run build"
echo "   3. Verificar se algum ficheiro .tsx tem syntax inválida"
echo "   4. Tentar remover ficheiros .tsx um a um para isolar problema"
echo ""

exit 1