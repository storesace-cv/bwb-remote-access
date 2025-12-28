# RustDesk Sync API - Configuração

## 📋 Visão Geral

A **Sync API** é um servidor HTTP local (Node.js + Express) que roda no droplet e executa `sync-devices.sh` **apenas quando solicitado**, eliminando a necessidade de cron jobs constantes.

## 🎯 Por que Sync API?

**PROBLEMA:**
- Edge Functions do Supabase correm na cloud isolada (Deno)
- NÃO têm acesso ao filesystem do droplet
- NÃO conseguem ler `/opt/rustdesk/db_v2.sqlite3` diretamente

**SOLUÇÃO ANTERIOR (Cron Job):**
- ❌ Cron executa `sync-devices.sh` a cada 1 minuto
- ❌ 99.999% do tempo não há dispositivos novos
- ❌ Desperdício de recursos CPU/disco

**SOLUÇÃO ATUAL (Sync API):**
- ✅ API local escuta em `localhost:3001`
- ✅ Edge Function chama API **apenas quando usuário clica em "Verificar Dispositivo"**
- ✅ API executa `sync-devices.sh` on-demand
- ✅ Zero desperdício - só executa quando necessário!

## 🏗️ Arquitetura

```
┌──────────────┐         ┌───────────────────┐         ┌─────────────────┐
│   Frontend   │  HTTP   │  Edge Function    │  HTTP   │  Sync API       │
│   (Browser)  │ ──────> │  (Supabase Cloud) │ ──────> │  (localhost)    │
└──────────────┘         └───────────────────┘         └─────────────────┘
                                                                  │
                                                                  v
                                                          sync-devices.sh
                                                                  │
                                                                  v
                                                          SQLite RustDesk
                                                                  │
                                                                  v
                                                          Supabase DB
```

## 🚀 Instalação

### 1. Executar Script de Instalação

```bash
cd /opt/rustdesk-frontend
sudo bash scripts/install-sync-api.sh
```

O script irá:
- ✅ Instalar dependências Node.js (`express`)
- ✅ Gerar token secreto aleatório
- ✅ Configurar serviço systemd
- ✅ Iniciar API automaticamente
- ✅ Testar funcionamento

### 2. Adicionar Token ao Supabase

**IMPORTANTE:** A API e a Edge Function precisam compartilhar o mesmo token secreto.

