#!/usr/bin/env bash
#
# 🚨 RECUPERAÇÃO DE EMERGÊNCIA 🚨
# Quando tudo falha, este script resolve!
#
# Versão: 20251215.1940
# Última atualização: 2025-12-15 19:40 UTC
#
# Notas:
# - Alinhado com o pipeline Step-2/Step-3 (build local + lint + testes + tsc)
# - Compatível com migração para next.config.mjs (não depende de TS em runtime)
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

echo -e "${RED}🚨 RECUPERAÇÃO DE EMERGÊNCIA 🚨${NC}"
echo "================================"
echo -e "${CYAN}Versão: 20251215.1940${NC}"
echo -e "${CYAN}Atualizado: 2025-12-15 19:40 UTC${NC}"
echo ""
echo "Este script vai fazer uma limpeza TOTAL e reinstalação."
echo "Pode demorar 2-3 minutos."
echo ""
read -p "Continuar? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Abortado."
  exit 0
fi

echo ""
echo -e "${BLUE}═══ PASSO 1: Massacre Total de Processos ═══${NC}"
echo ""

echo -e "${YELLOW}▶ A matar TODOS os processos Node.js/Next.js...${NC}"
# Matar tudo que seja node
pkill -9 node 2>/dev/null || true
pkill -9 next 2>/dev/null || true
pkill -9 tsc 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true

# Libertar porta 3000
if command -v lsof >/dev/null 2>&1; then
  lsof -ti:3000 | xargs kill -9 2>/dev/null || true
fi

sleep 2
echo -e "${GREEN}   ✓ Todos os processos mortos${NC}"

echo ""
echo -e "${BLUE}═══ PASSO 2: Limpeza Nuclear ═══${NC}"
echo ""

echo -e "${YELLOW}▶ A procurar e remover pastas antigas node_modules.old.*...${NC}"
# Remover TODAS as pastas node_modules.old.* (podem interferir com TypeScript)
OLD_DIRS=$(find . -maxdepth 1 -name "node_modules.old.*" -type d 2>/dev/null || true)
if [[ -n "$OLD_DIRS" ]]; then
  echo "$OLD_DIRS" | while IFS= read -r dir; do
    if [[ -n "$dir" ]]; then
      echo "   Removendo: $dir"
      rm -rf "$dir" 2>/dev/null || true
    fi
  done
  echo -e "${GREEN}   ✓ Pastas antigas removidas${NC}"
else
  echo -e "${GREEN}   ✓ Sem pastas antigas${NC}"
fi

echo -e "${YELLOW}▶ A remover node_modules/ (pode demorar)...${NC}"
rm -rf node_modules 2>/dev/null || true
echo -e "${GREEN}   ✓ node_modules removido${NC}"

echo -e "${YELLOW}▶ A remover package-lock.json...${NC}"
rm -f package-lock.json 2>/dev/null || true
echo -e "${GREEN}   ✓ package-lock.json removido${NC}"

echo -e "${YELLOW}▶ A remover .next/...${NC}"
rm -rf .next 2>/dev/null || true
echo -e "${GREEN}   ✓ .next removido${NC}"

echo -e "${YELLOW}▶ A remover caches...${NC}"
rm -rf node_modules/.cache 2>/dev/null || true
rm -f tsconfig.tsbuildinfo 2>/dev/null || true
rm -rf .swc 2>/dev/null || true
echo -e "${GREEN}   ✓ Caches removidos${NC}"

echo -e "${YELLOW}▶ A limpar cache global do npm...${NC}"
npm cache clean --force 2>/dev/null || true
npm cache verify 2>/dev/null || true
echo -e "${GREEN}   ✓ Cache npm limpo${NC}"

echo ""
echo -e "${BLUE}═══ PASSO 3: Verificar package.json ═══${NC}"
echo ""

if [[ ! -f package.json ]]; then
  echo -e "${RED}   ✗ ERRO: package.json não existe!${NC}"
  exit 1
fi

echo -e "${GREEN}   ✓ package.json existe${NC}"

