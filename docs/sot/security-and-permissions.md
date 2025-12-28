# Security & Permissions

**Última Atualização:** 13 Dezembro 2025

## 🔐 Modelo de Segurança

---

## Authentication

### JWT (JSON Web Token)

**Provider:** Supabase Auth

**Token Format:**
```
Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Payload (User Token):**
```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "role": "authenticated",
  "iat": 1702478400,
  "exp": 1702482000
}
```

**Token Lifetime:**
- Access Token: 1 hora
- Refresh Token: 7 dias

### Token Storage

**Client-Side:**
```typescript
// Stored in localStorage
localStorage.setItem('rustdesk_jwt', token)
localStorage.getItem('rustdesk_jwt')
localStorage.removeItem('rustdesk_jwt')
```

**Security Considerations:**
- ✅ Simple implementation
- ✅ Works with SPA architecture
- ⚠️ Vulnerable to XSS attacks
- ⚠️ Cannot be revoked server-side

**Mitigation:**
- Content Security Policy (CSP)
- Regular security audits
- Short token lifetime (1 hour)

---

## Authorization

### User Roles

**Role:** `authenticated`
- Default role for logged-in users
- Access to own data only via RLS

**User Type Hierarchy (mesh_users.user_type):**

```
siteadmin (topo absoluto - super-admin global)
    ↓
minisiteadmin (super-admin de domínio)
    ↓
agent (gestor de tenant)
    ↓
colaborador (ativo)
    ↓
inactivo (desativado)
    ↓
candidato (sem conta - base)
```

**Descrição:**

1. **siteadmin** - Super-admin global
   - Vê e gere TODOS OS DOMÍNIOS do sistema
   - Pode criar/editar/eliminar qualquer utilizador
   - Acesso irrestrito a todos os recursos

2. **minisiteadmin** - Super-admin de domínio (NOVO)
   - Vê e gere TODO O SEU DOMÍNIO (equivalente a siteadmin mas restrito ao domínio)
   - Pode criar/editar/eliminar qualquer utilizador do seu domínio
   - Acesso irrestrito aos recursos do seu domínio
   - Diferença vs siteadmin: Isolado ao seu domínio via RLS/Edge Functions

3. **agent** - Gestor de tenant
   - Pode criar colaboradores no seu tenant
   - Vê e gere tudo no seu domínio/tenant

4. **colaborador** - Colaborador ativo
   - Criado por um agent ou minisiteadmin
   - Tem conta Supabase ativa
   - Vê apenas grupos/devices com permissão explícita

5. **inactivo** - Colaborador desativado
   - Tinha conta Supabase mas foi desativado
   - Não tem acesso ao sistema

6. **candidato** - Candidato sem conta (default)
   - Existe no MeshCentral
   - Não tem conta Supabase (auth_user_id = NULL)
   - Pode ser promovido a "colaborador" por um agent/minisiteadmin

**Role:** `service_role`
- Used by Edge Functions
- Bypasses RLS
- Full database access
- **NEVER** exposed to frontend

### Permission Model

```
User (authenticated)
  ↓ owns
MeshUser (mesh_users.auth_user_id)
  ↓ owns
