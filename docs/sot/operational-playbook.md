# Operational Playbook

**Última Atualização:** 13 Dezembro 2025

## 📋 Guia Operacional

Manual de operações diárias, troubleshooting e manutenção.

---

## Daily Operations

### Environment Variables Validation

**CRITICAL:** Before ANY deployment or sync operation, validate environment variables.

**⚠️ IMPORTANT: Understanding Supabase API Key Types**

Supabase Dashboard provides **TWO DIFFERENT TABS** with different key formats:

#### Tab 1: "Publishable and secret API keys" (NEW - Since 2024)
Located at: `Project Settings → API → Publishable and secret API keys`

**Keys Provided:**
- **Publishable key:** `sb_publishable_...` (NOT JWT format)
- **Secret key:** `sb_secret_...` (NOT JWT format)

**Used For:**
- ✅ Supabase Management API (deploy functions, manage secrets)
- ✅ Supabase CLI operations (`supabase gen types`, etc.)

**NOT Used For:**
- ❌ REST API operations (`/rest/v1/...`)
- ❌ Database queries via REST
- ❌ Sync scripts (`sync-meshcentral-to-supabase.sh`)

#### Tab 2: "Legacy anon, service_role API keys" (JWT FORMAT)
Located at: `Project Settings → API → Legacy anon, service_role API keys`

**Keys Provided:**
- **anon public:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (JWT format, 3 parts)
- **service_role secret:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (JWT format, 3 parts)

**Used For:**
- ✅ REST API operations (`/rest/v1/...`)
- ✅ Database queries via REST
- ✅ Frontend authentication (anon key)
- ✅ Backend operations bypassing RLS (service_role key)
- ✅ **Sync scripts** (sync-meshcentral-to-supabase.sh, sync-devices.sh)

**Format Validation:**
- Must have **3 parts** separated by dots: `header.payload.signature`
- Typically **250-400 characters** long
- Always starts with `eyJhbGc`

#### 🎯 Which Tab to Use?

**For sync-meshcentral-to-supabase.sh and sync-devices.sh:**
→ **USE: "Legacy anon, service_role API keys" tab**
→ **Copy the JWT token** (starts with `eyJhbGc...`)
→ **Add to `.env.local`:** `SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...`

**For Supabase CLI and Management API:**
→ **USE: "Publishable and secret API keys" tab**
→ **Copy the secret key** (starts with `sb_secret_...`)
→ **Optional** - only if deploying functions or using CLI

**Quick Validation:**
```bash
# Validate environment variables
bash scripts/validate-env.sh

# Expected output:
# ✓ SUPABASE_URL: https://...
# ✓ ANON_KEY: 3 parts, XXX chars, valid JWT format
# ✓ SERVICE_ROLE_KEY: Secret format (sb_secret_...) or JWT format
# ✓ ALL CHECKS PASSED
```

**On Droplet:**
```bash
cd /opt/rustdesk-frontend

# 1. Verify .env.local exists and is readable
test -f .env.local && echo "✓ .env.local exists" || echo "✗ .env.local missing"

# 2. Validate SUPABASE_URL
grep NEXT_PUBLIC_SUPABASE_URL .env.local
# Expected: NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co

# 3. Validate SERVICE_ROLE_KEY exists
grep SUPABASE_SERVICE_ROLE_KEY .env.local | head -c 50
# Expected: SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...

# 4. Validate SERVICE_ROLE_KEY format (3 parts)
SERVICE_KEY=$(grep SUPABASE_SERVICE_ROLE_KEY .env.local | cut -d'=' -f2)
echo "$SERVICE_KEY" | tr '.' '\n' | wc -l
# Expected: 3 (if not → key is truncated or missing!)

# 5. Validate SERVICE_ROLE_KEY length
echo "$SERVICE_KEY" | wc -c
# Expected: 300-400 (if <200 → key is incomplete!)

# 6. Validate SERVICE_ROLE_KEY starts with 'eyJ'
echo "$SERVICE_KEY" | head -c 10
# Expected: eyJhbGciOi

# 7. All checks passed?
echo "✓ All environment variables valid"
```

**On Local Development:**
```bash
# Same checks as above, but from project root
cd /path/to/rustdesk-frontend
# ... run same validation commands
```

