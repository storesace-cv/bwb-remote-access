# Deployment Guide - RustDesk Mesh Integration

**Versão:** 1.0.0  
**Última Atualização:** 13 Dezembro 2025

Guia completo de deployment para ambiente de produção.

## 📋 Visão Geral

Pipeline de deployment automatizado em 4 etapas com validações completas e rollback automático em caso de falha.

---

## 🏗️ Arquitectura de Deployment

```
┌────────────────┐
│ Local Machine  │
│ (macOS/Linux)  │
└────────┬───────┘
         │
         ↓
  ┌─────────────┐
  │   Step 1    │  Download from GitHub main
  │   Step 2    │  Build locally with validations
  │   Step 3    │  Run tests (lint + unit)
  │   Step 4    │  Deploy to production
  └─────────────┘
         │
         ↓
┌────────────────────┐
│ Production Droplet │
│ 46.101.78.179      │
│ DigitalOcean       │
└────────┬───────────┘
         │
         ↓
    ┌────────┐
    │ NGINX  │  Reverse Proxy
    │  :443  │  SSL/TLS
    └────┬───┘
         │
         ↓
  rustdesk.bwb.pt
```

---

## ✅ Pré-requisitos

### Local Machine

- **Sistema Operacional:** macOS ou Linux
- **Git:** 2.x+
- **Node.js:** 18.x+ (matching production)
- **npm:** Latest version
- **SSH:** Access configured
- **rsync:** Instalado

### Production Server

- **OS:** Ubuntu 20.04 LTS
- **User:** rustdeskweb (non-root)
- **Directory:** /opt/rustdesk-frontend
- **Service:** systemd (rustdesk-frontend.service)
- **Node.js:** 18.x
- **NGINX:** Configurado como reverse proxy
- **Firewall:** Portas 80/443 abertas

### Credentials

**SSH Access:**
```bash
# Adicionar chave SSH ao servidor
ssh-copy-id root@46.101.78.179
```

**Environment Variables:**
- `.env.local` no repositório
- Contém SUPABASE_URL e SUPABASE_ANON_KEY

---

## 🚀 Pipeline de Deployment

### Step 1: Download from GitHub

**Script:** `./scripts/Step-1-download-from-main.sh`

**O que faz:**
1. Fetch latest changes from origin/main
2. Reset local branch to match remote
3. Clean untracked files
4. Validate repository state

**Variáveis de Ambiente:**
```bash
BRANCH_LOCAL="my-rustdesk-mesh-integration"  # Local branch name
BRANCH_REMOTE="main"                          # Remote branch name
ALLOW_DIRTY_RESET="0"                        # Allow uncommitted changes
```

**Execução:**
```bash
# Normal flow
./scripts/Step-1-download-from-main.sh

# Force reset (sobrescrever alterações locais)
ALLOW_DIRTY_RESET=1 ./scripts/Step-1-download-from-main.sh
```

**Validações:**
- ✅ Git repository válido
- ✅ Branch remoto existe
- ✅ Sem alterações locais (a menos que ALLOW_DIRTY_RESET=1)
- ✅ .git/HEAD válido

**Log Output:**
```
logs/local/Step-1-download-from-main-YYYYMMDD-HHMMSS.log
```

**Exit Codes:**
- `0` - Sucesso
- `1` - Git não encontrado
- `2` - Branch não existe
- `3` - Alterações locais não commitadas

---

### Step 2: Build Locally

**Script:** `./scripts/Step-2-build-local.sh`

**O que faz:**
1. Valida .env.local existe
2. Valida variáveis Supabase
3. Valida directórios source
4. Instala dependencies (npm ci)
5. Executa build production
6. Valida .next/ gerado

**Execução:**
```bash
./scripts/Step-2-build-local.sh
```

**Validações Críticas:**

**Ambiente:**
```bash
# .env.local deve existir
[ -f .env.local ]

# Variáveis obrigatórias
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

**Source Directories:**
```bash
src/integrations/supabase/
src/lib/
src/services/
src/app/
```

**Build Output:**
```bash
# .next/ deve ser criado
[ -d .next ]

# BUILD_ID deve existir
[ -f .next/BUILD_ID ]