1. Copiar o token gerado (exibido no final da instalação)
2. Acessar: [Supabase Dashboard](https://supabase.com/dashboard) > Seu Projeto > Edge Functions
3. Ir em **"Secrets"** ou **"Environment Variables"**
4. Adicionar:
   - **Nome:** `SYNC_API_SECRET`
   - **Valor:** (colar o token)
5. Salvar e fazer deploy das Edge Functions

### 3. Configurar URL (Opcional)

Por padrão, a API escuta em `http://127.0.0.1:3001`.

Se precisar mudar a porta:

```bash
# Editar /opt/rustdesk-frontend/server/.env
sudo nano /opt/rustdesk-frontend/server/.env

# Alterar:
SYNC_API_PORT=3002

# Reiniciar serviço
sudo systemctl restart rustdesk-sync-api
```

Se precisar mudar a URL na Edge Function:

1. Adicionar secret `SYNC_API_URL` no Supabase
2. Valor: `http://127.0.0.1:3001` (ou porta customizada)

## 🔒 Segurança

### Proteções Implementadas

1. **Localhost Only** - API só aceita conexões de `127.0.0.1`
2. **Token Authentication** - Todas as requisições precisam do Bearer token
3. **Rate Limiting** - Máximo 10 requisições por minuto por IP
4. **Timeout** - Execução do script tem timeout de 30 segundos
5. **Buffer Limit** - Output limitado a 10MB para prevenir memory leaks

### Token Secreto

```bash
# Ver token atual
cat /opt/rustdesk-frontend/server/.env

# Gerar novo token
openssl rand -hex 32

# Atualizar manualmente
sudo nano /opt/rustdesk-frontend/server/.env
```

**SEMPRE atualizar o token no Supabase também!**

## 📊 Monitoramento

### Ver Logs em Tempo Real

```bash
# Logs completos
journalctl -u rustdesk-sync-api -f

# Últimas 50 linhas
journalctl -u rustdesk-sync-api -n 50

# Logs de hoje
journalctl -u rustdesk-sync-api --since today
```

### Verificar Status

```bash
# Status do serviço
systemctl status rustdesk-sync-api

# Verificar se está rodando
curl http://127.0.0.1:3001/health
```

### Testar Manualmente

```bash
# Definir token (substituir pelo seu)
TOKEN="seu_token_aqui"

# Executar sync
curl -X POST http://127.0.0.1:3001/sync \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"
```

## 🔧 Comandos Úteis

```bash
# Iniciar serviço
sudo systemctl start rustdesk-sync-api

# Parar serviço
sudo systemctl stop rustdesk-sync-api

# Reiniciar serviço
sudo systemctl restart rustdesk-sync-api

# Habilitar no boot
sudo systemctl enable rustdesk-sync-api

# Desabilitar no boot
sudo systemctl disable rustdesk-sync-api

# Ver configuração do serviço
systemctl cat rustdesk-sync-api
```

## 🐛 Troubleshooting

### API não está iniciando

```bash
# Ver erros detalhados
journalctl -u rustdesk-sync-api -n 100 --no-pager

# Verificar se porta está disponível
netstat -tuln | grep 3001

# Testar manualmente
cd /opt/rustdesk-frontend/server
node sync-api.js
```

### Permissões Negadas

```bash
# API precisa rodar como root para executar sync-devices.sh
# Verificar User no service file
systemctl cat rustdesk-sync-api | grep User

# Deve ser: User=root
```

### Edge Function não consegue conectar

```bash
# 1. Verificar se API está rodando
curl http://127.0.0.1:3001/health

# 2. Verificar token no Supabase
# Dashboard > Edge Functions > Secrets > SYNC_API_SECRET

# 3. Testar com o token correto
TOKEN="$(grep SYNC_API_SECRET /opt/rustdesk-frontend/server/.env | cut -d= -f2)"
curl -X POST http://127.0.0.1:3001/sync \
  -H "Authorization: Bearer $TOKEN"
```

### sync-devices.sh está falhando

```bash
# Executar manualmente para ver erros
cd /opt/rustdesk-frontend
sudo bash scripts/sync-devices.sh

# Verificar logs da API
journalctl -u rustdesk-sync-api -n 50
```

## 📈 Performance

### Recursos Utilizados

- **Memória:** ~30MB em idle, ~50MB durante sync
- **CPU:** <1% em idle, 5-10% durante sync (1-3 segundos)
- **Disco:** Logs em `/var/log/journal/`

### Benchmarks

- Tempo médio de sync: **1-3 segundos**
- Tempo de resposta API: **<100ms** (sem sync)
- Timeout máximo: **30 segundos**

### Otimização

Para projetos com muitos dispositivos:

```bash
# Aumentar timeout no sync-api.js
# Editar linha: timeout: 30000
sudo nano /opt/rustdesk-frontend/server/sync-api.js

# Alterar para 60000 (60 segundos)
timeout: 60000

# Reiniciar
sudo systemctl restart rustdesk-sync-api
```

## 🗑️ Desinstalação

```bash
# Parar e desabilitar serviço
sudo systemctl stop rustdesk-sync-api
sudo systemctl disable rustdesk-sync-api

# Remover service file
sudo rm /etc/systemd/system/rustdesk-sync-api.service
sudo systemctl daemon-reload

# Remover diretório (opcional)
sudo rm -rf /opt/rustdesk-frontend/server

# Remover secret do Supabase
# Dashboard > Edge Functions > Secrets > Delete SYNC_API_SECRET
```

## ✅ Checklist de Verificação

- [ ] API instalada: `systemctl status rustdesk-sync-api`
- [ ] API respondendo: `curl http://127.0.0.1:3001/health`
- [ ] Token configurado: `cat /opt/rustdesk-frontend/server/.env`
- [ ] Secret no Supabase: Dashboard > Edge Functions > Secrets
- [ ] Edge Function atualizada: Última versão do `check-registration-status`
- [ ] Teste end-to-end: Escanear QR + Clicar "Verificar Dispositivo"

## 🆘 Suporte

Se ainda tiver problemas:

1. Verificar logs: `journalctl -u rustdesk-sync-api -n 100`
2. Testar manualmente: `curl -X POST http://127.0.0.1:3001/sync -H "Authorization: Bearer TOKEN"`
3. Verificar Edge Function logs no Supabase Dashboard
4. Confirmar que `sync-devices.sh` funciona standalone: `bash scripts/sync-devices.sh`

## 📚 Documentos Relacionados

- [DEVICE_REGISTRATION_FLOW.md](./DEVICE_REGISTRATION_FLOW.md) - Fluxo completo de registro
- [TESTING_REGISTRATION_FLOW.md](./TESTING_REGISTRATION_FLOW.md) - Como testar
- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) - Deploy geral do sistema