Devices (android_devices.owner)
```

**Rule:** User can only access devices where `owner` points to their `mesh_user`.

---

## Row Level Security (RLS)

### Concept

RLS é um feature do PostgreSQL que filtra automaticamente linhas baseado no utilizador.

**Enabled on all tables:**
```sql
ALTER TABLE mesh_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE android_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_registration_sessions ENABLE ROW LEVEL SECURITY;
```

### mesh_users Policies

A tabela `mesh_users` é a peça central do modelo Agent‑Collaborator. Para evitar problemas de recursão em RLS e manter o modelo simples e auditável, seguimos duas regras:

1. **RLS mínima na própria tabela**  
   - Cada utilizador só consegue ver **a sua própria linha** (`auth_user_id = auth.uid()`).
   - O `service_role` (Edge Functions, scripts de sync) consegue ver tudo.
2. **Todas as operações multi‑tenant (agents/siteadmins a verem outros utilizadores) são feitas via Edge Functions `admin-*` com `service_role`, não via RLS recursiva.**

**Policy efectiva:**

```sql
-- SELECT: self + service_role
CREATE POLICY "mesh_users_select_policy"
ON public.mesh_users
FOR SELECT
USING (
  auth.jwt() ->> 'role' = 'service_role'
  OR (auth.uid() IS NOT NULL AND auth.uid() = auth_user_id)
);
```

**Notas importantes:**
- Não existem policies de `INSERT`/`UPDATE`/`DELETE` para utilizadores normais nesta tabela.
- Escritas em `mesh_users` são feitas exclusivamente por:
  - Scripts de sincronização MeshCentral → Supabase (via `SUPABASE_SERVICE_ROLE_KEY`)
  - Edge Functions administrativas (`admin-create-auth-user`, `admin-update-auth-user`, etc.)
- Visibilidade “alargada” (por exemplo, um agent ver todos os utilizadores do seu tenant, ou um `siteadmin` ver todos os domínios) é implementada **dentro das Edge Functions `admin-*`**:
  - As funções autenticam o chamador via JWT
  - Verificam o `user_type` (`agent`, `siteadmin`, etc.)
  - Executam queries com `service_role` aplicando a lógica Agent‑Collaborator definida em `data-models.md` e `architecture.md`

Este desenho evita policies RLS auto‑referenciais (que causam erros de recursão infinita) e centraliza a lógica multi‑tenant em código versionado (Edge Functions), alinhado com as melhores práticas do Supabase.

### android_devices Policies

```sql
-- SELECT: View own devices
CREATE POLICY "Users can view own devices"
ON android_devices FOR SELECT
USING (
  auth.uid() = (
    SELECT auth_user_id 
    FROM mesh_users 
    WHERE id = owner
  )
);

-- INSERT: Create devices for self
CREATE POLICY "Users can insert own devices"
ON android_devices FOR INSERT
WITH CHECK (
  auth.uid() = (
    SELECT auth_user_id 
    FROM mesh_users 
    WHERE id = owner
  )
);

-- UPDATE: Update own devices
CREATE POLICY "Users can update own devices"
ON android_devices FOR UPDATE
USING (
  auth.uid() = (
    SELECT auth_user_id 
    FROM mesh_users 
    WHERE id = owner
  )
);

-- DELETE: Delete own devices
CREATE POLICY "Users can delete own devices"
ON android_devices FOR DELETE
USING (
  auth.uid() = (
    SELECT auth_user_id 
    FROM mesh_users 
    WHERE id = owner
  )
);
```

### device_registration_sessions Policies

```sql
-- SELECT: View own sessions
CREATE POLICY "Users can view own sessions"
ON device_registration_sessions FOR SELECT
USING (auth.uid() = user_id);

-- INSERT: Create own sessions
CREATE POLICY "Users can create own sessions"
ON device_registration_sessions FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- UPDATE: Update own sessions
CREATE POLICY "Users can update own sessions"
ON device_registration_sessions FOR UPDATE
USING (auth.uid() = user_id);
```

### RLS Bypass (Service Role)

**Edge Functions use service_role_key:**
```typescript
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

// This bypasses RLS
const response = await fetch(url, {
  headers: {
    'Authorization': `Bearer ${SERVICE_KEY}`
  }
})
```

**Why needed:**
- Matching temporal: access orphan devices (owner=null)
- Cross-user operations (admin functions, future)

---

## API Security

### Endpoint Protection

**All Edge Functions:**
1. Validate JWT
2. Extract user_id
3. Use user_id in queries

**Example:**
```typescript
// 1. Extract JWT
const jwt = req.headers.get('Authorization')?.substring(7)

if (!jwt) {
  return jsonResponse({ error: 'unauthorized' }, 401)
}

// 2. Validate via Auth API
const authResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
  headers: {
    'Authorization': `Bearer ${jwt}`,
    'apikey': SERVICE_ROLE_KEY
  }
})

if (!authResponse.ok) {
  return jsonResponse({ error: 'unauthorized' }, 401)
}

// 3. Extract user_id
const user = await authResponse.json()
const userId = user.id

// 4. Use in query
const devices = await query('SELECT * FROM android_devices WHERE owner=...', [userId])
```

### Input Validation

**All inputs are validated:**

```typescript
// Type checking
if (typeof device_id !== 'string') {
  return jsonResponse({ error: 'invalid_payload' }, 400)
}

// Non-empty check
if (!device_id.trim()) {
  return jsonResponse({ error: 'invalid_payload' }, 400)
}

// Format validation (if needed)
if (!/^\d{10}$/.test(device_id)) {
  return jsonResponse({ error: 'invalid_device_id_format' }, 400)
}
```

### SQL Injection Prevention

**Using parameterized queries:**

```typescript
// ✅ SAFE: Parameterized
const { data } = await supabase
  .from('android_devices')
  .select('*')
  .eq('device_id', userInput)