# Deve ter >100 ficheiros
find .next -type f | wc -l  # > 100
```

**Log Output:**
```
logs/local/Step-2-build-local-YYYYMMDD-HHMMSS.log
```

**Exit Codes:**
- `0` - Build sucesso
- `1` - .env.local em falta
- `2` - Variáveis Supabase em falta
- `3` - Directórios source em falta
- `4` - npm ci falhou
- `5` - npm run build falhou
- `6` - .next/ inválido

---

### Step 3: Test Locally

**Script:** `./scripts/Step-3-test-local.sh`

**O que faz:**
1. Executa ESLint
2. Executa unit tests
3. Valida TypeScript compila

**Execução:**
```bash
./scripts/Step-3-test-local.sh
```

**Testes Executados:**

**ESLint:**
```bash
npm run lint
```

**Unit Tests:**
```bash
npm test  # tsx tests/grouping.test.ts
```

**TypeScript:**
```bash
npx tsc --noEmit
```

**Log Output:**
```
logs/local/Step-3-test-local-YYYYMMDD-HHMMSS.log
```

**Exit Codes:**
- `0` - Todos os testes passam
- `1` - ESLint falhou
- `2` - Unit tests falharam
- `3` - TypeScript errors

---

### Step 4: Deploy to Production

**Script:** `./scripts/Step-4-deploy-tested-build.sh`

**O que faz (versão actual, rsync‑only):**
1. Valida que `.next/` e `node_modules/` existem localmente
2. Valida que a chave SSH configurada existe
3. Testa conectividade SSH ao utilizador de deploy
4. Transfere ficheiros via `rsync` com chave dedicada:
   - `.next/` (build de produção)
   - `node_modules/` (todas as dependências, incl. TypeScript)
   - `src/`, `public/`
   - `package.json`, `package-lock.json`, `next.config.mjs`
5. **Não** corre `npm install` no droplet
6. **Não** mexe em `systemd`, `nginx` ou firewall
7. Imprime instruções para o operador reiniciar o serviço manualmente no droplet

**Variáveis de Ambiente (novas, para destino remoto e chave SSH):**
```bash
DEPLOY_HOST=46.101.78.179
DEPLOY_USER=rustdeskweb
DEPLOY_PATH=/opt/rustdesk-frontend
DEPLOY_SSH_KEY=~/.ssh/rustdeskweb-digitalocean
```

O script força sempre o uso da chave configurada e desactiva o `ssh-agent`:

- `-o IdentitiesOnly=yes`
- `-o IdentityAgent=none`
- `-i "$DEPLOY_SSH_KEY"`

Isto garante que o comportamento do Step‑4 é determinístico e nunca depende de chaves carregadas no agente SSH da máquina local.

> ⚠️ Nota: O utilizador `rustdeskweb` tem `HOME=/opt/rustdesk-frontend`, por isso as chaves são lidas de `/opt/rustdesk-frontend/.ssh/authorized_keys`.

**Execução:**
```bash
./scripts/Step-4-deploy-tested-build.sh
```

**Fases do Deploy:**

#### Fase 1: Validação Local
```bash
# Verificar .next/ existe
[ -d .next ]

# Verificar BUILD_ID
[ -f .next/BUILD_ID ]

# Contar ficheiros (.next/ deve ter >100)
find .next -type f | wc -l
```

#### Fase 2: Conectividade
```bash
# Testar SSH
ssh $REMOTE_HOST 'echo OK'

# Verificar directório remoto
ssh $REMOTE_HOST "test -d $REMOTE_DIR || mkdir -p $REMOTE_DIR"
```

#### Fase 3: Transferência de Ficheiros

**rsync de Config Files:**
```bash
rsync -avz --progress \
  package.json package-lock.json \
  next.config.ts tsconfig.json \
  .env.local \
  $REMOTE_HOST:$REMOTE_DIR/
```

**rsync de Source Code:**
```bash
rsync -avz --progress --delete \
  src/ \
  $REMOTE_HOST:$REMOTE_DIR/src/
```

**rsync de Build Artifacts:**
```bash
rsync -avz --progress --delete \
  .next/ \
  $REMOTE_HOST:$REMOTE_DIR/.next/
```

**rsync de Public Assets:**
```bash
rsync -avz --progress \
  public/ \
  $REMOTE_HOST:$REMOTE_DIR/public/
```

**rsync de Scripts:**
```bash
rsync -avz --progress \
  scripts/ \
  $REMOTE_HOST:$REMOTE_DIR/scripts/
```

**rsync de Runtime Files:**
```bash
rsync -avz \
  start.sh .env.production \
  $REMOTE_HOST:$REMOTE_DIR/
```

#### Fase 4: Validação Pós-Transfer

```bash
# Verificar .next/ no servidor
ssh $REMOTE_HOST "test -d $REMOTE_DIR/.next"

# Verificar BUILD_ID match
LOCAL_BUILD_ID=$(cat .next/BUILD_ID)
REMOTE_BUILD_ID=$(ssh $REMOTE_HOST "cat $REMOTE_DIR/.next/BUILD_ID")
[ "$LOCAL_BUILD_ID" = "$REMOTE_BUILD_ID" ]