# Mostrar dependências principais
echo ""
echo -e "${YELLOW}Dependências principais:${NC}"
cat package.json | grep -A 10 '"dependencies"' | head -12

echo ""
echo -e "${BLUE}═══ PASSO 4: Reinstalação Limpa ═══${NC}"
echo ""

echo -e "${YELLOW}▶ A instalar dependências (npm install)...${NC}"
echo "   (Isto vai demorar 1-2 minutos)"
echo ""

# Forçar instalação limpa sem usar cache
npm install --prefer-offline=false --no-audit --no-fund 2>&1 | while IFS= read -r line; do
  echo "   $line"
done

echo ""
echo -e "${GREEN}   ✓ Dependências instaladas${NC}"

echo ""
echo -e "${BLUE}═══ PASSO 5: Validação ═══${NC}"
echo ""

echo -e "${YELLOW}▶ Verificando módulos críticos...${NC}"

# Verificar se caniuse-lite existe
if [[ -d node_modules/caniuse-lite ]]; then
  echo -e "${GREEN}   ✓ caniuse-lite instalado${NC}"
else
  echo -e "${RED}   ✗ caniuse-lite em falta!${NC}"
  echo -e "${YELLOW}   → A instalar explicitamente...${NC}"
  npm install caniuse-lite --save
  echo -e "${GREEN}   ✓ caniuse-lite instalado${NC}"
fi

# Verificar se browserslist existe
if [[ -d node_modules/browserslist ]]; then
  echo -e "${GREEN}   ✓ browserslist instalado${NC}"
else
  echo -e "${YELLOW}   → A instalar browserslist...${NC}"
  npm install browserslist --save
  echo -e "${GREEN}   ✓ browserslist instalado${NC}"
fi

# Verificar se next existe
if [[ -d node_modules/next ]]; then
  echo -e "${GREEN}   ✓ Next.js instalado${NC}"
else
  echo -e "${RED}   ✗ Next.js em falta!${NC}"
  exit 1
fi

echo ""
echo -e "${BLUE}═══ PASSO 6: Teste de Build ═══${NC}"
echo ""

echo -e "${YELLOW}▶ A tentar build...${NC}"
echo "   (Timeout: 120 segundos)"
echo ""

# Build com timeout manual (compatível com macOS)
BUILD_LOG="/tmp/build-emergency-$$.log"

# Iniciar build em background
npm run build > "$BUILD_LOG" 2>&1 &
BUILD_PID=$!

# Monitoring loop com timeout manual
ELAPSED=0
MAX_WAIT=120
LAST_SIZE=0
NO_PROGRESS=0
MAX_NO_PROGRESS=15  # 30 segundos sem progresso = problema

echo -e "${BLUE}   [Monitoring iniciado - PID: $BUILD_PID]${NC}"
echo ""

while kill -0 $BUILD_PID 2>/dev/null; do
  sleep 2
  ELAPSED=$((ELAPSED + 2))
  
  CURRENT_SIZE=$(wc -l < "$BUILD_LOG" 2>/dev/null || echo 0)
  
  if [[ $CURRENT_SIZE -gt $LAST_SIZE ]]; then
    # Progresso detectado
    LAST_LINE=$(tail -1 "$BUILD_LOG" 2>/dev/null | sed 's/\x1b\[[0-9;]*m//g' | cut -c1-70)
    echo -e "   ${GREEN}[$ELAPSED s]${NC} 🔄 $LAST_LINE"
    LAST_SIZE=$CURRENT_SIZE
    NO_PROGRESS=0
  else
    NO_PROGRESS=$((NO_PROGRESS + 1))
    
    # Mostrar aviso se sem progresso há muito tempo
    if [[ $NO_PROGRESS -gt $MAX_NO_PROGRESS ]]; then
      echo -e "   ${YELLOW}[$ELAPSED s]${NC} ⚠️  Sem progresso há $((NO_PROGRESS * 2))s (pode estar bloqueado)"
    else
      echo -e "   ${BLUE}[$ELAPSED s]${NC} ⏳ Aguardando progresso... ($NO_PROGRESS/$MAX_NO_PROGRESS)"
    fi
  fi
  
  # Timeout
  if [[ $ELAPSED -gt $MAX_WAIT ]]; then
    echo ""
    echo -e "${RED}   ⏱️  TIMEOUT após ${ELAPSED}s!${NC}"
    kill -9 $BUILD_PID 2>/dev/null || true
    
    echo ""
    echo -e "${YELLOW}   Últimas 30 linhas do log:${NC}"
    echo -e "${YELLOW}   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    tail -30 "$BUILD_LOG" | sed 's/^/   /'
    echo -e "${YELLOW}   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    echo ""
    echo -e "${RED}═══════════════════════════════════${NC}"
    echo -e "${RED}❌ Build pendeu após ${ELAPSED}s${NC}"
    echo -e "${RED}═══════════════════════════════════${NC}"
    echo ""
    echo -e "${YELLOW}📋 Log completo em: $BUILD_LOG${NC}"
    exit 1
  fi