**Automated Validation Script:**
```bash
# Create validation script
cat > scripts/validate-env.sh << 'EOF'
#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.env.local}"

if [ ! -f "$ENV_FILE" ]; then
  echo "✗ $ENV_FILE not found"
  exit 1
fi

echo "Validating $ENV_FILE..."

# Load variables
source "$ENV_FILE"

# Validate URL
if [ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" ]; then
  echo "✗ NEXT_PUBLIC_SUPABASE_URL missing"
  exit 1
fi
echo "✓ SUPABASE_URL: ${NEXT_PUBLIC_SUPABASE_URL:0:40}..."

# Validate SERVICE_ROLE_KEY
if [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "✗ SUPABASE_SERVICE_ROLE_KEY missing"
  exit 1
fi

JWT_PARTS=$(echo "$SUPABASE_SERVICE_ROLE_KEY" | tr '.' '\n' | wc -l)
JWT_LENGTH=${#SUPABASE_SERVICE_ROLE_KEY}

if [ "$JWT_PARTS" -ne 3 ]; then
  echo "✗ SERVICE_ROLE_KEY invalid: $JWT_PARTS parts (expected 3)"
  exit 1
fi

if [ "$JWT_LENGTH" -lt 200 ]; then
  echo "✗ SERVICE_ROLE_KEY too short: $JWT_LENGTH chars (expected 300+)"
  exit 1
fi

if [[ ! "$SUPABASE_SERVICE_ROLE_KEY" =~ ^eyJ ]]; then
  echo "✗ SERVICE_ROLE_KEY invalid format (must start with 'eyJ')"
  exit 1
fi

echo "✓ SERVICE_ROLE_KEY: 3 parts, $JWT_LENGTH chars"

# Validate ANON_KEY
if [ -z "${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}" ]; then
  echo "⚠ NEXT_PUBLIC_SUPABASE_ANON_KEY missing (optional for scripts)"
fi

echo ""
echo "✓ All environment variables valid"
EOF

chmod +x scripts/validate-env.sh
```

**Usage:**
```bash
# Validate .env.local
bash scripts/validate-env.sh

# Validate custom env file
bash scripts/validate-env.sh /path/to/.env.production
```

### Morning Checklist

- [ ] **Validate environment variables** (`bash scripts/validate-env.sh`)
- [ ] Verificar uptime do sistema (Vercel, Supabase)
- [ ] Revisar logs de erro (últimas 24h)
- [ ] Verificar Edge Functions status
- [ ] Check dispositivos órfãos (>100 = problema)
- [ ] Validar schema mesh_users se houver problemas de sync

### Weekly Checklist

- [ ] Limpar sessões expiradas (>7 dias)
- [ ] Revisar métricas de performance
- [ ] Backup manual da BD (se disponível)
- [ ] Revisar users registados vs activos
- [ ] Update dependencies (`npm outdated`)
- [ ] **Validar integridade do schema mesh_users**

### Monthly Checklist

- [ ] Security audit (`npm audit`)
- [ ] Review RLS policies
- [ ] Cleanup orphan devices (>30 dias)
- [ ] Database index optimization
- [ ] Review Supabase billing

---

## MeshCentral Sync Operations

### Validar Schema Antes do Sync

**Sempre que:**
- Primeira instalação
- Após migrações de BD
- Se sync falha com erros de colunas
- Após adicionar novos domínios MeshCentral

**Comando:**
```bash
# Validação básica
bash /opt/rustdesk-frontend/scripts/validate-mesh-users-schema.fixed.sh

# Com debug detalhado (recomendado para troubleshooting)
DEBUG=1 bash /opt/rustdesk-frontend/scripts/validate-mesh-users-schema.fixed.sh
```

**Output esperado:**
```
✓ SCHEMA VÁLIDO - SYNC PODE SER EXECUTADO
```

**Se falhar:**
1. Aplicar migração multi-domínio:
   ```sql
   -- No Supabase SQL Editor
   -- Copiar conteúdo de: supabase/migrations/20251219040000_migration_mesh_users_multidomain.sql
   ```

2. Verificar novamente:
   ```bash
   bash scripts/validate-mesh-users-schema.fixed.sh
   ```

### Executar Sync Manual MeshCentral → Supabase

```bash
# Depois de validar schema
bash /opt/rustdesk-frontend/scripts/sync-meshcentral-to-supabase.sh
```

**Logs importantes:**
- Número de utilizadores sincronizados por domínio
- Utilizadores novos criados
- Utilizadores atualizados
- Erros de conexão ou parsing

### Activar Sync Automático (Systemd Timer)

