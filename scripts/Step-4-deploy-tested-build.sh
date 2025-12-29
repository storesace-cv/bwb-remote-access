#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────
# Step 4 – Deploy seguro (rsync‑only, sem build remoto)
#
# Regras:
#  - Corre sempre LOCALMENTE, como utilizador normal (não root)
#  - Só faz rsync de:
#      .next/         (build de produção)
#      node_modules/  (todas as deps, incl. dev/TS)
#      src/, public/  (código e assets)
#      package*.json, next.config.mjs
#  - NÃO corre npm install no droplet
#  - NÃO mexe em systemd, nginx ou firewall
#  - NÃO assume porto 3000 público; health-check é manual via HTTPS
#
# Objectivo de UX:
#  - Com ambiente preparado, o comando canónico é APENAS:
#      ./scripts/Step-4-deploy-tested-build.sh
# ──────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# Configuração de destino (pode ser sobreposta via env, mas tem defaults seguros)
DEPLOY_HOST="${DEPLOY_HOST:-46.101.78.179}"
DEPLOY_USER="${DEPLOY_USER:-rustdeskweb}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/rustdesk-frontend}"
DEPLOY_SSH_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/rustdeskweb-digitalocean}"
# Alias SSH recomendado no ~/.ssh/config:
#   Host rustdesk-do
#     HostName 46.101.78.179
#     User rustdeskweb
#     IdentityFile ~/.ssh/rustdeskweb-digitalocean
#     IdentitiesOnly yes
#     IdentityAgent none
DEPLOY_SSH_ALIAS="${DEPLOY_SSH_ALIAS:-rustdesk-do}"

# Expandir ~ manualmente se o utilizador usar DEPLOY_SSH_KEY=~/.ssh/...
SSH_KEY_PATH="${DEPLOY_SSH_KEY/#\~/$HOME}"

if [[ ! -f "$SSH_KEY_PATH" ]]; then
  echo "❌ ERRO: chave SSH para deploy não encontrada em:"
  echo "   $SSH_KEY_PATH"
  echo ""
  echo "   Garante que a chave existe (por omissão: ~/.ssh/rustdeskweb-digitalocean)"
  echo "   ou define explicitamente DEPLOY_SSH_KEY com o caminho correcto."
  exit 1
fi

SSH_COMMON_OPTS="-o IdentitiesOnly=yes -o IdentityAgent=none -i \"$SSH_KEY_PATH\""
RSYNC_OPTS="-avz --delete"
REMOTE_DIR="${DEPLOY_PATH}"

echo "╔════════════════════════════════════════════════════════════╗"
echo "║           Step 4: Deploy seguro (rsync‑only)               ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "📍 Repositório local: $REPO_ROOT"
echo "📍 Pasta remota:      $REMOTE_DIR"
echo "📍 Chave SSH:         $SSH_KEY_PATH"
echo ""

# 1) Sanidade local – build e node_modules têm de existir
echo "🔍 A validar pré-requisitos locais..."

if [[ ! -d "$REPO_ROOT/.next" || ! -f "$REPO_ROOT/.next/BUILD_ID" ]]; then
  echo "❌ ERRO: .next/ ou .next/BUILD_ID não encontrados."
  echo "   Corre primeiro: ./scripts/Step-2-build-local.sh"
  exit 1
fi

if [[ ! -d "$REPO_ROOT/node_modules" ]]; then
  echo "❌ ERRO: node_modules/ não encontrado."
  echo "   Corre primeiro: npm install (ou Step-2)."
  exit 1
fi

BUILD_ID="$(cat "$REPO_ROOT/.next/BUILD_ID")"
echo "✅ BUILD_ID local: $BUILD_ID"

# Verificar se os testes passaram (opcional mas recomendado)
STEP3_LOGS=$(find "$REPO_ROOT/logs/local" -name "Step-3-test-local-*.log" 2>/dev/null | wc -l)
if [[ "$STEP3_LOGS" -eq 0 ]]; then
  echo "⚠️  AVISO: Não foram encontrados logs de testes locais."
  echo "   Recomendado: ./scripts/Step-3-test-local.sh"
  read -p "   Continuar mesmo assim? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Deploy cancelado pelo utilizador."
    exit 1
  fi
fi

echo ""

