# Supabase Integration

**Última Atualização:** 13 Dezembro 2025

## 🔗 Integração Completa com Supabase

Este documento detalha toda a integração do projeto com Supabase.

---

## Environment Variables Setup

### ⚠️ CRITICAL: Understanding Supabase Dashboard API Key Tabs

**Since 2024, Supabase Dashboard has TWO TABS with DIFFERENT key formats!**

This is the **#1 source of confusion** and sync script failures. Read carefully:

---

### 🔴 Tab 1: "Publishable and secret API keys" (NEW FORMAT)

**Location:** Project Settings → API → First Tab

**Keys Format:**
```bash
# Publishable key (replaces anon key)
sb_publishable_qiF8a3E0_fiMpkC2avbimw_Auhqy...

# Secret key (replaces service_role key)
sb_secret_gdkCI●●●●●●●●●●●●●●●●
```

**Characteristics:**
- ❌ **NOT JWT format** (no 3 parts separated by dots)
- ❌ **NOT suitable for REST API** (will cause "Expected 3 parts in JWT" error)
- ✅ Used for **Management API** (deploy functions, manage secrets)
- ✅ Used for **Supabase CLI** operations

**DO NOT USE FOR:**
- ❌ Sync scripts (`sync-meshcentral-to-supabase.sh`)
- ❌ REST API calls (`/rest/v1/...`)
- ❌ Database operations from backend

---

### 🟢 Tab 2: "Legacy anon, service_role API keys" (JWT FORMAT)

**Location:** Project Settings → API → Second Tab ("Legacy anon, service_role API keys")

**Keys Format:**
```bash
# anon public (JWT format)
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtxd2FpYmd2bXpjcWVvY3R1a295Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQ2NTAzOTMsImV4cCI6MjA1MDIyNjM5M30...

# service_role secret (JWT format)
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtxd2FpYmd2bXpjcWVvY3R1a295Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNDY1MDM5MywiZXhwIjoyMDUwMjI2MzkzfQ...
```

**Characteristics:**
- ✅ **JWT format** (3 parts separated by dots: header.payload.signature)
- ✅ **Suitable for REST API** (`/rest/v1/...`)
- ✅ **Used by sync scripts**
- ✅ **Bypass RLS** (service_role key only)
- ✅ **250-400 characters long**
- ✅ **Always starts with** `eyJhbGc`

**USE FOR:**
- ✅ Sync scripts (`sync-meshcentral-to-supabase.sh`, `sync-devices.sh`)
- ✅ REST API calls from backend
- ✅ Database operations requiring service_role privileges
- ✅ Frontend authentication (anon key only)

---

### 🎯 Quick Decision Guide

**I need to run sync-meshcentral-to-supabase.sh:**
→ Go to **"Legacy anon, service_role API keys" tab**
→ Copy **service_role** key (JWT format, starts with `eyJhbGc...`)
→ Add to `.env.local`: `SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...`

**I need to deploy Edge Functions or use CLI:**
→ Go to **"Publishable and secret API keys" tab**
→ Copy **Secret key** (starts with `sb_secret_...`)
→ Optional - only if using Management API

**I need both:**
→ Use **different variable names**:
```bash
# For REST API / sync scripts (JWT format)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...  # From "Legacy" tab

# For Management API / CLI (secret format) - Optional
SUPABASE_MANAGEMENT_SECRET=sb_secret_...  # From "Publishable" tab
```

---

### Quick Setup with Softgen (Recommended)

If you're using Softgen AI, the easiest way to set up environment variables is:

```
In Softgen chat, ask:
"Please run fetch_and_update_api_keys to update .env.local"
```

This will automatically fetch the **correct JWT tokens** from the "Legacy" tab.

### Manual Setup

**Required for sync scripts and REST API:**

```bash
# Required - From "Legacy anon, service_role API keys" tab
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...  # JWT format, anon key
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...  # JWT format, service_role key

# Optional
NEXT_PUBLIC_SITE_URL=https://your-domain.com
```

**CRITICAL Validation:**
```bash
# Your SERVICE_ROLE_KEY MUST:
# ✅ Start with: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.
# ✅ Have 3 parts separated by dots
# ✅ Be ~300-400 characters long
# ❌ NEVER start with: sb_secret_
# ❌ NEVER start with: sb_publishable_

# Quick test:
echo "$SUPABASE_SERVICE_ROLE_KEY" | tr '.' '\n' | wc -l
# Expected output: 3
# If you get 1 → WRONG KEY! You're using "Publishable and secret" tab
```