// ❌ UNSAFE: String interpolation
const query = `SELECT * FROM android_devices WHERE device_id = '${userInput}'`
```

---

## Sensitive Data Protection

### Environment Variables

**Never exposed to frontend:**
```bash
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...  # Backend only
```

**Safe for frontend:**
```bash
NEXT_PUBLIC_SUPABASE_URL=https://...  # Public
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...  # Public
```

### Password Security

**Handled by Supabase Auth:**
- bcrypt hashing
- Salt per password
- Minimum 8 characters
- Never stored in plain text

### Logging

**Sensitive data redacted:**
```typescript
// ✅ GOOD: Masked email
logInfo('login', 'Login attempt', {
  emailMasked: maskEmail(email)
})

// ❌ BAD: Plain email
logInfo('login', 'Login attempt', {
  email: email  // NEVER do this
})
```

**Function:**
```typescript
function maskEmail(email?: string): string {
  if (!email) return 'undefined'
  const [local, domain] = email.split('@')
  if (!domain) return email
  return `${local.substring(0, 2)}***@${domain}`
}
// "user@example.com" → "us***@example.com"
```

---

## CORS (Cross-Origin Resource Sharing)

### Configuration

**All Edge Functions:**
```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
}

// Handle preflight
if (req.method === 'OPTIONS') {
  return new Response('ok', { headers: corsHeaders })
}

// Add to all responses
return new Response(JSON.stringify(data), {
  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
})
```

**Why `Access-Control-Allow-Origin: *`:**
- Vercel preview URLs are dynamic
- Production domain is known but varies
- API is protected by JWT, not CORS

**Future:** Restrict to specific domains in production.

---

## Security Headers

### Content Security Policy (CSP)

**Recommended (Future):**
```typescript
// next.config.ts
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: `
      default-src 'self';
      script-src 'self' 'unsafe-inline' 'unsafe-eval';
      style-src 'self' 'unsafe-inline';
      img-src 'self' data: blob:;
      connect-src 'self' https://*.supabase.co;
    `.replace(/\s{2,}/g, ' ').trim()
  }
]
```

### X-Frame-Options

**Supabase automatically adds:**
```
X-Frame-Options: DENY
```

**Prevent:** Clickjacking attacks

---

## Audit Logging

### What is Logged

**Login Attempts:**
```typescript
logInfo('login', 'Login request received', {
  requestId,
  clientIp,
  emailMasked: maskEmail(email)
})
```

**Failed Auth:**
```typescript
logWarn('login', 'Invalid credentials', {
  requestId,
  emailMasked: maskEmail(email),
  errorCode: 'invalid_credentials'
})
```

**Edge Function Calls:**
```typescript
console.log(`[get-devices] User authenticated: ${userId}`)
console.log(`[get-devices] Found ${devices.length} devices`)
```

### Log Retention

**Supabase Dashboard:**
- Logs available for 7 days (Free tier)
- 30 days (Pro tier)

**Recommendation:** Export critical logs to external service (e.g., Datadog, Sentry).

---

## Threat Mitigation

### XSS (Cross-Site Scripting)

**Mitigation:**
- React automatically escapes output
- No `dangerouslySetInnerHTML` used
- Input validation on all forms
- CSP headers (future)

**Example Safe Code:**
```typescript
// ✅ SAFE: React escapes automatically
<p>{userInput}</p>