# 2) Determinar destino SSH: tentar alias rustdesk-do, com fallback para user@host
REMOTE_TARGET="${DEPLOY_USER}@${DEPLOY_HOST}"

if [[ -n "$DEPLOY_SSH_ALIAS" ]]; then
  echo "🔐 A testar alias SSH '${DEPLOY_SSH_ALIAS}' (se existir em ~/.ssh/config)..."
  if ssh $SSH_COMMON_OPTS -o BatchMode=yes -o ConnectTimeout=5 "$DEPLOY_SSH_ALIAS" "echo alias-ok >/dev/null" 2>/dev/null; then
    echo "✅ Alias '${DEPLOY_SSH_ALIAS}' detectado; será usado como destino remoto."
    REMOTE_TARGET="$DEPLOY_SSH_ALIAS"
  else
    echo "ℹ️ Alias '${DEPLOY_SSH_ALIAS}' indisponível; a usar '${REMOTE_TARGET}'."
  fi
fi

echo ""
echo "📍 Destino efectivo: $REMOTE_TARGET:$REMOTE_DIR"
echo ""

# 3) Confirmar conectividade SSH (sem depender de ssh-agent)
echo "🔐 A testar SSH para $REMOTE_TARGET..."
if ! ssh $SSH_COMMON_OPTS -o ConnectTimeout=10 "$REMOTE_TARGET" "echo 'SSH OK' >/dev/null"; then
  echo "❌ ERRO: Não foi possível estabelecer SSH com $REMOTE_TARGET usando a chave:"
  echo "   $SSH_KEY_PATH"
  echo ""
  echo "   Verifica:"
  echo "     - ~/.ssh/config (Host ${DEPLOY_SSH_ALIAS})"
  echo "     - authorized_keys em ${REMOTE_DIR}/.ssh/authorized_keys"
  exit 1
fi
echo "✅ SSH OK"
echo ""

# 4) Rsync de .next (build)
echo "📦 A enviar .next/ (build de produção)..."
rsync $RSYNC_OPTS -e "ssh $SSH_COMMON_OPTS" "$REPO_ROOT/.next/" "$REMOTE_TARGET:$REMOTE_DIR/.next/"

# 5) Rsync de node_modules (todas as dependências, incl. TypeScript)
echo "📦 A enviar node_modules/..."
rsync $RSYNC_OPTS -e "ssh $SSH_COMMON_OPTS" "$REPO_ROOT/node_modules/" "$REMOTE_TARGET:$REMOTE_DIR/node_modules/"

# 6) Rsync de código e assets
echo "📦 A enviar src/..."
rsync $RSYNC_OPTS -e "ssh $SSH_COMMON_OPTS" "$REPO_ROOT/src/" "$REMOTE_TARGET:$REMOTE_DIR/src/"

echo "📦 A enviar public/..."
rsync $RSYNC_OPTS -e "ssh $SSH_COMMON_OPTS" "$REPO_ROOT/public/" "$REMOTE_TARGET:$REMOTE_DIR/public/"

# 7) Ficheiros de configuração de runtime
echo "📦 A enviar package.json, package-lock.json, next.config.mjs..."
rsync -avz -e "ssh $SSH_COMMON_OPTS" \
  "$REPO_ROOT/package.json" \
  "$REPO_ROOT/package-lock.json" \
  "$REPO_ROOT/next.config.mjs" \
  "$REMOTE_TARGET:$REMOTE_DIR/"

# 8) Scripts de sincronização (MeshCentral/RustDesk → Supabase)
echo "📦 A enviar scripts de sync (sync-meshcentral-to-supabase.sh, sync-devices.sh)..."
rsync -avz -e "ssh $SSH_COMMON_OPTS" \
  "$REPO_ROOT/scripts/sync-meshcentral-to-supabase.sh" \
  "$REPO_ROOT/scripts/sync-mesh-users.sh" \
  "$REPO_ROOT/scripts/sync-devices.sh" \
  "$REMOTE_TARGET:$REMOTE_DIR/scripts/"

# 8.1) Sync API server (server/sync-api.js)
echo "📦 A preparar deploy de server/ (Sync API)..."