**Validation:**
```bash
# Validate environment setup
bash scripts/validate-env.sh

# Expected output:
✓ SUPABASE_URL: https://...
✓ SERVICE_ROLE_KEY: JWT format, 3 parts, 350 chars
✓ ANON_KEY: JWT format, 3 parts, 250 chars
✓ ALL CHECKS PASSED
```

---

## Environment Variables

### ⚠️ CRITICAL: Understanding Supabase Key Types

Supabase provides **two different formats** for service-level credentials:

### 1️⃣ **Secret Format** (`sb_secret_...`)
```bash
SUPABASE_SERVICE_ROLE_KEY=sb_secret_gdkC...
```
**Used For:**
- ✅ Supabase Management API (deploy functions, manage secrets)
- ✅ Supabase CLI operations (`supabase gen types`, etc.)
- ❌ **NOT for REST API** (will cause JWT errors)

**Where to Get:**
- Supabase Dashboard → Settings → API → "secret" section

### 2️⃣ **JWT Format** (`eyJhbGc...`)
```bash
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3M...
# OR
SUPABASE_SERVICE_ROLE_JWT=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3M...
```
**Used For:**
- ✅ REST API operations (`/rest/v1/...`)
- ✅ Database queries via REST
- ✅ Bypass RLS (if service_role JWT)
- ✅ Frontend authentication (if anon JWT)

**Format:**
- Must have **3 parts** separated by dots: `header.payload.signature`
- Typically **200-400 characters** long
- Always starts with `eyJhbGc`

**Where to Get:**
- Supabase Dashboard → Settings → API → "anon" public or "service_role" key

### Required Variables

```bash
# Supabase Connection
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co

# JWT Token for REST API (REQUIRED)
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3M...

# Optional: Secret for Management API
SUPABASE_SERVICE_ROLE_KEY=sb_secret_gdkC...  # OR eyJhbGc... (JWT)

# App Config (Optional)
NEXT_PUBLIC_APP_VERSION=0.1.0
NEXT_PUBLIC_APP_BUILD=dev
```

**For Sync Scripts:**
- ✅ Need `NEXT_PUBLIC_SUPABASE_ANON_KEY` (JWT format)
- ❌ Do NOT need `sb_secret_` format
- ✅ Script will use ANON_KEY for REST API operations

### Variable Locations

**Local Development:** `.env.local` (git-ignored)
```bash
# .env.local - MUST contain COMPLETE tokens
NEXT_PUBLIC_SUPABASE_URL=https://abc123.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3M...  # ~280 chars
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3M...  # ~300-400 chars
```

**Droplet Production:** `/opt/rustdesk-frontend/.env.local`
```bash
# Verify keys on droplet
cd /opt/rustdesk-frontend
cat .env.local

# Validate SERVICE_ROLE_KEY format
grep SUPABASE_SERVICE_ROLE_KEY .env.local | cut -d'=' -f2 | tr '.' '\n' | wc -l
# Must return: 3
```

**Vercel Production:**
- Project Settings → Environment Variables
- ✅ Production
- ✅ Preview
- ✅ Development
- **IMPORTANT:** Paste COMPLETE tokens (verify length before saving)

---

## Authentication Setup

### Supabase Auth Configuration

**Dashboard → Authentication → URL Configuration:**

```
Site URL: https://rustdesk.bwb.pt
Redirect URLs (wildcard):
  - https://*.vercel.app/**
  - https://rustdesk.bwb.pt/**
  - http://localhost:3000/**
```

### Email Templates

**Password Recovery Email:**

```html
<h2>Reset your password</h2>
<p>Click the link below to reset your password:</p>
<p><a href="{{ .ConfirmationURL }}">Reset Password</a></p>
```

**Confirmation URL:**
```
{{ .SiteURL }}/auth/confirm-reset?token={{ .Token }}&type=recovery
```

### Disable Email Confirmation

**Dashboard → Authentication → Email Auth:**
- ✅ Enable Email provider
- ❌ **Disable** Confirm email

**Reason:** Users são criados manualmente por admins.

---

## Database Schema

### Tables Created

```sql
-- Custom tables (não built-in)
1. mesh_users
2. android_devices
3. device_registration_sessions

-- Built-in Supabase
- auth.users
- auth.sessions
- auth.refresh_tokens
```

Ver [Data Models](data-models.md) para schema completo.

### Row Level Security (RLS)

**Todas as tabelas têm RLS enabled:**

