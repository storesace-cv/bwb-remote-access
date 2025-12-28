# Troubleshooting Guide - RustDesk Mesh Integration

**Versão:** 1.0.0  
**Última Atualização:** 13 Dezembro 2025

Guia completo para diagnóstico e resolução de problemas.

## 📋 Índice

1. [Problemas de Login](#problemas-de-login)
2. [Problemas de Registo de Dispositivos](#problemas-de-registo-de-dispositivos)
3. [Problemas de Dashboard](#problemas-de-dashboard)
4. [Problemas de Deploy](#problemas-de-deploy)
5. [Problemas de Performance](#problemas-de-performance)
6. [Problemas de Base de Dados](#problemas-de-base-de-dados)
7. [Ferramentas de Diagnóstico](#ferramentas-de-diagnóstico)

---

## 🔐 Problemas de Login

### Login retorna erro 401

**Sintomas:**
- Mensagem: "Credenciais inválidas ou utilizador não existe"
- HTTP 401 Unauthorized

**Causas possíveis:**
1. Email ou password incorrectos
2. Conta não existe no Supabase
3. Conta desactivada

**Diagnóstico:**
```bash
# Verificar se user existe no Supabase
curl -X GET "${SUPABASE_URL}/rest/v1/auth.users?email=eq.user@example.com" \
  -H "apikey: ${SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}"
```

**Soluções:**
1. Verificar credenciais (atenção a espaços/maiúsculas)
2. Reset de password via "Esqueceste a password?"
3. Contactar admin para verificar conta no Supabase
4. Verificar se mesh_user existe para esse auth_user_id

### Login retorna erro 502

**Sintomas:**
- Mensagem: "Resposta sem token válido"
- HTTP 502 Bad Gateway

**Causas possíveis:**
1. Problema na comunicação com Supabase
2. Supabase Auth API down
3. Token inválido retornado

**Diagnóstico:**
```bash
# Testar Supabase Auth directamente
curl -X POST "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
  -H "apikey: ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"senha123"}'
```

**Soluções:**
1. Verificar status do Supabase: https://status.supabase.com
2. Verificar .env.local tem keys correctas
3. Testar com outro browser (cache)
4. Reiniciar frontend service

### Session expira muito rápido

**Sintomas:**
- Logout automático em <1 hora
- Mensagem "Sessão expirada"

**Causa:**
- JWT expira em 1 hora (comportamento padrão Supabase)

**Solução:**
```sql
-- Aumentar tempo de expiração do JWT (no Supabase Dashboard)
-- Authentication > Settings > JWT expiry
-- Alterar de 3600 (1h) para 7200 (2h) ou mais
```

---

## 📱 Problemas de Registo de Dispositivos

### QR code não gera

**Sintomas:**
- Modal mostra spinner infinito
- Mensagem de erro no modal
- Console mostra erro

**Diagnóstico:**
```bash
# Testar Edge Function directamente
curl -X GET "${SUPABASE_URL}/functions/v1/generate-qr-image" \
  -H "Authorization: Bearer ${JWT}" \
  -H "apikey: ${ANON_KEY}" \
  -o test-qr.svg
```

**Soluções:**
1. Verificar Edge Function está deployed:
   ```bash
   supabase functions list
   ```
2. Verificar logs da função:
   ```bash
   supabase functions logs generate-qr-image
   ```
3. Re-deploy função:
   ```bash
   supabase functions deploy generate-qr-image
   ```

### Android não conecta após escanear QR

**Sintomas:**
- QR escaneado com sucesso
- App RustDesk não mostra conexão
- "Verificar Dispositivo" não encontra nada

**Diagnóstico:**
1. Verificar configuração do QR code:
   ```typescript
   // Em generate-qr-image/index.ts
   const config = {
     host: "rustdesk.bwb.pt",  // Correcto?
     key: "UzHEW0gpZLT6NIx3WAr9lvUG4Se2s7euUTKQ+SrvjJs=",  // Correcto?
     relay: "rustdesk.bwb.pt"
   };
   ```

2. Verificar servidor RustDesk:
   ```bash
   # Testar conexão ao servidor
   nc -zv rustdesk.bwb.pt 21115  # HBBS port
   nc -zv rustdesk.bwb.pt 21116  # HBBR port
   ```

**Soluções:**
1. Verificar Android tem internet
2. Testar em rede diferente (dados móveis)
3. Verificar firewall não bloqueia portas RustDesk
4. Re-gerar QR code (pode ter expirado)
5. Verificar servidor RustDesk está up

### Device não aparece após "Verificar Dispositivo"

**Sintomas:**
- Escanear QR → sucesso
- Clicar "Verificar" → "Dispositivo ainda não detectado"
- Device não em android_devices

**Diagnóstico:**
```bash
# 1. Verificar se sessão foi criada
curl -X GET "${SUPABASE_URL}/rest/v1/device_registration_sessions?status=eq.awaiting_device" \
  -H "apikey: ${SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}"

# 2. Verificar devices órfãos recentes
curl -X GET "${SUPABASE_URL}/rest/v1/android_devices?owner=is.null&last_seen_at=gte.$(date -u -Iseconds -d '10 minutes ago')" \
  -H "apikey: ${SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}"
```

**Causas possíveis:**
1. Device não conectou ao servidor RustDesk
2. Janela temporal muito restritiva
3. Problema no matching temporal

**Soluções:**
1. Aguardar mais tempo (até 30 segundos)
2. Verificar logs da Edge Function:
   ```bash
   supabase functions logs check-registration-status
   ```
3. Aumentar janela temporal:
   ```typescript
   // Em check-registration-status/index.ts
   const windowStart = new Date(clickedDate.getTime() - 10 * 60 * 1000); // 10 min
   // Mudar para 15 minutos:
   const windowStart = new Date(clickedDate.getTime() - 15 * 60 * 1000);
   ```

### Matching temporal associa device errado

**Sintomas:**
- User A escaneia QR
- Device aparece para User B
- Devices trocados entre users

**Diagnóstico:**
```bash
# Ver matching recentes
curl -X GET "${SUPABASE_URL}/rest/v1/device_registration_sessions?status=eq.completed&select=*,android_devices(*)" \
  -H "apikey: ${SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}"
```

**Causa:**
- Múltiplos devices conectam ao mesmo tempo
- Lógica FIFO não está a funcionar

**Solução:**
Verificar ORDER BY em check-registration-status:
```typescript
// Deve estar ordenado por last_seen_at DESC
.order("last_seen_at", { ascending: false });
```

### Sessão expira antes de terminar

**Sintomas:**
- Modal mostra "Tempo Esgotado"
- Menos de 5 minutos passaram

**Diagnóstico:**
```bash
# Verificar expires_at da sessão
curl -X GET "${SUPABASE_URL}/rest/v1/device_registration_sessions?id=eq.${SESSION_ID}" \
  -H "apikey: ${SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}"
```

**Causa:**
- Relógio do servidor/client dessincronizado
- Timeout muito curto

**Solução:**
```sql
-- Aumentar timeout para 10 minutos
ALTER TABLE device_registration_sessions 
ALTER COLUMN expires_at 
SET DEFAULT (NOW() + INTERVAL '10 minutes');
```

---

## 📊 Problemas de Dashboard

### Dashboard não carrega (página branca)

**Sintomas:**
- Tela branca após login
- Console mostra erros JavaScript
- Network mostra 500/502

**Diagnóstico:**
```bash
# 1. Verificar console do browser (F12)
# Procurar por erros JavaScript

# 2. Verificar Network tab
# Ver se /api/get-devices retorna 200

# 3. Verificar service status
ssh root@46.101.78.179 'systemctl status rustdesk-frontend'
```

**Soluções:**
1. Limpar cache do browser (Ctrl+Shift+Del)
2. Reload forçado (Ctrl+F5)
3. Verificar .env.local no servidor
4. Reiniciar frontend service
5. Verificar logs:
   ```bash
   ssh root@46.101.78.179 'journalctl -u rustdesk-frontend -n 50'
   ```

### Devices não aparecem

**Sintomas:**
- Login funciona
- Dashboard carrega
- Lista de devices vazia
- Sem mensagem de erro

**Diagnóstico:**
```bash
# Verificar se user tem devices
curl -X GET "${SUPABASE_URL}/functions/v1/get-devices" \
  -H "Authorization: Bearer ${JWT}" \
  -H "apikey: ${ANON_KEY}"
```

**Causas possíveis:**
1. User realmente não tem devices
2. Problema no RLS (políticas)
3. owner não corresponde ao user_id

**Soluções:**
1. Adicionar device de teste
2. Verificar RLS policies:
   ```sql
   SELECT * FROM pg_policies WHERE tablename = 'android_devices';
   ```
3. Verificar owner em android_devices:
   ```sql
   SELECT * FROM android_devices WHERE mesh_username = 'seu_username';
   ```

### Filtros não funcionam

**Sintomas:**
- Seleccionar filtro não altera lista
- Pesquisa não retorna resultados esperados
- Ordenação não funciona

**Diagnóstico:**
- Abrir React DevTools
- Verificar estado dos filtros
- Console mostra warnings?

**Causa:**
- Bug no código de filtragem

**Solução:**
Verificar `getFilteredAndSortedDevices()` em `dashboard/page.tsx`:
```typescript
// Deve filtrar correctamente
if (filterStatus === "adopted") {
  filtered = filtered.filter(d => isDeviceAdopted(d));
}
```

### Grupos aparecem desorganizados

**Sintomas:**
- Devices no grupo errado
- Hierarquia quebrada
- Subgrupos em grupos errados

**Diagnóstico:**
```bash
# Ver estrutura de notes
curl -X GET "${SUPABASE_URL}/rest/v1/android_devices?select=device_id,notes" \
  -H "apikey: ${SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}"
```

**Causa:**
- Formato de `notes` inconsistente
- Parsing de grouping errado

**Solução:**
Verificar `parseNotesToGrouping()` em `grouping.ts`:
```typescript
// Formato correcto: "Grupo | Subgrupo"
const parts = trimmed.split("|").map(p => p.trim()).filter(Boolean);
```

---

## 🚀 Problemas de Deploy

### Build falha localmente (Step 2)

**Sintomas:**
- `npm run build` retorna erro
- Mensagem de TypeScript error
- Módulo não encontrado

**Diagnóstico:**
```bash
# Ver log completo
cat logs/local/Step-2-build-local-*.log

# Testar build manual
npm run build 2>&1 | tee build-debug.log
```

**Causas comuns:**
1. Import errado
2. Tipo TypeScript inválido
3. Dependência em falta

**Soluções:**
1. Verificar todos os imports:
   ```bash
   grep -r "import.*from" src/ | grep -v node_modules
   ```
2. Reinstalar dependencies:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```
3. Verificar erros TypeScript:
   ```bash
   npx tsc --noEmit
   ```

### rsync falha (Step 4)

**Sintomas:**
- "rsync: connection refused"
- "Permission denied"
- Ficheiros não transferem

**Diagnóstico:**
```bash
# Testar SSH
ssh root@46.101.78.179 'echo OK'

# Testar rsync simples
rsync -av .env.local root@46.101.78.179:/tmp/test-rsync
```

**Soluções:**
1. Verificar SSH key está configurada
2. Verificar permissões no droplet:
   ```bash
   ssh root@46.101.78.179 'ls -la /opt/rustdesk-frontend'
   ```
3. Verificar espaço em disco:
   ```bash
   ssh root@46.101.78.179 'df -h'
   ```

### Service não inicia após deploy

**Sintomas:**
- Deploy completa
- Health checks falham
- Service status: "failed"

**Diagnóstico:**
```bash
# Ver status
ssh root@46.101.78.179 'systemctl status rustdesk-frontend'

# Ver logs
ssh root@46.101.78.179 'journalctl -u rustdesk-frontend -n 50'
```

**Causas comuns:**
1. Port 3000 já em uso
2. .env.local em falta
3. Dependencies não instaladas
4. Permissões erradas

**Soluções:**
1. Matar processo na porta:
   ```bash
   ssh root@46.101.78.179 'lsof -ti:3000 | xargs kill -9'
   ```
2. Verificar .env.local:
   ```bash
   ssh root@46.101.78.179 'cat /opt/rustdesk-frontend/.env.local'
   ```
3. Reinstalar deps:
   ```bash
   ssh root@46.101.78.179 'cd /opt/rustdesk-frontend && npm install'
   ```
4. Fix permissões:
   ```bash
   ssh root@46.101.78.179 'chown -R rustdeskweb:rustdeskweb /opt/rustdesk-frontend'
   ```

### Health checks timeout

**Sintomas:**
- Service roda
- Port 3000 listening
- Mas curl timeout

**Diagnóstico:**
```bash
# Testar internamente
ssh root@46.101.78.179 'curl -v http://127.0.0.1:3000'

# Testar externamente
curl -v https://rustdesk.bwb.pt
```

**Causa:**
- Next.js ainda a inicializar
- NGINX misconfigured
- Firewall bloqueia

**Soluções:**
1. Aguardar mais tempo (até 2 min)
2. Verificar NGINX config:
   ```bash
   ssh root@46.101.78.179 'nginx -t'
   ```
3. Verificar firewall:
   ```bash
   ssh root@46.101.78.179 'ufw status'
   ```

---

## ⚡ Problemas de Performance

### Dashboard lento a carregar

**Sintomas:**
- >5 segundos para carregar
- Spinner muito tempo
- Browser congela

**Diagnóstico:**
```bash
# Ver quantos devices o user tem
curl -X GET "${SUPABASE_URL}/rest/v1/android_devices?owner=eq.${USER_ID}&select=count" \
  -H "apikey: ${SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}"
```

**Causa:**
- Muitos devices (>500)
- Rendering pesado
- Queries lentas

**Soluções:**
1. Implementar paginação
2. Lazy loading de grupos
3. Adicionar índices no DB:
   ```sql
   CREATE INDEX idx_android_devices_owner ON android_devices(owner);
   CREATE INDEX idx_android_devices_last_seen ON android_devices(last_seen_at DESC);
   ```

### Pesquisa lenta

**Sintomas:**
- Lag ao digitar na pesquisa
- Resultados demoram

**Causa:**
- Re-render em cada keystroke
- Sem debounce

**Solução:**
Adicionar debounce ao search input:
```typescript
const [searchQuery, setSearchQuery] = useState("");
const debouncedSearch = useMemo(
  () => debounce((value) => setSearchQuery(value), 300),
  []
);
```

---

## 🗄️ Problemas de Base de Dados

### RLS bloqueia queries legítimas

**Sintomas:**
- "new row violates row-level security policy"
- "permission denied for table"

**Diagnóstico:**
```sql
-- Ver políticas activas
SELECT * FROM pg_policies WHERE tablename = 'android_devices';

-- Testar query como user
SET ROLE authenticated;
SET request.jwt.claim.sub = 'user_uuid';
SELECT * FROM android_devices;
```

**Solução:**
```sql
-- Exemplo de política correcta
CREATE POLICY "Users can insert own devices"
ON android_devices FOR INSERT
WITH CHECK (auth.uid() = owner);
```

### Dados inconsistentes

**Sintomas:**
- Device com owner NULL mas notes preenchido
- Mesh_username não corresponde a owner
- Devices duplicados

**Diagnóstico:**
```sql
-- Devices órfãos com notes
SELECT * FROM android_devices 
WHERE owner IS NULL AND notes IS NOT NULL;

-- Devices sem mesh_username correspondente
SELECT d.* 
FROM android_devices d
LEFT JOIN mesh_users m ON d.owner = m.id
WHERE m.id IS NULL AND d.owner IS NOT NULL;
```

**Soluções:**
```sql
-- Limpar orphans antigos
DELETE FROM android_devices 
WHERE owner IS NULL 
  AND created_at < NOW() - INTERVAL '7 days';

-- Fix mesh_username
UPDATE android_devices d
SET mesh_username = m.mesh_username
FROM mesh_users m
WHERE d.owner = m.id AND d.mesh_username IS NULL;
```

---

## 🛠️ Ferramentas de Diagnóstico

### Scripts de Diagnóstico

**1. Verificar estado completo:**
```bash
./scripts/diagnose-droplet.sh
```

**2. Diagnóstico de build:**
```bash
./scripts/diagnose-build.sh
```

**3. Diagnóstico de rsync:**
```bash
./scripts/diagnose-rsync-next.sh
```

**4. Colectar logs de erro:**
```bash
./scripts/Step-5-collect-error-logs.sh
```

### Logs Importantes

**Frontend (local):**
```bash
# Build logs
cat logs/local/Step-2-build-local-*.log

# Deploy logs
cat logs/deploy/Step-4-deploy-tested-build-*.log
```

**Frontend (production):**
```bash
# Service logs
ssh root@46.101.78.179 'journalctl -u rustdesk-frontend -n 100'

# Application logs
ssh root@46.101.78.179 'cat /opt/rustdesk-frontend/logs/app-debug.log'
```

**Edge Functions:**
```bash
# Via Supabase CLI
supabase functions logs get-devices
supabase functions logs register-device
supabase functions logs check-registration-status

# Via Dashboard
# Supabase Dashboard > Edge Functions > [function] > Logs
```

### Queries de Diagnóstico

**Estado geral do sistema:**
```sql
-- Total de users
SELECT COUNT(*) FROM auth.users;

-- Total de devices
SELECT COUNT(*) FROM android_devices WHERE deleted_at IS NULL;

-- Devices por user
SELECT 
  m.mesh_username,
  COUNT(d.id) as device_count
FROM mesh_users m
LEFT JOIN android_devices d ON d.owner = m.id AND d.deleted_at IS NULL
GROUP BY m.mesh_username
ORDER BY device_count DESC;

-- Sessões activas
SELECT COUNT(*) FROM device_registration_sessions 
WHERE status = 'awaiting_device' AND expires_at > NOW();

-- Devices órfãos recentes (< 1 hora)
SELECT COUNT(*) FROM android_devices
WHERE owner IS NULL 
  AND deleted_at IS NULL
  AND created_at > NOW() - INTERVAL '1 hour';
```

**Performance queries:**
```sql
-- Top 10 users por devices
SELECT 
  m.mesh_username,
  COUNT(d.id) as devices
FROM mesh_users m
JOIN android_devices d ON d.owner = m.id
WHERE d.deleted_at IS NULL
GROUP BY m.mesh_username
ORDER BY devices DESC
LIMIT 10;

-- Queries lentas (requer pg_stat_statements)
SELECT 
  query,
  calls,
  mean_exec_time,
  total_exec_time
FROM pg_stat_statements
WHERE query LIKE '%android_devices%'
ORDER BY mean_exec_time DESC
LIMIT 10;
```

### Health Check Manual

```bash
# 1. Frontend está up?
curl -I https://rustdesk.bwb.pt

# 2. Login funciona?
curl -X POST https://rustdesk.bwb.pt/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"senha123"}'

# 3. Edge Functions respondem?
curl -X GET "${SUPABASE_URL}/functions/v1/get-devices" \
  -H "Authorization: Bearer ${JWT}" \
  -H "apikey: ${ANON_KEY}"

# 4. Database accessible?
curl -X GET "${SUPABASE_URL}/rest/v1/android_devices?select=count" \
  -H "apikey: ${SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}"
```

---

## 🆘 Quando Pedir Ajuda

Se após seguir este guia o problema persistir:

**1. Colectar informação:**
```bash
# Logs completos
./scripts/Step-5-collect-error-logs.sh

# Estado do sistema
./scripts/diagnose-droplet.sh > system-state.txt
```

**2. Documentar problema:**
- Descrição clara do erro
- Steps para reproduzir
- Screenshots se aplicável
- Logs relevantes
- Que soluções já tentou

**3. Contactar:**
- Email: suporte@bwb.pt
- Anexar: logs-latest.tar.gz + system-state.txt

---

**Última Actualização:** 13 Dezembro 2025  
**Próxima Revisão:** Quando surgirem novos problemas comuns