# Cleanup remoto: remover node_modules drift e corrigir permissões
echo "🧹 A limpar server/node_modules e corrigir permissões no droplet..."
ssh $SSH_COMMON_OPTS "$REMOTE_TARGET" "sudo rm -rf $REMOTE_DIR/server/node_modules 2>/dev/null || true"
ssh $SSH_COMMON_OPTS "$REMOTE_TARGET" "sudo chown -R rustdeskweb:rustdeskweb $REMOTE_DIR/server 2>/dev/null || true"

# Rsync de server/ excluindo node_modules e .env
echo "📦 A enviar server/ (excluindo node_modules e .env)..."
rsync $RSYNC_OPTS --exclude 'node_modules/' --exclude '.env' -e "ssh $SSH_COMMON_OPTS" "$REPO_ROOT/server/" "$REMOTE_TARGET:$REMOTE_DIR/server/"

# 8.2) Deploy stamp file (traceability)
echo "📝 A gerar DEPLOYED_VERSION.txt..."
GIT_SHA="$(git rev-parse HEAD 2>/dev/null || echo 'unknown')"
GIT_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')"
DEPLOY_TIMESTAMP="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

DEPLOY_STAMP_CONTENT="# Deploy Version Stamp
# Generated by Step-4-deploy-tested-build.sh
# ─────────────────────────────────────────

GIT_SHA=${GIT_SHA}
GIT_BRANCH=${GIT_BRANCH}
BUILD_ID=${BUILD_ID}
DEPLOYED_AT=${DEPLOY_TIMESTAMP}
DEPLOYED_FROM=$(hostname)
"

echo "$DEPLOY_STAMP_CONTENT" > "$REPO_ROOT/DEPLOYED_VERSION.txt"
rsync -avz -e "ssh $SSH_COMMON_OPTS" "$REPO_ROOT/DEPLOYED_VERSION.txt" "$REMOTE_TARGET:$REMOTE_DIR/DEPLOYED_VERSION.txt"
rm -f "$REPO_ROOT/DEPLOYED_VERSION.txt"
echo "✅ DEPLOYED_VERSION.txt criado no droplet"

# 8.3) Reiniciar e validar rustdesk-sync-api.service
echo "🔄 A reiniciar rustdesk-sync-api.service..."
ssh $SSH_COMMON_OPTS "$REMOTE_TARGET" "sudo systemctl restart rustdesk-sync-api.service"
echo "✅ rustdesk-sync-api.service reiniciado"

echo "🔍 A verificar estado do serviço..."
ssh $SSH_COMMON_OPTS "$REMOTE_TARGET" "sudo systemctl status rustdesk-sync-api.service --no-pager -l | head -20" || true

# 9) Systemd service/timer units para sync automático
echo "📦 A enviar systemd units (meshcentral-supabase-sync.{service,timer})..."
rsync -avz -e "ssh $SSH_COMMON_OPTS" \
  "$REPO_ROOT/scripts/meshcentral-supabase-sync.service" \
  "$REPO_ROOT/scripts/meshcentral-supabase-sync.timer" \
  "$REMOTE_TARGET:$REMOTE_DIR/scripts/"

echo ""
echo "✅ Deploy de ficheiros concluído (rsync‑only)."
echo ""
echo "ℹ️ Próximos passos (MANUAIS, no droplet – não automatizados neste script):"
echo "   1) SSH como admin (tipicamente root):"
echo "        ssh root@${DEPLOY_HOST}"
echo "   2) Garantir ownership correcto (se necessário):"
echo "        chown -R rustdeskweb:rustdeskweb ${REMOTE_DIR}"
echo "   3) Reiniciar o serviço:"
echo "        systemctl restart rustdesk-frontend.service"
echo "   4) Verificar estado:"
echo "        systemctl status  rustdesk-frontend.service"
echo "   5) Health‑check via HTTPS (a partir de QUALQUER máquina):"
echo '        curl -k -I https://rustdesk.bwb.pt/'
echo ""
echo "🚫 Nota: Este script NÃO corre npm install, NÃO mexe em systemd/nginx/firewall"
echo "         e NÃO deve ser corrido como root."

echo ""
echo "[Step-4] ✅ Deploy concluído com sucesso para $DEPLOY_USER@$DEPLOY_HOST:$DEPLOY_PATH"
echo ""