# Contar ficheiros remotos
REMOTE_COUNT=$(ssh $REMOTE_HOST "find $REMOTE_DIR/.next -type f | wc -l")
[ $REMOTE_COUNT -gt 100 ]
```

#### Fase 5: Fix Permissions

```bash
ssh $REMOTE_HOST "sudo chown -R $FRONTEND_USER:$FRONTEND_USER $REMOTE_DIR"
```

#### Fase 6: Install Dependencies

```bash
ssh $REMOTE_HOST "cd $REMOTE_DIR && sudo -u $FRONTEND_USER npm install --omit=dev --quiet"
```

#### Fase 7: Restart Service

```bash
# Stop service
ssh $REMOTE_HOST "sudo systemctl stop rustdesk-frontend.service"

# Start service
ssh $REMOTE_HOST "sudo systemctl start rustdesk-frontend.service"

# Aguardar service active (timeout 30s)
for i in {1..10}; do
  STATUS=$(ssh $REMOTE_HOST "systemctl is-active rustdesk-frontend")
  [ "$STATUS" = "active" ] && break
  sleep 3
done
```

#### Fase 8: Health Checks

**Service Active Check:**
```bash
ssh $REMOTE_HOST "systemctl is-active rustdesk-frontend" | grep "active"
```

**HTTP Response Check:**
```bash
# Aguardar HTTP 200 ou 307 (redirect)
for i in {1..12}; do
  RESPONSE=$(ssh $REMOTE_HOST "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000")
  [[ "$RESPONSE" =~ ^(200|307)$ ]] && break
  sleep 5
done
```

**Port Listening Check:**
```bash
ssh $REMOTE_HOST "netstat -tlnp | grep ':3000.*LISTEN'"
```

**Log Deployment History:**
```bash
ssh $REMOTE_HOST "echo '$(date -u +"%Y-%m-%d %H:%M:%S UTC") | BUILD_ID: $BUILD_ID | Status: SUCCESS' >> $REMOTE_DIR/deployment-history.log"
```

**Log Output:**
```
logs/deploy/Step-4-deploy-tested-build-YYYYMMDD-HHMMSS.log
```

**Exit Codes:**
- `0` - Deploy sucesso
- `1` - Validação local falhou
- `2` - SSH não conecta
- `3` - rsync falhou
- `4` - Validação remota falhou
- `5` - Permissões falharam
- `6` - npm install falhou
- `7` - Service restart falhou
- `8` - Health checks falharam

---

## 📊 Monitorização

### Health Checks Automáticos

Durante deploy, verifica:
1. Service está active
2. HTTP responde (200 ou 307)
3. Port 3000 listening

### Logs de Deployment

**Local:**
```bash
# Última tentativa
cat logs/deploy/Step-4-deploy-tested-build-*.log | tail -100

# Todos os deploys de hoje
ls -lt logs/deploy/Step-4-deploy-tested-build-$(date +%Y%m%d)*.log
```

**Remote:**
```bash
# Histórico de deploys
ssh root@46.101.78.179 'cat /opt/rustdesk-frontend/deployment-history.log'

# Últimos 20 deploys
ssh root@46.101.78.179 'tail -20 /opt/rustdesk-frontend/deployment-history.log'
```

### Service Status

```bash
# Status do serviço
ssh root@46.101.78.179 'systemctl status rustdesk-frontend'

# Logs em tempo real
ssh root@46.101.78.179 'journalctl -u rustdesk-frontend -f'

# Últimos 50 logs
ssh root@46.101.78.179 'journalctl -u rustdesk-frontend -n 50'

# Logs de hoje
ssh root@46.101.78.179 'journalctl -u rustdesk-frontend --since today'
```

---

## 🔄 Rollback

### Quando Fazer Rollback

- Deploy falhou mas service não volta ao anterior
- Nova versão tem bugs críticos
- Health checks falharam mas service rodando

### Processo de Rollback

**Opção 1: Git-based Rollback**

```bash
# 1. Encontrar commit bom
git log --oneline -10

# 2. Reset para commit anterior
git reset --hard <commit-hash>

# 3. Rebuild e redeploy
./scripts/Step-2-build-local.sh
./scripts/Step-4-deploy-tested-build.sh
```

**Opção 2: Backup-based Rollback**

```bash
# 1. Listar backups
ssh root@46.101.78.179 'ls -lt /opt/rustdesk-frontend/.next.backup-*'