// ❌ UNSAFE: Don't do this
<div dangerouslySetInnerHTML={{ __html: userInput }} />
```

### CSRF (Cross-Site Request Forgery)

**Mitigation:**
- JWT in Authorization header (not cookie)
- CORS configuration
- No state-changing GET requests

**Why JWT protects:**
- Attacker cannot read JWT from another origin
- No automatic sending (unlike cookies)

### SQL Injection

**Mitigation:**
- Parameterized queries only
- Supabase client library
- No raw SQL with user input

### DDoS (Distributed Denial of Service)

**Current:** No protection

**Recommendation (Future):**
- Vercel Edge Network (built-in)
- Cloudflare (in front of Vercel)
- Rate limiting per IP/user

---

## Compliance

### GDPR

**Data stored:**
- Email (Supabase Auth)
- Device IDs (RustDesk)
- IP address (optional, in sessions)

**User rights:**
- Right to access: ✅ Via profile page (future)
- Right to deletion: ⚠️ Manual via admin
- Right to portability: ⚠️ Not implemented

**Recommendation:** Implement GDPR-compliant data export/deletion.

### Password Recovery

**Process:**
1. User requests reset
2. Supabase sends email with token
3. User clicks link → `/auth/confirm-reset`
4. User sets new password
5. Old password is invalidated

**Security:**
- Token expires in 1 hour
- One-time use only
- Invalidated after password change

---

## Security Checklist

### Production Deployment

- [ ] Environment variables configured correctly
- [ ] Service role key NOT exposed to frontend
- [ ] RLS enabled on all custom tables
- [ ] RLS policies tested
- [ ] JWT expiration configured (1 hour)
- [ ] CORS headers correct
- [ ] Input validation on all endpoints
- [ ] Logging without sensitive data
- [ ] Password requirements enforced
- [ ] HTTPS only (Vercel handles)

### Monthly Security Review

- [ ] Review Supabase Auth logs
- [ ] Check for suspicious activity
- [ ] Review Edge Function logs
- [ ] Update dependencies
- [ ] Run `npm audit`
- [ ] Review RLS policies
- [ ] Check for exposed secrets

### Incident Response

**If security breach detected:**

1. **Immediate:**
   - Rotate all API keys
   - Invalidate all JWT tokens
   - Disable affected Edge Functions

2. **Investigation:**
   - Review logs
   - Identify affected users
   - Determine scope

3. **Remediation:**
   - Fix vulnerability
   - Deploy patch
   - Notify affected users

4. **Post-Mortem:**
   - Document incident
   - Update security procedures
   - Implement additional safeguards

---

## Device Management Permissions

**📱 DELETE Device Permissions (Hierárquica):**

A capacidade de apagar dispositivos segue estritamente a hierarquia de `user_type`:

```
siteadmin (topo absoluto)
  ↓ pode apagar TODOS os dispositivos de TODOS os domínios
minisiteadmin (super-admin de domínio)
  ↓ pode apagar TODOS os dispositivos do SEU domínio
agent (gestor de tenant)
  ↓ pode apagar TODOS os dispositivos do SEU tenant (agent_id match)
colaborador (activo)
  ↓ NÃO pode apagar (mesmo os dispositivos que criou)
```

**Regras de Validação (Edge Function `remove-device`):**

1. **siteadmin**: 
   - ✅ Pode apagar qualquer dispositivo de qualquer domínio
   - Sem restrições de domínio ou tenant
   - Controlo total global

2. **minisiteadmin**:
   - ✅ Pode apagar qualquer dispositivo do SEU domínio
   - ❌ Não pode apagar dispositivos de outros domínios
   - Validação: `device.domain === caller.domain`

3. **agent**:
   - ✅ Pode apagar qualquer dispositivo do SEU tenant
   - ❌ Não pode apagar dispositivos de outros agents (mesmo dentro do mesmo domínio)
   - Validação: `device.agent_id === caller.agent_id`

4. **colaborador**:
   - ❌ NÃO pode apagar nenhum dispositivo
   - Mesmo os dispositivos que criou (pois o `owner` é sempre o agent pai)
   - Razão: Colaboradores não têm permissões de gestão de dispositivos

**Exemplo Prático:**

```
Domínio "mesh":
  └─ Agent Jorge (agent_id=A1)
      ├─ Collaborator João (criou device D1)
      └─ Collaborator Maria (criou device D2)

Domínio "zonetech":
  └─ Agent Pedro (agent_id=A2)
      └─ Device D3

Siteadmin:     pode apagar D1, D2, D3 (todos)
Minisiteadmin: pode apagar D1, D2 (seu domínio "mesh")
Agent Jorge:   pode apagar D1, D2 (seu tenant A1)
Agent Pedro:   pode apagar D3 (seu tenant A2)
João:          NÃO pode apagar D1 (mesmo tendo criado)
Maria:         NÃO pode apagar D2 (mesmo tendo criado)
```

**Soft-Delete Implementation:**

Quando um dispositivo é apagado:
- `owner` → NULL
- `mesh_username` → NULL
- `friendly_name` → NULL
- `notes` → NULL
- `deleted_at` → timestamp actual
- `device_id` → MANTIDO (para histórico)

O dispositivo fica disponível para re-adopção mas perde toda a associação ao utilizador anterior.

---

**Próxima Revisão:** Mensalmente ou após incidentes de segurança