```bash
# Verificar status
systemctl status meshcentral-supabase-sync.timer

# Activar
systemctl start meshcentral-supabase-sync.timer
systemctl enable meshcentral-supabase-sync.timer

# Ver próxima execução
systemctl list-timers | grep meshcentral

# Ver logs de execuções
journalctl -u meshcentral-supabase-sync.service -f
```

**Frequência:** A cada 15 minutos (configurável em `.timer`)

---

## Common Operations

### Add New User

```sql
-- 1. Create auth user (Supabase Dashboard)
-- Authentication → Users → Add User
-- Email: user@example.com
-- Password: (auto-generated or custom)
-- Email confirmation: disabled

-- 2. Create mesh_user entry
INSERT INTO mesh_users (auth_user_id, display_name)
VALUES (
  'auth-user-uuid',
  'User Display Name'
);
```

### Reset User Password

```sql
-- Option 1: Via Supabase Dashboard
-- Authentication → Users → [Select User] → Reset Password

-- Option 2: Via app
-- User goes to /auth/reset-password
-- Enters email
-- Receives reset link
```

### Remove User

```sql
-- 1. Soft delete user's devices
UPDATE android_devices
SET deleted_at = NOW()
WHERE owner IN (
  SELECT id FROM mesh_users WHERE auth_user_id = 'user-uuid'
);

-- 2. Delete mesh_user (CASCADE will delete sessions)
DELETE FROM mesh_users WHERE auth_user_id = 'user-uuid';

-- 3. Delete auth user (Supabase Dashboard)
-- Authentication → Users → [Select User] → Delete
```

### Manually Match Orphan Device

```sql
-- Find orphan
SELECT * FROM android_devices 
WHERE owner IS NULL 
ORDER BY last_seen_at DESC 
LIMIT 10;

-- Get user's mesh_user_id
SELECT id FROM mesh_users WHERE auth_user_id = 'user-uuid';

-- Assign device
UPDATE android_devices 
SET owner = 'mesh-user-uuid',
    mesh_username = 'optional@username.com',
    updated_at = NOW()
WHERE device_id = '1403938023';
```

### Cleanup Old Sessions

```sql
-- Delete expired sessions older than 7 days
DELETE FROM device_registration_sessions
WHERE status = 'expired'
  AND expires_at < NOW() - INTERVAL '7 days';
```

### Cleanup Orphan Devices

```sql
-- Delete orphans older than 30 days
DELETE FROM android_devices
WHERE owner IS NULL
  AND created_at < NOW() - INTERVAL '30 days';
```

---

## Troubleshooting

### Issue: Sync Fails with "Expected 3 parts in JWT; got 1"

**Symptoms:**
```bash
bash scripts/sync-meshcentral-to-supabase.sh
# Error: Expected 3 parts in JWT; got 1
# Error: 401 Unauthorized
```

**Root Cause:**
`SUPABASE_SERVICE_ROLE_KEY` is **missing** or **truncated** in `.env.local`

**Diagnosis:**
```bash
# 1. Check if .env.local exists
cat /opt/rustdesk-frontend/.env.local

# 2. Check if SERVICE_ROLE_KEY exists
grep SUPABASE_SERVICE_ROLE_KEY /opt/rustdesk-frontend/.env.local

# 3. If missing or shows "sb_secret_..." → KEY IS WRONG!
# Valid key starts with 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
```

**Solutions:**

**Option 1 (RECOMMENDED): Use Softgen's Tool**
```
In Softgen chat, ask AI:
"Please run fetch_and_update_api_keys to update .env.local with correct Supabase keys"

This will:
✓ Fetch correct SERVICE_ROLE_KEY from Supabase
✓ Update .env.local automatically
✓ Validate JWT format
```

**Option 2 (Manual): Get from Supabase Dashboard**
```
1. Go to: https://supabase.com/dashboard/project/<ref>/settings/api
2. Find "service_role" key (NOT "anon" key)
3. Click "Reveal"
4. Copy ENTIRE token (starts with 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...')
5. Token should be ~300-400 characters long
6. Add to .env.local:
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3M...
```

**Validate after update:**
```bash
bash scripts/validate-env.sh
# Expected: ✓ All environment variables valid
```

**Re-run sync:**
```bash
bash scripts/sync-meshcentral-to-supabase.sh
# Should now succeed
```

**Prevention:**
- Always use `fetch_and_update_api_keys` to get correct keys
- Use `scripts/validate-env.sh` before any sync operation
- Never manually truncate keys for security - they must be complete

### Issue: Sync MeshCentral Falha com Erro de Colunas

**Symptoms:**
- Erro: "column 'domain_key' does not exist"
- Erro: "column 'domain' does not exist"
- Sync script termina com exit code 1