# 2. Restaurar backup
ssh root@46.101.78.179 'sudo systemctl stop rustdesk-frontend'
ssh root@46.101.78.179 'sudo rm -rf /opt/rustdesk-frontend/.next'
ssh root@46.101.78.179 'sudo cp -r /opt/rustdesk-frontend/.next.backup-YYYYMMDD-HHMMSS /opt/rustdesk-frontend/.next'
ssh root@46.101.78.179 'sudo chown -R rustdeskweb:rustdeskweb /opt/rustdesk-frontend'
ssh root@46.101.78.179 'sudo systemctl start rustdesk-frontend'
```

### Criar Backup Antes de Deploy

```bash
# Automatizar backup no script
ssh root@46.101.78.179 "sudo cp -r $REMOTE_DIR/.next $REMOTE_DIR/.next.backup-$(date +%Y%m%d-%H%M%S)"
```

---

## 🔒 Segurança

### SSH Key Setup

```bash
# Gerar chave SSH (se não tiver)
ssh-keygen -t ed25519 -C "deploy@rustdesk"

# Copiar para servidor
ssh-copy-id root@46.101.78.179

# Testar
ssh root@46.101.78.179 'echo OK'
```

### Firewall Configuration

```bash
# Verificar portas abertas
ssh root@46.101.78.179 'ufw status'

# Deve ter:
# 22/tcp (SSH)
# 80/tcp (HTTP)
# 443/tcp (HTTPS)
```

### File Permissions

```bash
# Correctas permissions
ssh root@46.101.78.179 'ls -la /opt/rustdesk-frontend'

# Deve mostrar:
# Owner: rustdeskweb
# Group: rustdeskweb
# Permissions: rwxr-xr-x
```

---

## 🛠️ Troubleshooting

Ver [TROUBLESHOOTING.md](TROUBLESHOOTING.md) para guia completo.

### Quick Fixes

**Deploy falhou no Step 4:**
```bash
# 1. Colectar logs
./scripts/Step-5-collect-error-logs.sh

# 2. Ver último erro
cat logs/deploy/Step-4-deploy-tested-build-*.log | grep -i error

# 3. Tentar novamente
./scripts/Step-4-deploy-tested-build.sh
```

**Service não inicia:**
```bash
# Ver erro específico
ssh root@46.101.78.179 'journalctl -u rustdesk-frontend -n 20'

# Tentar start manual
ssh root@46.101.78.179 'cd /opt/rustdesk-frontend && sudo -u rustdeskweb npm start'
```

**Health checks timeout:**
```bash
# Verificar se app responde
ssh root@46.101.78.179 'curl -v http://127.0.0.1:3000'