```sql
ALTER TABLE mesh_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE android_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_registration_sessions ENABLE ROW LEVEL SECURITY;
```

**Políticas:**
- Users só vêem/editam seus próprios dados
- Edge Functions usam `service_role_key` → bypass RLS

---

## Edge Functions

### Deployed Functions

```bash
supabase/functions/
├── get-devices/              # Lista devices do user
├── register-device/          # Regista/actualiza device
├── check-registration-status/ # Verifica sessão + matching
├── start-registration-session/ # Cria sessão de 5 min
└── generate-qr-image/        # Gera QR code PNG
```

### Deploy Process

**1. Install Supabase CLI:**
```bash
npm install -g supabase
```

**2. Login:**
```bash
supabase login
```

**3. Link Project:**
```bash
supabase link --project-ref your-project-ref
```

**4. Deploy All Functions:**
```bash
supabase functions deploy get-devices
supabase functions deploy register-device
supabase functions deploy check-registration-status
supabase functions deploy start-registration-session
supabase functions deploy generate-qr-image
```

**5. Set Secrets (if needed):**
```bash
supabase secrets set MY_SECRET=value
```

### Function Configuration

**All functions use:**
```typescript
export const config = { verify_jwt: false };
```

**Reason:** Manual JWT validation via Auth API for flexibility.

### CORS Configuration

**All functions include:**
```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

// OPTIONS handler
if (req.method === 'OPTIONS') {
  return new Response('ok', { headers: corsHeaders });
}
```

---

## Client-Side Integration

### Supabase Client Setup

**File:** `src/integrations/supabase/client.ts`

```typescript
import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)
```

### TypeScript Types

**Auto-generated from DB schema:**

```bash
# Generate types
supabase gen types typescript --project-id your-project-ref > src/integrations/supabase/database.types.ts
```

**File:** `src/integrations/supabase/types.ts`

```typescript
export type { Database } from './database.types'
```

### Usage in Components

```typescript
import { supabase } from '@/integrations/supabase/client'

// Auth
const { data, error } = await supabase.auth.signInWithPassword({
  email,
  password
})

// Query (respects RLS)
const { data: devices } = await supabase
  .from('android_devices')
  .select('*')
  .eq('owner', userId)
```

---

## API Routes Integration

### Login Route

**File:** `src/app/api/login/route.ts`

```typescript
import { supabase } from '@/integrations/supabase/client'

export async function POST(req: Request) {
  const { email, password } = await req.json()
  
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  })
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 })
  }
  
  return NextResponse.json({ token: data.session.access_token })
}
```

---

## Edge Function Integration

### Calling Edge Functions from Frontend

```typescript
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const jwt = localStorage.getItem('rustdesk_jwt')

const response = await fetch(
  `${supabaseUrl}/functions/v1/get-devices`,
  {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${jwt}`,
      'apikey': anonKey,
      'Content-Type': 'application/json'
    }
  }
)

const data = await response.json()
```

### JWT Validation in Edge Functions

```typescript
const authHeader = req.headers.get('Authorization')
const jwt = authHeader?.substring(7) // Remove "Bearer "

// Validate JWT
const authResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
  headers: {
    'Authorization': `Bearer ${jwt}`,
    'apikey': SUPABASE_SERVICE_ROLE_KEY
  }
})

if (!authResponse.ok) {
  return new Response(
    JSON.stringify({ error: 'unauthorized' }),
    { status: 401 }
  )
}

const user = await authResponse.json()
const userId = user.id
```

---

## Database Operations

### Using Service Role Key

**In Edge Functions:**

```typescript
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

// REST API
const response = await fetch(
  `${SUPABASE_URL}/rest/v1/android_devices?owner=eq.${userId}`,
  {
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json'
    }
  }
)
```

### Using Supabase JS Client

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// Query
const { data, error } = await supabase
  .from('android_devices')
  .select('*')
  .eq('owner', userId)

// Insert
const { data, error } = await supabase
  .from('android_devices')
  .insert({
    device_id: '1403938023',
    owner: userId
  })
  .select()

// Update
const { data, error } = await supabase
  .from('android_devices')
  .update({ friendly_name: 'Tablet Sala' })
  .eq('device_id', '1403938023')
```

---

## Monitoring and Logs

### Edge Function Logs

**Dashboard → Edge Functions → [Function Name] → Logs**

View:
- Invocations
- Errors
- Console.log output
- Execution time

### Database Logs

**Dashboard → Database → Logs**