**Diagnosis:**
```bash
# 1. Validar schema
DEBUG=1 bash scripts/validate-mesh-users-schema.fixed.sh

# 2. Se falhar, verificar colunas actuais
# Via Supabase SQL Editor:
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'mesh_users' 
ORDER BY ordinal_position;
```

**Solutions:**

1. **Schema desatualizado:**
   ```bash
   # Aplicar migração multi-domínio
   # No Supabase Dashboard → SQL Editor → New query
   # Copiar conteúdo de:
   cat supabase/migrations/20251219040000_migration_mesh_users_multidomain.sql
   # Colar e executar
   ```

2. **Tabela mesh_users não existe:**
   ```sql
   -- Criar tabela completa (ver migration file)
   -- Ou correr setup inicial
   ```

3. **RLS bloqueando acesso:**
   ```bash
   # Usar SERVICE_ROLE_KEY no script
   # Verificar em .env.local:
   grep SUPABASE_SERVICE_ROLE_KEY /opt/rustdesk-frontend/.env.local
   ```

### Issue: Utilizadores MeshCentral Invisíveis

**Symptoms:**
- Utilizador existe no MeshCentral
- Utilizador consegue autenticar
- Utilizador NÃO aparece na lista Users do MeshCentral
- Sync não captura o utilizador

**Diagnosis:**
```bash
# 1. Validar schema multi-domínio
bash scripts/validate-mesh-users-schema.fixed.sh

# 2. Verificar campo 'domain' no MeshCentral
# No MeshCentral DB (MongoDB):
db.meshcentral.find(
  { type: "user" },
  { _id: 1, domain: 1, realms: 1 }
)
```

**Root Cause:**
Campo `domain` vazio ou `undefined` no MeshCentral → utilizador fica invisível na UI

**Solutions:**

1. **Corrigir no MeshCentral:**
   ```javascript
   // No MeshCentral DB
   db.meshcentral.updateMany(
     { type: "user", domain: { $exists: false } },
     { $set: { domain: "" } }  // Default domain
   )
   ```

2. **Validar sync captura o campo:**
   ```bash
   # Re-executar sync após correção
   bash scripts/sync-meshcentral-to-supabase.sh
   
   # Verificar em Supabase
   SELECT mesh_username, domain_key, domain, email 
   FROM mesh_users 
   WHERE domain IS NULL OR domain_key IS NULL;
   ```

### Issue: Debug Mode do Script de Validação

**Quando usar:**
- Primeira execução
- Após mudanças no schema
- Quando validação falha inexplicavelmente

**Comando:**
```bash
DEBUG=1 bash scripts/validate-mesh-users-schema.fixed.sh
```

**Output debug inclui:**
```
DEBUG: Resposta HTTP completa (primeiros 500 chars)
DEBUG: Número de registos: X
DEBUG: Variável COLS_LIST (via od -c)
DEBUG: Variável COLS_LIST (linhas numeradas)
DEBUG: grep -Fx 'column_name' não encontrou match
```

**Interpretar output:**
- **Resposta HTTP vazia:** Problema de conectividade
- **Número de registos: 0:** Tabela vazia (erro)
- **od -c mostra caracteres estranhos:** Problema de encoding
- **grep não encontra coluna:** Nome de coluna diferente do esperado

### Issue: Users Can't Login

**Symptoms:**
- Error: "Invalid credentials"
- Works in some browsers, not others

**Diagnosis:**
```sql
-- Check if user exists
SELECT id, email, created_at, last_sign_in_at 
FROM auth.users 
WHERE email = 'user@example.com';

-- Check if mesh_user exists
SELECT * FROM mesh_users 
WHERE auth_user_id = 'user-uuid';
```

**Solutions:**

1. **User doesn't exist:**
   ```
   Create user via Supabase Dashboard
   ```

2. **Password incorrect:**
   ```
   Reset password via Dashboard or app
   ```

3. **Browser issue:**
   ```
   Clear localStorage
   Try incognito mode
   ```

### Issue: Devices Not Appearing

**Symptoms:**
- User logged in but sees no devices
- Devices exist in database

**Diagnosis:**
```sql
-- Check devices for user
SELECT d.* 
FROM android_devices d
JOIN mesh_users m ON d.owner = m.id
WHERE m.auth_user_id = 'user-uuid'
  AND d.deleted_at IS NULL;
```

**Solutions:**

