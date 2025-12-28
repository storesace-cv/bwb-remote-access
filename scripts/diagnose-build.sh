#!/usr/bin/env bash
#
# Diagnóstico do problema de build (compatível com macOS)
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "🔍 Diagnóstico de Build - Next.js"
echo "=================================="
echo ""

# 1. Verificar versões
echo "1️⃣  Versões instaladas:"
echo "   Node: $(node --version)"
echo "   npm: $(npm --version)"
echo "   Next.js: $(npm list next 2>/dev/null | grep next@ || echo 'não instalado')"
echo ""

# 2. Verificar .next
echo "2️⃣  Estado do diretório .next:"
if [[ -d .next ]]; then
  echo "   ⚠️  .next existe (pode estar corrompido)"
  echo "   Tamanho: $(du -sh .next 2>/dev/null || echo 'erro ao calcular')"
  echo ""
  echo "   🗑️  Removendo .next..."
  rm -rf .next
  echo "   ✓ .next removido"
else
  echo "   ✓ .next não existe (limpo)"
fi
echo ""

# 3. Verificar processos Next.js
echo "3️⃣  Verificando processos Next.js existentes..."
if pgrep -f "next" >/dev/null 2>&1; then
  echo "   ⚠️  Processos Next.js encontrados:"
  ps aux | grep -E "(next|node)" | grep -v grep || true
  echo ""
  echo "   🔪 Matando processos..."
  pkill -9 -f "next" 2>/dev/null || true
  sleep 1
  echo "   ✓ Processos mortos"
else
  echo "   ✓ Nenhum processo Next.js em execução"
fi
echo ""

# 4. Build com monitoring em background
echo "4️⃣  Iniciando build com monitoring..."
echo "   (Pressione CTRL+C se pendurar por mais de 2 minutos)"
echo ""

# Criar arquivo temporário para output
BUILD_LOG="/tmp/nextjs-build-$$.log"

# Iniciar build em background e capturar PID
npm run build > "$BUILD_LOG" 2>&1 &
BUILD_PID=$!

echo "   Build PID: $BUILD_PID"
echo "   Log file: $BUILD_LOG"
echo ""

# Monitoring loop
SECONDS=0
MAX_WAIT=120  # 2 minutos
LAST_SIZE=0

while kill -0 $BUILD_PID 2>/dev/null; do
  sleep 5
  CURRENT_SIZE=$(wc -l < "$BUILD_LOG" 2>/dev/null || echo 0)
  
  if [[ $CURRENT_SIZE -gt $LAST_SIZE ]]; then
    # Progresso detectado
    echo "   [${SECONDS}s] Build em progresso... ($(tail -1 "$BUILD_LOG" 2>/dev/null || echo 'sem output'))"
    LAST_SIZE=$CURRENT_SIZE
  else
    # Sem progresso
    echo "   [${SECONDS}s] Aguardando... (sem mudanças no log)"
  fi
  
  # Timeout após 2 minutos
  if [[ $SECONDS -gt $MAX_WAIT ]]; then
    echo ""
    echo "   ⏱️  TIMEOUT após ${SECONDS}s!"
    echo "   🔪 Matando processo de build..."
    kill -9 $BUILD_PID 2>/dev/null || true
    
    echo ""
    echo "5️⃣  Últimas 30 linhas do log:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    tail -30 "$BUILD_LOG"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    echo "6️⃣  Análise:"
    if grep -q "Compiling" "$BUILD_LOG"; then
      echo "   🔍 Build pendeu durante compilação"
      echo "   Última compilação:"
      grep "Compiling" "$BUILD_LOG" | tail -5
    fi
    
    if grep -q "Collecting page data" "$BUILD_LOG"; then
      echo "   🔍 Build pendeu durante coleta de dados de páginas"
    fi
    
    if grep -q "Generating static pages" "$BUILD_LOG"; then
      echo "   🔍 Build pendeu durante geração de páginas estáticas"
    fi
    
    if grep -q "Creating an optimized production build" "$BUILD_LOG"; then
      LAST_LINE=$(tail -1 "$BUILD_LOG")
      echo "   🔍 Última operação: $LAST_LINE"
    fi
    
    echo ""
    echo "📋 Sugestões:"
    echo "   1. Verificar se há imports circulares"
    echo "   2. Verificar se há componentes com loops infinitos"
    echo "   3. Tentar build com menos workers: npm run build -- --experimental-build-worker false"
    echo ""
    echo "Log completo salvo em: $BUILD_LOG"
    
    exit 1
  fi
done

# Build terminou - verificar se foi sucesso
wait $BUILD_PID
EXIT_CODE=$?

echo ""
if [[ $EXIT_CODE -eq 0 ]]; then
  echo "   ✅ Build completou com sucesso em ${SECONDS}s!"
  echo ""
  tail -20 "$BUILD_LOG"
else
  echo "   ❌ Build falhou com código: $EXIT_CODE"
  echo ""
  echo "5️⃣  Últimas 30 linhas do log:"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  tail -30 "$BUILD_LOG"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
fi

echo ""
echo "Log completo salvo em: $BUILD_LOG"

exit $EXIT_CODE