View:
- Queries
- Slow queries
- Connection pool

### Auth Logs

**Dashboard → Authentication → Logs**

View:
- Sign-in attempts
- Password resets
- Token refreshes

---

## Performance Optimization

### Connection Pooling

**Automatically handled by Supabase.**

**Best Practices:**
- Use connection pooler URL for serverless
- Avoid long-running connections

### Indexes

**Critical indexes created:**

```sql
CREATE INDEX idx_android_devices_owner ON android_devices(owner);
CREATE INDEX idx_android_devices_device_id ON android_devices(device_id);
CREATE INDEX idx_android_devices_last_seen ON android_devices(last_seen_at DESC);
```

### Query Optimization

**Use SELECT specific columns:**
```typescript
// ❌ Bad
.select('*')

// ✅ Good
.select('id, device_id, friendly_name, notes')
```

**Use LIMIT for large datasets:**
```typescript
.select('*')
.limit(100)
```

---

## Security Best Practices

### 1. Never Expose Service Role Key

**❌ NEVER:**
```typescript
// Frontend code
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY // WRONG!
```

**✅ ALWAYS:**
```typescript
// Edge Function only
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
```

### 2. Validate All Inputs

```typescript
// Edge Function
const body = await req.json()

if (!body.device_id || typeof body.device_id !== 'string') {
  return jsonResponse({ error: 'invalid_payload' }, 400)
}
```

### 3. Use RLS Policies

```sql
-- Example: Users only see their devices
CREATE POLICY "Users can view own devices"
ON android_devices FOR SELECT
USING (auth.uid() = (
  SELECT auth_user_id FROM mesh_users WHERE id = owner
));
```

### 4. Rate Limiting (Future)

Consider implementing:
- IP-based rate limiting
- User-based rate limiting
- Function-level limits

---

## Troubleshooting

### Common Issues

**1. "Invalid JWT" / "Expected 3 parts in JWT; got 1"**

**Cause:** `SUPABASE_SERVICE_ROLE_KEY` is truncated or invalid

**Diagnosis:**
```bash
# Check JWT parts
echo "$SUPABASE_SERVICE_ROLE_KEY" | tr '.' '\n' | wc -l
# Expected: 3
# If you get 1 or 2 → key is truncated

# Check key length
echo "$SUPABASE_SERVICE_ROLE_KEY" | wc -c
# Expected: 300-400
# If you get <200 → key is incomplete

# Check key starts correctly
echo "$SUPABASE_SERVICE_ROLE_KEY" | head -c 10
# Expected: eyJhbGciOi
# If different → wrong key or corrupted
```

**Solution:**
1. Go to Supabase Dashboard → Settings → API
2. Find `service_role` key (NOT `anon` key)
3. Click "Reveal" and copy the COMPLETE token
4. Update `.env.local` with full token
5. Verify with commands above
6. Re-run script

**2. Token expires or malformed**

**Cause:** Using anon key instead of service_role key

**Solution:**
```bash
# Verify you're using the correct key
grep SUPABASE_SERVICE_ROLE_KEY .env.local
# Should start with: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3M...

# Anon keys are shorter and have different payload
# Service role keys are longer and contain 'service_role' in decoded payload
```

**3. "RLS policy violation"**

**Cause:** User trying to access data they don't own

**Solution:** Verify RLS policies are correct

**4. "Edge Function timeout"**

**Cause:** Function taking >60 seconds

**Solution:** Optimize queries, use background jobs

**5. "CORS error"**

**Cause:** Missing CORS headers

**Solution:** Add CORS headers to Edge Function response

---

## Backup and Recovery

### Automated Backups

**Supabase Pro Plan:**
- Daily automatic backups
- 7-day retention
- Point-in-time recovery

### Manual Backup

```bash
# Backup database
pg_dump -h db.your-project.supabase.co -U postgres -d postgres > backup.sql

# Restore
psql -h db.your-project.supabase.co -U postgres -d postgres < backup.sql
```

---

## Migration Management

### Create Migration

```bash
supabase migration new add_column_to_devices
```

**Edit:** `supabase/migrations/YYYYMMDDHHMMSS_add_column_to_devices.sql`

```sql
ALTER TABLE android_devices
ADD COLUMN geolocation JSONB;
```

### Apply Migration

```bash
supabase db push
```

### Migration History

**Dashboard → Database → Migrations**

View all applied migrations.

---

**Próxima Revisão:** Quando houver mudanças na integração com Supabase