1. **Devices are orphans (owner=null):**
   ```sql
   -- Manually assign
   UPDATE android_devices 
   SET owner = 'mesh-user-uuid' 
   WHERE device_id = '...';
   ```

2. **RLS blocking:**
   ```sql
   -- Check RLS policies
   SELECT * FROM pg_policies 
   WHERE tablename = 'android_devices';
   
   -- Test as service_role
   -- (should see all devices)
   ```

3. **Devices soft-deleted:**
   ```sql
   -- Check deleted_at
   SELECT * FROM android_devices 
   WHERE deleted_at IS NOT NULL;
   
   -- Restore if needed
   UPDATE android_devices 
   SET deleted_at = NULL 
   WHERE device_id = '...';
   ```

### Issue: QR Code Not Loading

**Symptoms:**
- "Erro ao gerar QR code"
- QR modal shows loading indefinitely

**Diagnosis:**
```bash
# Check Edge Function logs
# Supabase Dashboard → Edge Functions → generate-qr-image → Logs
```

**Solutions:**

1. **Edge Function down:**
   ```bash
   # Redeploy
   supabase functions deploy generate-qr-image
   ```

2. **Missing environment variables:**
   ```bash
   # Check secrets
   supabase secrets list
   
   # If missing, set
   supabase secrets set RUSTDESK_HOST=rustdesk.bwb.pt
   supabase secrets set RUSTDESK_KEY=...
   ```

3. **CORS error:**
   ```typescript
   // Verify corsHeaders in Edge Function
   // Should include:
   'Access-Control-Allow-Origin': '*'
   ```

### Issue: Matching Temporal Fails

**Symptoms:**
- User clicks "Verificar Dispositivo"
- Always returns "dispositivo não detectado"

**Diagnosis:**
```sql
-- 1. Check session
SELECT * FROM device_registration_sessions 
WHERE id = 'session-uuid';

-- 2. Check if orphans exist
SELECT * FROM android_devices 
WHERE owner IS NULL 
  AND last_seen_at >= (NOW() - INTERVAL '10 minutes');
```

**Solutions:**

1. **No orphans in window:**
   ```
   Device may not have connected yet
   User should scan QR again
   ```

2. **Window too restrictive:**
   ```sql
   -- Temporarily widen window (15 min)
   -- In check-registration-status function
   window_start = session.clicked_at - timedelta(minutes=15)
   ```

3. **RustDesk server not registering:**
   ```
   Check RustDesk server logs
   Verify POST /functions/v1/register-device is called
   ```

### Issue: High Edge Function Errors

**Symptoms:**
- Multiple 500 errors in logs
- Specific function failing

**Diagnosis:**
```bash
# View function logs
# Dashboard → Edge Functions → [function] → Logs

# Look for:
# - Unhandled errors
# - Database timeouts
# - Missing env vars
```

**Solutions:**

1. **Database timeout:**
   ```
   Optimize query
   Add indexes
   Check connection pool
   ```

2. **Missing env variable:**
   ```bash
   supabase secrets set VAR_NAME=value
   ```

3. **Code bug:**
   ```
   Fix code
   Redeploy function
   ```

---

## Performance Monitoring

### Key Metrics

**Dashboard Load Time:**
```
Target: <1s (p95)
Alert if: >2s
```

**API Response Time:**
```
Target: <200ms (p95)
Alert if: >500ms
```

**Edge Function Errors:**
```
Target: <1% error rate
Alert if: >5%
```

### Monitoring Queries

**Slow Queries:**
```sql
-- In Supabase Dashboard → Database → Logs
-- Look for queries taking >100ms
```

**Orphan Device Count:**
```sql
SELECT COUNT(*) FROM android_devices 
WHERE owner IS NULL 
  AND deleted_at IS NULL;
```

**Active Sessions:**
```sql
SELECT COUNT(*) FROM device_registration_sessions
WHERE status = 'awaiting_device'
  AND expires_at > NOW();
```

**Success Rate (Matching):**
```sql
SELECT 
  COUNT(CASE WHEN status = 'completed' THEN 1 END) * 100.0 / COUNT(*) AS success_rate
FROM device_registration_sessions
WHERE created_at > NOW() - INTERVAL '24 hours';
```

---

## Incident Response

### Severity Levels

**P0 - Critical (Resolve within 1 hour):**
- Site completely down
- Database unavailable
- Authentication broken

**P1 - High (Resolve within 4 hours):**
- Major feature broken (e.g., QR code generation)
- Significant performance degradation
- Security vulnerability

**P2 - Medium (Resolve within 1 day):**
- Minor feature broken
- Moderate performance issue
- Non-critical bug

