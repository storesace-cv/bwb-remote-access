# Configuração do Cron Job para Sincronização

## 📋 Visão Geral

O sistema usa um **cron job** que executa `sync-devices.sh` a cada 30 segundos para sincronizar dispositivos RustDesk com o Supabase.

## 🎯 Por que Cron Job?

**PROBLEMA:**
- Edge Functions do Supabase correm na cloud (Deno isolado)
- NÃO têm acesso ao filesystem do droplet
- NÃO conseguem ler `/opt/rustdesk/db_v2.sqlite3`
- NÃO conseguem fazer requests HTTP para localhost do droplet

**SOLUÇÃO:**
- Script local (`sync-devices.sh`) roda NO droplet via cron
- Lê SQLite do RustDesk diretamente
- Sincroniza para Supabase via REST API
- Edge Functions apenas consultam tabela Supabase

## 🚀 Instalação

### 1. Instalar Cron Job

```bash
cd /opt/rustdesk-frontend/scripts
sudo bash install-cron-sync.sh
```

O script irá:
- ✅ Verificar se `sync-devices.sh` existe
- ✅ Tornar executável
- ✅ Verificar se cron está instalado
- ✅ Adicionar 2 entradas no crontab (para executar a cada 30s)
- ✅ Configurar log em `/var/log/rustdesk-sync.log`

### 2. Verificar Instalação

```bash
# Ver cron jobs ativos
crontab -l

# Deve aparecer 2 linhas:
# * * * * * /opt/rustdesk-frontend/scripts/sync-devices.sh >> /var/log/rustdesk-sync.log 2>&1
# * * * * * sleep 30; /opt/rustdesk-frontend/scripts/sync-devices.sh >> /var/log/rustdesk-sync.log 2>&1
```

### 3. Monitorar Logs

```bash
# Logs em tempo real
sudo tail -f /var/log/rustdesk-sync.log

# Ver últimas 50 linhas
sudo tail -n 50 /var/log/rustdesk-sync.log
```

## 🔧 Configuração

### Variáveis de Ambiente

O script lê de `/opt/meshcentral/meshcentral-data/sync-env.sh`:

```bash
export SUPABASE_URL="https://kqwaibgvmzcqeoctukoy.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="sua_service_role_key"
export SUPABASE_ANON_KEY="sua_anon_key"
export RUSTDESK_DB="/opt/rustdesk/db_v2.sqlite3"
```

### Frequência de Sincronização

**Padrão:** A cada 30 segundos

Para alterar:
```bash
crontab -e

# Para executar a cada 15 segundos (4x por minuto):
* * * * * /opt/scripts/sync-devices.sh >> /var/log/rustdesk-sync.log 2>&1
* * * * * sleep 15; /opt/scripts/sync-devices.sh >> /var/log/rustdesk-sync.log 2>&1
* * * * * sleep 30; /opt/scripts/sync-devices.sh >> /var/log/rustdesk-sync.log 2>&1
* * * * * sleep 45; /opt/scripts/sync-devices.sh >> /var/log/rustdesk-sync.log 2>&1

# Para executar a cada 1 minuto:
* * * * * /opt/scripts/sync-devices.sh >> /var/log/rustdesk-sync.log 2>&1
```

## 📊 Fluxo de Funcionamento

```
┌─────────────────────────────────────────────────────────────┐
│  1. Usuário clica "Adicionar Dispositivo" no frontend       │
│  2. Frontend cria sessão de registro no Supabase            │
│  3. Usuário escaneia QR code no Android                     │
│  4. RustDesk Server grava em /opt/rustdesk/db_v2.sqlite3   │
│  5. Cron executa sync-devices.sh (a cada 30 segundos)       │
│  6. Script lê SQLite e sincroniza para Supabase             │
│  7. Usuário clica "Verificar Dispositivo" no frontend       │
│  8. Edge Function verifica tabela Supabase                  │
│  9. Faz temporal matching (dispositivo + sessão)            │
│ 10. Dispositivo detectado! ✅                                │
└─────────────────────────────────────────────────────────────┘
```

## 🐛 Troubleshooting

### Cron não está executando

```bash
# Verificar se cron está ativo
sudo systemctl status cron

# Iniciar cron se parado
sudo systemctl start cron

# Habilitar cron no boot
sudo systemctl enable cron
```

### Permissões de Acesso

```bash
# Script precisa ser executável
sudo chmod +x /opt/rustdesk-frontend/scripts/sync-devices.sh

# Verificar permissões do SQLite
ls -la /opt/rustdesk/db_v2.sqlite3

# Adicionar user ao grupo rustdesk (se necessário)
sudo usermod -aG rustdesk $(whoami)
```

### Logs Vazios

```bash
# Criar arquivo de log manualmente
sudo touch /var/log/rustdesk-sync.log
sudo chmod 666 /var/log/rustdesk-sync.log

# Testar script manualmente
sudo /opt/rustdesk-frontend/scripts/sync-devices.sh
```

### Verificar Dependências

```bash
# sqlite3
which sqlite3
sudo apt-get install sqlite3

# jq
which jq
sudo apt-get install jq

# curl
which curl
sudo apt-get install curl
```

## 🗑️ Desinstalação

```bash
# Remover cron job
crontab -e
# Apagar as 2 linhas: * * * * * /opt/rustdesk-frontend/scripts/sync-devices.sh...

# Ou remover todos os cron jobs
crontab -r

# Remover log
sudo rm /var/log/rustdesk-sync.log
```

## 📈 Performance

- **CPU:** ~1-2% durante execução (dura 1-3 segundos)
- **Memória:** ~10-20MB durante execução
- **Disco:** Log cresce ~1KB por execução (~2.8MB/dia com execução a cada 30s)
- **Frequência:** 2x por minuto = 2880 execuções/dia

### Rotação de Logs (Recomendado)

Criar `/etc/logrotate.d/rustdesk-sync`:

```
/var/log/rustdesk-sync.log {
    daily
    rotate 7
    compress
    missingok
    notifempty
}
```

## ✅ Checklist de Verificação

- [ ] Cron job instalado: `crontab -l` (deve mostrar 2 linhas)
- [ ] Script executável: `ls -la /opt/rustdesk-frontend/scripts/sync-devices.sh`
- [ ] Logs sendo gerados: `tail /var/log/rustdesk-sync.log`
- [ ] SQLite acessível: `sqlite3 /opt/rustdesk/db_v2.sqlite3 "SELECT 1;"`
- [ ] Variáveis configuradas: `cat /opt/meshcentral/meshcentral-data/sync-env.sh`
- [ ] Supabase acessível: `curl -I https://kqwaibgvmzcqeoctukoy.supabase.co`
- [ ] Executando a cada 30s: monitorar logs por 1 minuto

## 🆘 Suporte

Se ainda tiver problemas:

1. Verificar logs completos: `sudo cat /var/log/rustdesk-sync.log`
2. Executar script manualmente: `bash -x /opt/rustdesk-frontend/scripts/sync-devices.sh`
3. Verificar conectividade Supabase: `curl -v $SUPABASE_URL/rest/v1/`
4. Verificar se o cron está a executar: `grep sync-devices /var/log/syslog`