# Verificar logs de app
ssh root@46.101.78.179 'tail -50 /opt/rustdesk-frontend/logs/app-debug.log'
```

---

## 📋 Checklist de Deploy

### Antes de Começar

- [ ] Código testado localmente
- [ ] .env.local actualizado
- [ ] Alterações commitadas
- [ ] Branch sincronizado com remote
- [ ] SSH access funcional

### Durante Deploy

- [ ] Step 1 completo (download)
- [ ] Step 2 completo (build)
- [ ] Step 3 completo (tests)
- [ ] Step 4 completo (deploy)
- [ ] Health checks passam

### Após Deploy

- [ ] Testar login
- [ ] Testar dashboard
- [ ] Testar adicionar device
- [ ] Verificar logs sem erros
- [ ] Actualizar deployment history

### Em Caso de Problema

- [ ] Colectar logs (Step 5)
- [ ] Análise de root cause
- [ ] Rollback se necessário
- [ ] Documentar issue
- [ ] Fix e redeploy

---

## 🎯 Boas Práticas

### Deploy Frequency

- **Development:** Múltiplos por dia
- **Staging:** Diário
- **Production:** 1-2x por semana

### Deploy Timing

**Melhor:**
- Terça a Quinta
- 10:00 - 16:00 (horário comercial)
- Quando equipa disponível

**Evitar:**
- Segunda (início de semana)
- Sexta tarde (fim de semana)
- Fora do horário comercial
- Vésperas de feriados

### Communication

Antes de deploy crítico:
1. Notificar equipa
2. Preparar rollback plan
3. Ter pessoa de suporte disponível
4. Comunicar aos utilizadores (se downtime)

---

## 📊 Métricas de Deploy

### Medir Sucesso

**Deploy Success Rate:**
```bash
# Últimos 10 deploys
grep -c "Status: SUCCESS" /opt/rustdesk-frontend/deployment-history.log | tail -10
```

**Average Deploy Time:**
- Step 1: ~30 segundos
- Step 2: ~2-3 minutos
- Step 3: ~30 segundos
- Step 4: ~3-5 minutos
- **Total:** ~7-10 minutos

**Downtime:**
- Target: <30 segundos
- Actual: ~10-20 segundos (restart service)

---

## 🤖 CI/CD para Edge Functions

### Automação de Deployment

**Status:** ✅ Implementado (GitHub Actions)

O sistema agora inclui deployment automatizado de Edge Functions via GitHub Actions.

### Workflows Disponíveis

#### 1. Edge Functions Deploy (`.github/workflows/edge-functions-deploy.yml`)

**Trigger:**
- Push para `main` que modifique `supabase/functions/**`
- Pull Request (validação apenas)
- Manual (`workflow_dispatch`)

**Etapas:**
1. **Detect Changes** - Identifica Edge Functions modificadas
2. **Validate** - Valida sintaxe TypeScript e CORS headers
3. **Deploy** - Deploy para Supabase (apenas em push para main)
4. **Verify** - Verifica deployment bem-sucedido

**Exemplo de Output:**
```
✅ Detected changes: admin-create-auth-user, admin-delete-auth-user
✅ TypeScript validation passed
✅ Deploying admin-create-auth-user... SUCCESS
✅ Deploying admin-delete-auth-user... SUCCESS
✅ Verification passed: All functions deployed
```

#### 2. Edge Functions Verify (`.github/workflows/edge-functions-verify.yml`)

**Trigger:**
- Cron diário (09:00 UTC)
- Manual (`workflow_dispatch`)

**Propósito:**
- Verifica que todas as Edge Functions locais estão deployed
- Detecta drift entre repo e Supabase
- Alerta se funções não estão deployed

---

### Scripts de Deployment

#### Verificação Local: `scripts/verify-edge-functions.sh`

**Uso:**
```bash
# Verificar status
export SUPABASE_PROJECT_REF=your-project-ref
./scripts/verify-edge-functions.sh
```

**Output:**
```
✓ admin-create-auth-user (deployed)
✓ admin-delete-auth-user (deployed)
✗ new-function (NOT DEPLOYED)

Summary:
  Deployed: 23/24
  Missing:  1

To deploy missing functions, run:
  supabase functions deploy new-function --project-ref xxx
```

#### Deployment em Batch: `scripts/deploy-edge-functions.sh`

**Uso:**
```bash
# Deploy todas as funções
./scripts/deploy-edge-functions.sh

# Dry run (simular)
./scripts/deploy-edge-functions.sh --dry-run

# Deploy função específica
./scripts/deploy-edge-functions.sh --function admin-create-auth-user
```

**Features:**
- ✅ Validação pré-deployment (sintaxe, CORS)
- ✅ Deployment em batch ou individual
- ✅ Verificação pós-deployment
- ✅ Logs detalhados em `logs/edge-functions/`
- ✅ Rollback em caso de falha

---

### Configuração de Secrets (GitHub)

**Necessário no repositório:**

```yaml
# Settings → Secrets and variables → Actions

SUPABASE_PROJECT_REF: "your-project-ref-here"
SUPABASE_ACCESS_TOKEN: "sbp_xxx_your_token_here"
```

**Como obter:**
1. **Project Ref:** Dashboard → Settings → General → Reference ID
2. **Access Token:** Dashboard → Account → Access Tokens → Generate new token

---

### Workflow de Desenvolvimento

#### Cenário 1: Criar Nova Edge Function

```bash
# 1. Criar função localmente
mkdir -p supabase/functions/new-function
cat > supabase/functions/new-function/index.ts <<EOF
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  return new Response(JSON.stringify({ success: true }), {
    headers: { 
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  })
})
EOF

# 2. Validar localmente
deno check supabase/functions/new-function/index.ts

# 3. Commit e push
git add supabase/functions/new-function/
git commit -m "feat(edge-functions): add new-function"
git push origin main

# 4. GitHub Actions automaticamente:
#    - Detecta mudança
#    - Valida TypeScript
#    - Deploy para Supabase
#    - Verifica deployment
```

#### Cenário 2: Modificar Edge Function Existente

```bash
# 1. Editar função
vim supabase/functions/admin-create-auth-user/index.ts

# 2. Testar localmente (opcional)
supabase functions serve admin-create-auth-user

# 3. Commit e push
git add supabase/functions/admin-create-auth-user/
git commit -m "fix(edge-functions): improve error handling"
git push origin main

# 4. Deployment automático via GitHub Actions
```

#### Cenário 3: Deploy Manual de Emergência

```bash
# Se CI/CD falhar, deploy manual:
supabase login
export SUPABASE_PROJECT_REF=your-ref
./scripts/deploy-edge-functions.sh --function admin-create-auth-user
```

---

### Monitorização de Deployments

#### GitHub Actions Dashboard

**URL:** `https://github.com/YOUR_ORG/YOUR_REPO/actions`

**Visualizar:**
- Status de todos os workflows
- Logs detalhados de cada deployment
- Histórico de deployments

#### Logs Locais

```bash
# Ver últimos deployments
ls -lt logs/edge-functions/

# Ver log específico
cat logs/edge-functions/deploy-20251222-120000.log

# Ver últimas verificações
cat logs/edge-functions/verify-20251222-120500.log
```

#### Supabase Dashboard

**URL:** `https://supabase.com/dashboard/project/YOUR_REF/functions`

**Verificar:**
- Lista de todas as funções deployed
- Versões deployed
- Logs de invocações
- Métricas de performance

---

### Troubleshooting CI/CD

#### Problema: Workflow não executa

**Causa:** Secrets não configurados

**Solução:**
```bash
# Verificar secrets no GitHub:
# Settings → Secrets and variables → Actions

# Devem existir:
SUPABASE_PROJECT_REF
SUPABASE_ACCESS_TOKEN
```

#### Problema: Deployment falha com erro de autenticação

**Causa:** Access token expirado ou inválido

**Solução:**
```bash
# 1. Gerar novo token no Supabase Dashboard
# 2. Atualizar secret no GitHub
# 3. Re-run workflow
```

#### Problema: Verification detecta funções em falta

**Causa:** Deployment anterior falhou parcialmente

**Solução:**
```bash
# Deploy manual das funções em falta
./scripts/deploy-edge-functions.sh
```

#### Problema: TypeScript validation fails

**Causa:** Sintaxe inválida ou imports incorretos

**Solução:**
```bash
# Validar localmente
deno check supabase/functions/FUNCTION_NAME/index.ts

# Corrigir erros
# Re-commit e push
```

---

### Boas Práticas de CI/CD

#### 1. Sempre Validar Localmente Antes de Push

```bash
# Verificar sintaxe
deno check supabase/functions/*/index.ts

