#!/bin/bash
#
# Diagnóstico rápido do estado do droplet
#
set -euo pipefail

DROPLET_USER="${DROPLET_USER:-root}"
DROPLET_HOST="${DROPLET_HOST:-46.101.78.179}"

echo "🔍 Diagnóstico do Droplet"
echo "========================"
echo ""
echo "🎯 Conectando a: $DROPLET_USER@$DROPLET_HOST"
echo ""

echo "📂 Verificando estrutura de diretórios..."
echo ""

ssh "$DROPLET_USER@$DROPLET_HOST" << 'ENDSSH'
echo "1️⃣  Procurando por 'rustdesk' em /opt/:"
find /opt -name "*rustdesk*" -type d 2>/dev/null || echo "   ❌ Nenhum diretório encontrado"
echo ""

echo "2️⃣  Verificando /opt/rustdesk-integration/:"
if [[ -d /opt/rustdesk-integration ]]; then
  echo "   ✅ Diretório existe!"
  echo "   📁 Conteúdo:"
  ls -la /opt/rustdesk-integration/ || true
else
  echo "   ❌ Diretório NÃO existe"
fi
echo ""

echo "3️⃣  Verificando /opt/meshcentral/:"
if [[ -d /opt/meshcentral ]]; then
  echo "   ✅ Diretório existe!"
else
  echo "   ❌ Diretório NÃO existe"
fi
echo ""

echo "4️⃣  Verificando /opt/rustdesk/:"
if [[ -d /opt/rustdesk ]]; then
  echo "   ✅ Diretório existe!"
else
  echo "   ❌ Diretório NÃO existe"
fi
echo ""

echo "5️⃣  Verificando cron jobs ativos:"
crontab -l 2>/dev/null | grep -i rustdesk || echo "   ❌ Nenhum cron job do rustdesk encontrado"
echo ""

echo "6️⃣  Verificando serviços systemd relacionados:"
systemctl list-units --type=service --all | grep -i rustdesk || echo "   ❌ Nenhum serviço encontrado"
echo ""

echo "7️⃣  Verificando processos Node.js/Next.js:"
ps aux | grep -E "(node|next)" | grep -v grep || echo "   ❌ Nenhum processo Node.js encontrado"
echo ""

echo "8️⃣  Espaço em disco:"
df -h /opt 2>/dev/null || df -h /
echo ""

echo "9️⃣  Verificando se sync-devices.sh existe em algum lugar:"
find /opt -name "sync-devices.sh" 2>/dev/null || echo "   ❌ Script não encontrado em /opt"
echo ""

echo "🔟  Verificando usuários do sistema:"
echo "   Current user: $(whoami)"
echo "   Home directory: $HOME"
ENDSSH

echo ""
echo "✅ Diagnóstico completo!"
echo ""
echo "📋 Próximos passos baseados nos resultados acima:"
echo ""
echo "Se /opt/rustdesk-integration NÃO existe:"
echo "  → Execute: ./scripts/droplet-full-install.sh"
echo ""
echo "Se /opt/rustdesk-integration existe mas sem 'scripts/':"
echo "  → Execute: ssh root@46.101.78.179 'mkdir -p /opt/rustdesk-integration/scripts'"
echo "  → Depois: ./scripts/deploy-sync-script.sh"