done

# Verificar resultado
wait $BUILD_PID
BUILD_EXIT=$?

echo ""
if [[ $BUILD_EXIT -eq 0 ]]; then
  echo -e "${GREEN}═══════════════════════════════════${NC}"
  echo -e "${GREEN}✅ RECUPERAÇÃO COMPLETA!${NC}"
  echo -e "${GREEN}✅ BUILD FUNCIONOU!${NC}"
  echo -e "${GREEN}═══════════════════════════════════${NC}"
  echo ""
  echo -e "${YELLOW}Última output do build:${NC}"
  tail -10 "$BUILD_LOG" | sed 's/\x1b\[[0-9;]*m//g' | sed 's/^/   /'
  echo ""
  echo -e "${YELLOW}Podes agora:${NC}"
  echo "   • Rodar dev: npm run dev"
  echo "   • Fazer deploy: ./scripts/Step-4-deploy-tested-build.sh"
  
  # Limpar log de sucesso
  rm -f "$BUILD_LOG"
  exit 0
else
  echo -e "${RED}═══════════════════════════════════${NC}"
  echo -e "${RED}❌ Build ainda falhou após recuperação${NC}"
  echo -e "${RED}═══════════════════════════════════${NC}"
  echo ""
  echo -e "${YELLOW}   Últimas 40 linhas do log:${NC}"
  echo -e "${YELLOW}   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  tail -40 "$BUILD_LOG" | sed 's/^/   /'
  echo -e "${YELLOW}   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  
  # Procurar por erros específicos no log
  if grep -q "node_modules.old" "$BUILD_LOG"; then
    echo -e "${RED}🔍 PROBLEMA DETECTADO: Pastas node_modules.old.* antigas${NC}"
    echo "   Execute manualmente:"
    echo "   rm -rf node_modules.old.*"
    echo "   ./scripts/emergency-fix.sh"
    echo ""
  fi
  
  if grep -q "EACCES" "$BUILD_LOG"; then
    echo -e "${RED}🔍 PROBLEMA DETECTADO: Permissões${NC}"
    echo "   Execute: sudo chown -R $(whoami) ."
    echo ""
  fi
  
  if grep -q "ENOSPC" "$BUILD_LOG"; then
    echo -e "${RED}🔍 PROBLEMA DETECTADO: Sem espaço em disco${NC}"
    echo "   Liberte espaço e tente novamente"
    echo ""
  fi
  
  echo -e "${YELLOW}📋 Próximos passos:${NC}"
  echo "   1. Verificar versão do Node.js:"
  echo "      node --version"
  echo "      (Recomendado: v18.x ou v20.x)"
  echo ""
  echo "   2. Remover pastas antigas manualmente:"
  echo "      rm -rf node_modules.old.*"
  echo ""
  echo "   3. Tentar com mais memória:"
  echo "      NODE_OPTIONS='--max-old-space-size=8192' npm run build"
  echo ""
  echo "   4. Verificar se há erros TypeScript:"
  echo "      npx tsc --noEmit"
  echo ""
  echo "   5. Log completo em: $BUILD_LOG"
  exit 1
fi