# Verificar deployment status
./scripts/verify-edge-functions.sh
```

#### 2. Usar Pull Requests para Mudanças Críticas

```bash
# Criar branch
git checkout -b feature/new-edge-function

# Fazer mudanças
# Commit
git commit -m "feat: add new function"

# Push e criar PR
git push origin feature/new-edge-function

# GitHub Actions valida automaticamente
# Merge apenas se validação passar
```

#### 3. Monitorizar Deployments Diários

```bash
# Verificação automática corre diariamente
# Verificar resultados em GitHub Actions
# Se detectar drift, investigar causa
```

#### 4. Manter Logs Organizados

```bash
# Logs guardados em logs/edge-functions/
# Revisar periodicamente
# Arquivar logs antigos (>30 dias)
```

---

### Rollback de Edge Functions

#### Rollback Automático (Futuro)

**Planeado:**
- Detecção automática de falhas pós-deployment
- Rollback para versão anterior
- Notificação via Slack/Email

**Status:** 🚧 Em desenvolvimento

#### Rollback Manual (Atual)

```bash
# 1. Identificar versão anterior
supabase functions list --project-ref $PROJECT_REF

# 2. Restaurar código anterior
git log -- supabase/functions/FUNCTION_NAME/
git checkout COMMIT_HASH -- supabase/functions/FUNCTION_NAME/

# 3. Re-deploy
./scripts/deploy-edge-functions.sh --function FUNCTION_NAME

# 4. Verificar
./scripts/verify-edge-functions.sh
```

---

## 📱 Android APK Deployment

### Visão Geral

Deployment automatizado do APK Android (provisionerApp) para o droplet de produção.

**Script:** `./scripts/build-and-deploy-android.sh`

**Localização Final:**
- **URL:** `https://rustdesk.bwb.pt/apk/bwb-android-provisioner/latest.apk`
- **Path no Droplet:** `/var/www/apk/bwb-android-provisioner/latest.apk`
- **SHA256 Checksum:** `/var/www/apk/bwb-android-provisioner/latest.apk.sha256`

---

### Pré-requisitos

#### Local Machine (macOS)

**Java Development Kit:**
```bash
# Verificar Java instalado
/usr/libexec/java_home -V

# Deve ter Java 17 (obrigatório para macOS M1)
# Se não tiver, instalar:
brew install openjdk@17
```

**Android SDK:**
```bash
# Via Android Studio ou:
brew install --cask android-sdk
```

**Gradle:**
- Incluído no projeto (`./gradlew`)
- Não necessita instalação separada

#### SSH Access

**Chave SSH:**
```bash
# Verificar chave existe
ls -la ~/.ssh/rustdeskweb-digitalocean

# Se não existir, adicionar:
ssh-copy-id -i ~/.ssh/rustdeskweb-digitalocean root@46.101.78.179
```

---

### Uso do Script

#### Build Release (Produção)

```bash
# Build e deploy automático
./scripts/build-and-deploy-android.sh

# Ou explicitamente:
./scripts/build-and-deploy-android.sh release
```

#### Build Debug (Desenvolvimento)

```bash
./scripts/build-and-deploy-android.sh debug
```

#### Variáveis de Ambiente