**P3 - Low (Resolve within 1 week):**
- Cosmetic issues
- Enhancement requests
- Documentation updates

### Incident Checklist

**Detection:**
- [ ] Issue identified (user report, monitoring alert)
- [ ] Severity assessed
- [ ] Stakeholders notified

**Investigation:**
- [ ] Logs reviewed
- [ ] Database checked
- [ ] Recent changes identified
- [ ] Root cause determined

**Resolution:**
- [ ] Fix implemented
- [ ] Tested in staging (if available)
- [ ] Deployed to production
- [ ] Verified working

**Post-Mortem:**
- [ ] Incident documented
- [ ] Timeline created
- [ ] Root cause documented
- [ ] Prevention steps identified
- [ ] Post-mortem shared

---

## Deployment

### Pre-Deployment Checklist

- [ ] All tests passing locally
- [ ] Code reviewed (if team)
- [ ] Database migrations tested
- [ ] Environment variables checked
- [ ] Rollback plan prepared

### Deployment Process

**1. Vercel (Frontend/API Routes):**
```bash
# Automatic on push to main
git push origin main

# Or manual via Vercel Dashboard
# Deployments → Deploy
```

**2. Supabase (Edge Functions):**
```bash
# Deploy single function
supabase functions deploy function-name

# Deploy all functions
supabase functions deploy get-devices
supabase functions deploy register-device
supabase functions deploy check-registration-status
supabase functions deploy start-registration-session
supabase functions deploy generate-qr-image
```

**3. Database Migrations:**
```bash
# Create migration
supabase migration new migration_name

# Apply migration
supabase db push
```

### Post-Deployment Checklist

- [ ] Verify site loads
- [ ] Test login flow
- [ ] Test QR generation
- [ ] Test device listing
- [ ] Check error logs (first 10 min)
- [ ] Monitor performance metrics

### Rollback Procedure

**Vercel:**
```
Dashboard → Deployments → [Previous Deploy] → Promote to Production
```

**Supabase Edge Functions:**
```bash
# Redeploy previous version from git
git checkout <previous-commit>
supabase functions deploy function-name
git checkout main
```

**Database:**
```sql
-- No automatic rollback
-- Must manually reverse migration
-- Or restore from backup
```

---

## Backup & Recovery

### Automated Backups

**Supabase:**
- Daily backups (included in plan)
- 7-day retention (Free tier)
- 30-day retention (Pro tier)

### Manual Backup

```bash
# Database dump
pg_dump -h db.your-project.supabase.co \
        -U postgres \
        -d postgres \
        > backup_$(date +%Y%m%d).sql

# Restore
psql -h db.your-project.supabase.co \
     -U postgres \
     -d postgres \
     < backup_20251213.sql
```

### Recovery Scenarios

**Scenario 1: Accidental Data Deletion**
```sql
-- If soft-deleted (deleted_at set)
UPDATE android_devices 
SET deleted_at = NULL 
WHERE id = 'device-uuid';

-- If hard-deleted
-- Restore from backup
```

**Scenario 2: Database Corruption**
```
1. Identify corruption scope
2. Stop writes (maintenance mode)
3. Restore from latest backup
4. Replay transactions from logs
5. Verify data integrity
6. Resume operations
```

**Scenario 3: Complete Outage**
```
1. Check Supabase status page
2. Check Vercel status page
3. If planned maintenance, wait
4. If unexpected, contact support
5. Communicate with users
```

---

## Useful Commands

### Supabase CLI

```bash
# Login
supabase login

# Link project
supabase link --project-ref your-ref

# Check status
supabase status

# View logs
supabase functions logs function-name

# Generate types
supabase gen types typescript --project-id your-ref

# Run locally
supabase start
```

### Database Maintenance

```sql
-- Analyze tables (update statistics)
ANALYZE android_devices;
ANALYZE mesh_users;
ANALYZE device_registration_sessions;

-- Vacuum tables (reclaim space)
VACUUM ANALYZE android_devices;

-- Reindex
REINDEX TABLE android_devices;
```

---

## Contacts

### Support

**Supabase Support:**
- Dashboard → Help → Contact Support
- Email: support@supabase.io

**Vercel Support:**
- Dashboard → Help → Contact Support
- Email: support@vercel.com

**RustDesk Community:**
- GitHub: https://github.com/rustdesk/rustdesk
- Discord: (check GitHub for invite)

---

**Próxima Revisão:** Trimestralmente ou após incidentes major