#!/bin/bash

# ============================================================================
# Apply Deploy Fixes - Manual Script
# ============================================================================
# This script helps you apply the necessary fixes to package.json and commit
# all deployment-related changes.
#
# Run with: bash scripts/apply-deploy-fixes.sh
# ============================================================================

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔧 Apply Deploy Fixes"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Step 1: Check if we're in the right directory
if [[ ! -f "package.json" ]]; then
  echo "❌ ERRO: package.json não encontrado!"
  echo "   Execute este script na raiz do repositório."
  exit 1
fi

# Step 2: Instructions for package.json
echo "📝 STEP 1: Editar package.json"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Tens de mover estas dependências de 'devDependencies' para 'dependencies':"
echo "  - typescript"
echo "  - @types/node"
echo "  - @types/react"
echo "  - @types/react-dom"
echo ""
echo "Consulta o ficheiro 'docs/PACKAGE_JSON_FIX.md' para instruções detalhadas."
echo ""
read -p "Já editaste o package.json? (yes/no): " -r EDITED

if [[ ! $EDITED =~ ^[Yy][Ee][Ss]$ ]]; then
  echo ""
  echo "❌ Por favor, edita o package.json primeiro!"
  echo ""
  echo "Podes usar:"
  echo "  nano package.json"
  echo "  ou"
  echo "  code package.json"
  echo ""
  echo "Depois corre este script novamente."
  exit 1
fi

# Step 3: Validate package.json changes
echo ""
echo "🔍 STEP 2: Validar alterações ao package.json"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

DEPS_OK=true

if ! grep -A 20 '"dependencies"' package.json | grep -q '"typescript"'; then
  echo "❌ typescript não está em dependencies"
  DEPS_OK=false
fi

if ! grep -A 20 '"dependencies"' package.json | grep -q '"@types/node"'; then
  echo "❌ @types/node não está em dependencies"
  DEPS_OK=false
fi

if ! grep -A 20 '"dependencies"' package.json | grep -q '"@types/react"'; then
  echo "❌ @types/react não está em dependencies"
  DEPS_OK=false
fi

if ! grep -A 20 '"dependencies"' package.json | grep -q '"@types/react-dom"'; then
  echo "❌ @types/react-dom não está em dependencies"
  DEPS_OK=false
fi

if [[ "$DEPS_OK" == "false" ]]; then
  echo ""
  echo "❌ package.json ainda não está correto!"
  echo "   Consulta docs/PACKAGE_JSON_FIX.md e corrige as dependências."
  exit 1
fi

echo "✅ package.json parece estar correto!"

# Step 4: Update local dependencies
echo ""
echo "📦 STEP 3: Atualizar dependências locais"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "A executar: npm install"
npm install

echo ""
echo "✅ Dependências atualizadas!"

# Step 5: Git status
echo ""
echo "📊 STEP 4: Verificar alterações Git"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

git status --short

# Step 6: Git add and commit
echo ""
echo "💾 STEP 5: Commit das alterações"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

FILES_TO_COMMIT=(
  "package.json"
  "package-lock.json"
  "scripts/Step-4-deploy-tested-build.sh"
  "scripts/apply-deploy-fixes.sh"
  "docs/PACKAGE_JSON_FIX.md"
)

echo "Ficheiros a adicionar ao commit:"
for file in "${FILES_TO_COMMIT[@]}"; do
  if [[ -f "$file" ]]; then
    echo "  ✓ $file"
    git add "$file"
  else
    echo "  ⚠ $file (não encontrado, a saltar)"
  fi
done

echo ""
read -p "Fazer commit agora? (yes/no): " -r DO_COMMIT

if [[ $DO_COMMIT =~ ^[Yy][Ee][Ss]$ ]]; then
  git commit -m "fix(deploy): Resolve dependency issues and enhance service startup check

- Move TypeScript and @types/* to dependencies for Next.js config loading
- Run npm install as rustdeskweb user (not root) to fix ownership issues
- Add 30s wait loop with status feedback for service startup
- Auto-display logs on service failure for easier debugging
- Run PM2 as correct user
- Add --omit=dev flag to npm install in production"

  echo ""
  echo "✅ Commit criado com sucesso!"
else
  echo ""
  echo "⚠ Commit cancelado. Podes fazer manualmente com:"
  echo "   git commit -m 'fix(deploy): Resolve dependency issues...'"
fi

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Deploy Fixes Aplicados!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🚀 Próximos passos:"
echo "   1. Rebuild: ./scripts/Step-2-build-local.sh"
echo "   2. Deploy:  ./scripts/Step-4-deploy-tested-build.sh"
echo ""
echo "📊 Após o deploy, verifica que o warning desapareceu:"
echo "   ssh root@46.101.78.179 'sudo journalctl -u rustdesk-frontend -n 30'"
echo ""
echo "Não deves ver mais:"
echo "   ⚠ Installing TypeScript as it was not found..."
echo ""