```bash
# Customizar configuração
BUILD_TYPE=release \
REMOTE_USER=root \
REMOTE_HOST=46.101.78.179 \
REMOTE_APK_DIR=/var/www/apk/bwb-android-provisioner \
SSH_KEY=~/.ssh/rustdeskweb-digitalocean \
./scripts/build-and-deploy-android.sh
```

---

### Compatibilidade macOS M1/M2/M3

O script inclui três alterações críticas para funcionar em Apple Silicon:

#### [ALTERAÇÃO #1] Forçar Java 17

**Problema:**
- Kotlin/KSP falha com Java 25.x: `IllegalArgumentException: 25.0.1`
- IntelliJ runtime não suporta versões "novas" do Java

**Solução:**
```bash
# Script força Java 17 no macOS
if [[ "$OS_TYPE" == "Darwin" ]]; then
  if JAVA17_HOME="$(/usr/libexec/java_home -v 17 2>/dev/null)"; then
    export JAVA_HOME="$JAVA17_HOME"
    export PATH="$JAVA_HOME/bin:$PATH"
  fi
fi
```

#### [ALTERAÇÃO #2] Não Depender de gradlew Executável

**Problema:**
- `./gradlew` pode não ter permissões de execução
- Inconsistências entre sistemas

**Solução:**
```bash
# Remove permissões se existirem
chmod -x "$REPO_ROOT/gradlew" || true

# Usa bash explicitamente
GRADLEW_CMD=(bash "$REPO_ROOT/gradlew")
"${GRADLEW_CMD[@]}" clean
"${GRADLEW_CMD[@]}" provisionerApp:assembleRelease
```

#### [ALTERAÇÃO #3] Garantir gradlew Não Executável

**Propósito:**
- Manter consistência no repositório
- Evitar confusão sobre método de execução

**Implementação:**
```bash
# No início do script
if [[ -x "$REPO_ROOT/gradlew" ]]; then
  chmod -x "$REPO_ROOT/gradlew" || true
fi

# No final do script
chmod -x "$REPO_ROOT/gradlew" || true
```

---

### Fases do Deployment

#### Fase 1: Validações Iniciais

```bash
# Sistema operacional
OS_TYPE="$(uname -s)"      # Darwin
OS_ARCH="$(uname -m)"      # arm64

# Java 17 obrigatório no macOS
JAVA_HOME validation

# Estrutura do projeto
- gradlew existe
- provisionerApp/ módulo presente
- SSH key válida
```

#### Fase 2: Limpeza

```bash
# Parar Gradle daemons (evita herdar JAVA_HOME antigo)
bash ./gradlew --stop

# Limpar builds anteriores
bash ./gradlew clean
```

#### Fase 3: Compilação

```bash
# Release build
bash ./gradlew provisionerApp:assembleRelease

# Localizar APK
APK_FILE="provisionerApp/build/outputs/apk/release/provisionerApp-release.apk"

# Calcular SHA256
sha256sum $APK_FILE  # Linux
shasum -a 256 $APK_FILE  # macOS
```

#### Fase 4: Testes de Conectividade

```bash
# Testar SSH
ssh -i "$SSH_KEY_PATH" \
    -o StrictHostKeyChecking=accept-new \
    "$REMOTE_USER@$REMOTE_HOST" "echo OK"
```

#### Fase 5: Preparar Servidor

```bash
# Criar directório se não existir
ssh -i "$SSH_KEY_PATH" "$REMOTE_USER@$REMOTE_HOST" \
  "mkdir -p '$REMOTE_APK_DIR'"
```

#### Fase 6: Upload APK

```bash
# Upload snapshot com timestamp
scp -i "$SSH_KEY_PATH" \
  "$APK_FILE" \
  "$REMOTE_USER@$REMOTE_HOST:$REMOTE_APK_DIR/latest-$TIMESTAMP.apk"

# Copiar para latest.apk
ssh -i "$SSH_KEY_PATH" "$REMOTE_USER@$REMOTE_HOST" \
  "cp -f '$REMOTE_APK_DIR/latest-$TIMESTAMP.apk' '$REMOTE_APK_DIR/latest.apk'"
```

#### Fase 7: Verificação de Integridade

```bash
# Calcular SHA256 remoto
REMOTE_SHA256=$(ssh -i "$SSH_KEY_PATH" "$REMOTE_USER@$REMOTE_HOST" \
  "sha256sum '$REMOTE_APK_DIR/latest.apk' | awk '{print \$1}'")

# Comparar com local
if [[ "$REMOTE_SHA256" != "$LOCAL_SHA256" ]]; then
  echo "❌ SHA256 não coincide!"
  exit 1
fi
```

---

### Logs

**Localização Local:**
```bash
logs/android-build/build-and-deploy-YYYYMMDD-HHMMSS.log
```