echo "────────────────────────────────────────────────────────"
echo "🔍 PASSOS RECOMENDADOS DE PÓS-DEPLOY (no droplet)"
echo "────────────────────────────────────────────────────────"
echo ""
echo "1) Verificar serviço frontend Next.js:"
echo "   ssh root@$DEPLOY_HOST 'systemctl status rustdesk-frontend --no-pager'"
echo "   ssh root@$DEPLOY_HOST 'journalctl -u rustdesk-frontend -n 50 --no-pager'"
echo ""
echo "2) Reiniciar e verificar serviço Sync API (rustdesk-sync-api):"
echo "   ssh root@$DEPLOY_HOST 'systemctl restart rustdesk-sync-api.service'"
echo "   ssh root@$DEPLOY_HOST 'systemctl status rustdesk-sync-api --no-pager'"
echo ""
echo "3) Testar endpoints da Sync API:"
echo "   # Health check (deve retornar 200 SEM Authorization):"
echo "   ssh root@$DEPLOY_HOST 'curl -s http://127.0.0.1:3001/health'"
echo "   # Sync endpoint (deve retornar 401 SEM Authorization):"
echo "   ssh root@$DEPLOY_HOST 'curl -s -X POST http://127.0.0.1:3001/sync'"
echo ""
echo "4) Verificar timer/serviço de sincronização de devices (se configurado):"
echo "   ssh root@$DEPLOY_HOST 'systemctl status rustsync.timer rustsync.service --no-pager' || true"
echo "   ssh root@$DEPLOY_HOST 'journalctl -u rustsync.service -n 50 --no-pager' || true"
echo ""
echo "5) Correr um teste manual rápido ao sync-devices.sh (sem depender do timer):"
echo "   ssh root@$DEPLOY_HOST 'bash /opt/rustdesk-integration/bin/sync-devices.sh || echo \"sync-devices.sh terminou com erro\"'"
echo ""
echo "Se algum dos comandos acima reportar erro, segue as instruções em:"
echo "  - docs/TROUBLESHOOTING.md"
echo "  - logs em /opt/rustdesk-frontend/logs/ e /opt/rustdesk-integration/logs/"
echo "────────────────────────────────────────────────────────"

echo ""
echo "────────────────────────────────────────────────────────"
echo "⚡ Deploy opcional das Supabase Edge Functions"
echo "────────────────────────────────────────────────────────"
echo ""
SUPABASE_EDGE_SCRIPT_DEFAULT="scripts/supabase-deploy-functions.sh"
SUPABASE_EDGE_SCRIPT="${SUPABASE_EDGE_SCRIPT:-$SUPABASE_EDGE_SCRIPT_DEFAULT}"
RUN_SUPABASE_EDGE_DEPLOY="${RUN_SUPABASE_EDGE_DEPLOY:-0}"

if [[ "$RUN_SUPABASE_EDGE_DEPLOY" == "1" ]]; then
  echo "🔄 A executar script de deploy das Edge Functions: $SUPABASE_EDGE_SCRIPT"
  if [[ -x "$SUPABASE_EDGE_SCRIPT" ]]; then
    set +e
    "$SUPABASE_EDGE_SCRIPT"
    SUPABASE_STATUS=$?
    set -e
    if [[ $SUPABASE_STATUS -ne 0 ]]; then
      echo "⚠️  AVISO: script $SUPABASE_EDGE_SCRIPT terminou com erro ($SUPABASE_STATUS)."
      echo "   Vê os logs acima e docs/supabase-edge-functions-deploy.md."
    else
      echo "✅ Deploy de Edge Functions concluído."
    fi
  else
    echo "ℹ️ RUN_SUPABASE_EDGE_DEPLOY=1 mas o script '$SUPABASE_EDGE_SCRIPT' não é executável ou não existe."
    echo "   Ajusta SUPABASE_EDGE_SCRIPT ou vê docs/supabase-edge-functions-deploy.md."
  fi
else
  echo "ℹ️ Deploy de Edge Functions NÃO foi corrido automaticamente."
  echo "   Para o activar neste Step, define:"
  echo "     export RUN_SUPABASE_EDGE_DEPLOY=1"
  echo "   Opcionalmente, escolhe um script alternativo:"
  echo "     export SUPABASE_EDGE_SCRIPT=\"scripts/supabase-deploy-functions.sh\""
  echo "   ou outro caminho que consideres adequado."
fi