**Ver Último Log:**
```bash
ls -t logs/android-build/ | head -1
cat logs/android-build/$(ls -t logs/android-build/ | head -1)
```

**Verificar no Servidor:**
```bash
# Listar APKs disponíveis
ssh root@46.101.78.179 'ls -lh /var/www/apk/bwb-android-provisioner/'

# Verificar SHA256
ssh root@46.101.78.179 'sha256sum /var/www/apk/bwb-android-provisioner/latest.apk'
```

---

### Troubleshooting

#### Erro: "IllegalArgumentException: 25.0.1"

**Causa:** Build a correr com Java 25 em vez de Java 17

**Solução:**
```bash
# Verificar Java em uso
echo $JAVA_HOME
java -version

# Instalar Java 17 se necessário
brew install openjdk@17

# Forçar Java 17
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export PATH="$JAVA_HOME/bin:$PATH"

# Re-executar build
./scripts/build-and-deploy-android.sh
```

#### Erro: "./gradlew: Permission denied"

**Causa:** Script tenta executar `./gradlew` diretamente

**Solução:**
- O script atual usa `bash ./gradlew` e deve funcionar
- Se persistir, verificar que script está atualizado

#### Erro: "APK não encontrado após compilação"

**Causa:** Build falhou silenciosamente

**Solução:**
```bash
# Build manual para ver erros
cd provisionerApp
bash ../gradlew assembleRelease --stacktrace

# Ver output directory
ls -R build/outputs/apk/
```

#### Erro: SSH connection failed

**Causa:** Chave SSH não configurada

**Solução:**
```bash
# Verificar chave
ls -la ~/.ssh/rustdeskweb-digitalocean

# Testar conexão
ssh -i ~/.ssh/rustdeskweb-digitalocean root@46.101.78.179 'echo OK'

# Se falhar, adicionar chave
ssh-copy-id -i ~/.ssh/rustdeskweb-digitalocean root@46.101.78.179
```

---

### Rollback de APK

#### Cenário 1: APK Corrompido

```bash
# Listar backups disponíveis
ssh root@46.101.78.179 'ls -lt /var/www/apk/bwb-android-provisioner/latest-*.apk'

# Restaurar backup específico
ssh root@46.101.78.179 'cp /var/www/apk/bwb-android-provisioner/latest-20251222-120000.apk /var/www/apk/bwb-android-provisioner/latest.apk'

# Recalcular SHA256
ssh root@46.101.78.179 'sha256sum /var/www/apk/bwb-android-provisioner/latest.apk > /var/www/apk/bwb-android-provisioner/latest.apk.sha256'
```

#### Cenário 2: Build com Bugs

```bash
# Reverter código para commit anterior
git log --oneline provisionerApp/

# Checkout versão anterior
git checkout <commit-hash> -- provisionerApp/

# Rebuild e redeploy
./scripts/build-and-deploy-android.sh
```

---

### Boas Práticas

#### Antes de Deploy

- [ ] Testar APK localmente em emulador
- [ ] Verificar versão no `build.gradle.kts`
- [ ] Confirmar mudanças commitadas
- [ ] Backup do APK atual no servidor

#### Durante Deploy

- [ ] Monitorizar logs de build
- [ ] Verificar tamanho do APK (~7-8 MB)
- [ ] Validar SHA256 checksum
- [ ] Testar download do APK

#### Após Deploy

- [ ] Testar instalação em dispositivo físico
- [ ] Verificar provisioning flow
- [ ] Confirmar QR code scanning funciona
- [ ] Atualizar release notes se necessário

---

### Métricas

**Tamanho do APK:**
- Release: ~7-8 MB
- Debug: ~8-9 MB (símbolos incluídos)

**Tempo de Build:**
- Clean build: ~3-5 minutos
- Incremental: ~1-2 minutos

**Tempo de Deploy:**
- Upload: ~30-60 segundos (depende de conexão)
- Total: ~4-6 minutos (build + deploy + verificação)

---

## 🔮 Futuro

### Melhorias Planeadas

- [ ] Blue-Green deployment
- [ ] Canary releases
- [ ] Automated rollback on errors
- [ ] Deployment dashboard
- [ ] Slack/Email notifications
- [ ] Load testing pre-deploy

### CI/CD Integration

Futuro: GitHub Actions workflow:
```yaml
name: Deploy Production

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - run: ./scripts/Step-2-build-local.sh
      - run: ./scripts/Step-3-test-local.sh
      - run: ./scripts/Step-4-deploy-tested-build.sh
```

---

**Última Actualização:** 13 Dezembro 2025  
**Versão do Guia:** 1.0.0  
**Próxima Revisão:** Quando houver mudanças no processo