# Arquitectura do Sistema RustDesk Mesh Integration

**Versão:** 1.0.0  
**Última Atualização:** 13 Dezembro 2025

## 📐 Visão Geral

Sistema de gestão de dispositivos Android para RustDesk com integração MeshCentral e Supabase, usando arquitetura serverless moderna.

## 🏗️ Componentes Principais

### 1. Frontend (Next.js 16 App Router)

**Stack Técnico:**
- Next.js 16.0.6 (App Router)
- React 18.3.1
- TypeScript 5.6.3
- Tailwind CSS 3.4.15

**Estrutura:**

```
src/app/
├── page.tsx                    # Login page
├── dashboard/
│   ├── page.tsx               # Main dashboard
│   └── profile/
│       └── page.tsx           # User profile
├── auth/
│   ├── reset-password/        # Password reset flow
│   └── confirm-reset/
└── api/
    └── login/
        └── route.ts           # Auth API route
```

**Responsabilidades:**
- Interface de utilizador (login, dashboard, modais)
- Gestão de estado local (React hooks)
- Comunicação com API routes e Edge Functions
- Renderização SSR/CSR híbrida

**Padrões de Design:**
- **Client Components**: Para interatividade (`"use client"`)
- **Server Components**: Para conteúdo estático (default)
- **API Routes**: Para lógica server-side segura
- **Hooks customizados**: Para lógica reutilizável

### 2. Backend (Supabase)

**Componentes Supabase:**

#### a) PostgreSQL Database
```
Tabelas:
├── auth.users                 # Supabase Auth (built-in)
├── mesh_users                 # Mapping auth → MeshCentral
├── android_devices            # Dispositivos registados
└── device_registration_sessions  # Sessões temporais de registo
```

#### b) Edge Functions (Deno Runtime)
```
supabase/functions/
├── get-devices/               # Listar devices do user
├── register-device/           # Registar/actualizar device
├── check-registration-status/ # Verificar sessão + matching
├── start-registration-session/ # Criar sessão temporal
└── generate-qr-image/         # Gerar QR SVG
```

#### c) Supabase Auth
- JWT-based authentication
- Session management
- Password reset flow
- Email confirmation

#### d) Row Level Security (RLS)
- Isolamento de dados por utilizador
- Políticas SQL para cada tabela
- Service role key para operações privilegiadas

### 3. RustDesk Server (HBBS/HBBR)

**Configuração:**
- **Host:** rustdesk.bwb.pt
- **Public Key:** `UzHEW0gpZLT6NIx3WAr9lvUG4Se2s7euUTKQ+SrvjJs=`
- **Protocolo:** RustDesk proprietary

**Função:**
- Broker de conexões remotas
- Registo de dispositivos Android
- Relay de tráfego P2P

### 4. MeshCentral (Gestão Complementar)

**Integração:**
- Gestão de estações Windows/Linux
- Pasta ANDROID para devices móveis
- Sync de devices via script opcional

**Admin canónico:**
- Email: `suporte@bwb.pt`
- `auth.users.id`: `9ebfa3dd-392c-489d-882f-8a1762cb36e8`
- `mesh_users.id`: `d0e4556e-49b6-407d-98b4-dbfdfc51b218`

## 🔄 Fluxos de Dados

### Fluxo 1: Autenticação

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │ POST /api/login
       │ { email, password }
       ↓
┌─────────────────────┐
│ Next.js API Route   │
│ /api/login/route.ts │
└──────┬──────────────┘
       │ signInWithPassword()
       ↓
┌─────────────────────┐
│  Supabase Auth API  │
│ /auth/v1/token      │
└──────┬──────────────┘
       │ access_token (JWT)
       ↓
┌─────────────┐
│ localStorage│
│ rustdesk_jwt│
└─────────────┘
```

**Notas:**
- JWT tem expiração de 1 hora
- Refresh token gerido automaticamente pelo Supabase
- API route valida credenciais antes de retornar token

### Fluxo 2: Listagem de Dispositivos

```
┌─────────────┐
│  Dashboard  │
└──────┬──────┘
       │ GET /functions/v1/get-devices
       │ Authorization: Bearer <JWT>
       ↓
┌─────────────────────────┐
│ Edge Function           │
│ get-devices/index.ts    │
└──────┬──────────────────┘
       │ 1. Validate JWT
       │ 2. Extract user_id
       ↓
┌─────────────────────────┐
│  Supabase Auth API      │
│  /auth/v1/user          │
└──────┬──────────────────┘
       │ user.id
       ↓
┌─────────────────────────┐
│  PostgreSQL (RLS)       │
│  android_devices        │
│  WHERE owner=user.id    │
└──────┬──────────────────┘
       │ devices[]
       ↓
┌─────────────┐
│  Dashboard  │
│  (render)   │
└─────────────┘
```

**Notas:**
- RLS garante isolamento de dados
- Service role key usado na Edge Function
- Frontend recebe apenas devices do user

### Fluxo 3: Registo de Dispositivo (Completo)

```
┌─────────────┐
│  Dashboard  │ User clica "Adicionar Dispositivo"
└──────┬──────┘
       │ POST /functions/v1/start-registration-session
       ↓
┌──────────────────────────┐
│ Edge Function            │
│ start-registration-      │
│ session/index.ts         │
└──────┬───────────────────┘
       │ INSERT INTO device_registration_sessions
       │ - user_id
       │ - clicked_at = NOW()
       │ - expires_at = NOW() + 5min
       │ - status = 'awaiting_device'
       ↓
┌──────────────────────────┐
│ PostgreSQL               │
│ device_registration_     │
│ sessions                 │
└──────┬───────────────────┘
       │ { session_id, expires_at }
       ↓
┌─────────────┐
│  Dashboard  │
│  Modal com: │
│  - QR code  │ ← GET /functions/v1/generate-qr-image
│  - Timer    │
└──────┬──────┘
       │
       │ User escaneia QR no Android RustDesk
       ↓
┌─────────────────────────┐
│  RustDesk Server        │
│  rustdesk.bwb.pt        │
└──────┬──────────────────┘
       │ Device conecta e regista-se
       │ (sem owner ainda)
       ↓
┌──────────────────────────┐
│ PostgreSQL               │
│ android_devices          │
│ INSERT (owner=null)      │
└──────────────────────────┘
       │
       │ User clica "Verificar Dispositivo"
       ↓
┌─────────────┐
│  Dashboard  │
└──────┬──────┘
       │ GET /functions/v1/check-registration-status
       │     ?session_id=<UUID>
       ↓
┌──────────────────────────────┐
│ Edge Function                │
│ check-registration-status    │
│                              │
│ MATCHING TEMPORAL:           │
│ 1. Buscar devices órfãos     │
│    WHERE owner IS NULL       │
│    AND last_seen_at >=       │
│        session.clicked_at-10m│
│                              │
│ 2. Pegar device mais recente │
│                              │
│ 3. UPDATE android_devices    │
│    SET owner = user.id       │
│                              │
│ 4. UPDATE session            │
│    SET status = 'completed'  │
│    SET matched_device_id     │
└──────┬───────────────────────┘
       │ { status: 'completed', device_info }
       ↓
┌─────────────┐
│  Dashboard  │
│  Modal:     │
│  "✅ Device │
│  Detectado!"│
└──────┬──────┘
       │ Device aparece em "Por Adotar"
       ↓
┌─────────────┐
│  Dashboard  │ User clica "Adotar"
└──────┬──────┘
       │ Modal de adopção
       │ User preenche:
       │ - friendly_name
       │ - group
       │ - subgroup
       ↓
┌─────────────┐
│  Dashboard  │
└──────┬──────┘
       │ POST /functions/v1/register-device
       │ { device_id, friendly_name,
       │   notes: "Grupo | Subgrupo" }
       ↓
┌──────────────────────────────┐
│ Edge Function                │
│ register-device/index.ts     │
└──────┬───────────────────────┘
       │ UPDATE android_devices
       │ SET friendly_name, notes
       ↓
┌──────────────────────────────┐
│ PostgreSQL                   │
│ android_devices              │
│ (device agora adopted)       │
└──────┬───────────────────────┘
       │ Refresh devices
       ↓
┌─────────────┐
│  Dashboard  │
│  Device no  │
│  grupo      │
│  correcto   │
└─────────────┘
```

### Fluxo 4: Organização Hierárquica

**Parsing do campo `notes`:**

```typescript
// Formato: "Grupo | Subgrupo | Comentário"

// Exemplo 1: Apenas Grupo
notes = "Escritório"
→ grupo: "Escritório"
→ subgrupo: ""

// Exemplo 2: Grupo + Subgrupo
notes = "Pizza Hut | Loja 1"
→ grupo: "Pizza Hut"
→ subgrupo: "Loja 1"

// Exemplo 3: Grupo + Subgrupo + Comentário
notes = "BWB | Sala 2 | Tablet Samsung"
→ grupo: "BWB"
→ subgrupo: "Sala 2"
→ comentário: "Tablet Samsung" (usado como friendly_name)

// Exemplo 4: Device não adoptado
notes = null ou ""
→ Vai para "Dispositivos por Adotar"
```

**Algoritmo de Agrupamento (`src/lib/grouping.ts`):**

```typescript
function groupDevices(devices) {
  const result = {};
  
  for (const device of devices) {
    const { group, subgroup } = parseNotesToGrouping(device.notes);
    
    // Criar estrutura hierárquica
    if (!result[group]) result[group] = {};
    if (!result[group][subgroup]) result[group][subgroup] = [];
    
    result[group][subgroup].push(device);
  }
  
  return result;
}

// Output:
{
  "Escritório": {
    "Sala 1": [device1, device2],
    "Sala 2": [device3]
  },
  "Pizza Hut": {
    "Loja 1": [device4],
    "Loja 2": [device5]
  }
}
```

## 🔐 Segurança

### 1. Row Level Security (RLS)

**Tabela `android_devices`:**
```sql
-- Users só vêem seus próprios devices
CREATE POLICY "Users can view own devices"
ON android_devices FOR SELECT
USING (auth.uid() = owner);

-- Users só criam devices para si mesmos
CREATE POLICY "Users can insert own devices"
ON android_devices FOR INSERT
WITH CHECK (auth.uid() = owner);

-- Users só actualizam seus próprios devices
CREATE POLICY "Users can update own devices"
ON android_devices FOR UPDATE
USING (auth.uid() = owner);
```

**Tabela `device_registration_sessions`:**
```sql
-- Users só vêem suas próprias sessões
CREATE POLICY "Users can view own sessions"
ON device_registration_sessions FOR SELECT
USING (auth.uid() = user_id);

-- Users só criam sessões para si mesmos
CREATE POLICY "Users can create own sessions"
ON device_registration_sessions FOR INSERT
WITH CHECK (auth.uid() = user_id);
```

### 2. Validação de JWT

**Edge Functions:**
```typescript
// 1. Extrair JWT do header Authorization
const jwt = req.headers.get("Authorization")?.replace("Bearer ", "");

// 2. Validar com Supabase Auth API
const authResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
  headers: {
    Authorization: `Bearer ${jwt}`,
    apikey: SUPABASE_SERVICE_ROLE_KEY,
  },
});

// 3. Se válido, extrair user_id
const user = await authResponse.json();
const userId = user.id;

// 4. Usar userId em queries
```

### 3. Service Role vs. Anon Key

**Anon Key (Frontend):**
- Usado em chamadas de frontend
- Restrito por RLS
- Apenas operações permitidas para o user

**Service Role Key (Edge Functions):**
- Usado em Edge Functions
- Bypass RLS
- Operações privilegiadas (ex: matching temporal)

## 📦 Deployment

### Pipeline de Deployment

```
┌──────────────────┐
│ Local Machine    │
└────────┬─────────┘
         │
         │ Step 1: Download from main
         │ - git fetch origin
         │ - git reset --hard origin/main
         ↓
┌──────────────────┐
│ Local Machine    │
└────────┬─────────┘
         │
         │ Step 2: Build local
         │ - npm ci
         │ - npm run build
         │ - Validate .next/
         ↓
┌──────────────────┐
│ Local Machine    │
└────────┬─────────┘
         │
         │ Step 3: Test local
         │ - npm run lint
         │ - npm test
         ↓
┌──────────────────┐
│ Local Machine    │
└────────┬─────────┘
         │
         │ Step 4: Deploy to droplet
         │ - rsync files
         │ - npm install --omit=dev
         │ - systemctl restart
         │ - Health checks
         ↓
┌──────────────────┐
│ Production       │
│ 46.101.78.179    │
│ :3000            │
└────────┬─────────┘
         │
         │ NGINX proxy
         ↓
┌──────────────────┐
│ rustdesk.bwb.pt  │
│ (HTTPS)          │
└──────────────────┘
```

### Validações em Cada Step

**Step 1:**
- ✅ Branch existe
- ✅ Sem alterações locais não commitadas
- ✅ .git/ válido

**Step 2:**
- ✅ .env.local existe
- ✅ Variáveis Supabase configuradas
- ✅ Directórios src/ completos
- ✅ Build sem erros
- ✅ .next/BUILD_ID gerado

**Step 3:**
- ✅ ESLint passa
- ✅ Testes unitários passam
- ✅ TypeScript compila

**Step 4:**
- ✅ SSH conecta
- ✅ rsync completa
- ✅ Permissões correctas
- ✅ Service restart
- ✅ HTTP 200 responde
- ✅ Port 3000 listening

## 🎯 Decisões de Design

### Por que Next.js App Router?

- ✅ SSR/SSG híbrido para melhor performance
- ✅ API routes integradas (sem backend separado)
- ✅ File-based routing (convenção sobre configuração)
- ✅ React Server Components (menos JS no cliente)

### Por que Supabase?

- ✅ PostgreSQL com RLS built-in
- ✅ Auth gerido (JWT, sessões, emails)
- ✅ Edge Functions (Deno) para lógica serverless
- ✅ Realtime (futuro: notificações)
- ✅ Gestão de API keys simplificada

### Por que Matching Temporal On-Demand?

**Alternativas consideradas:**

1. **Polling automático no frontend** ❌
   - Consome recursos desnecessariamente
   - Complexidade extra de cleanup

2. **Cron job a cada 1 minuto** ❌
   - Dependência de infraestrutura extra
   - Debugging mais difícil
   - Latência variável

3. **On-demand (escolhido) + Fallback admin** ✅
   - User controla quando verificar
   - Sem polling desnecessário
   - Matching temporal numa janela curta (0–8min após o clique)
   - Feedback imediato quando user clica
   - Quando o matching não é possível de forma inequívoca:
     - Device é atribuído ao admin canónico
     - Fica na secção "Dispositivos sem Utilizador Atribuido" para triagem manual

### Por que systemd em vez de PM2?

- ✅ Nativo do Linux (menos dependências)
- ✅ Integração com journalctl
- ✅ Mais estável para produção
- ✅ Reinício automático em crash

## 📊 Métricas e Monitorização

### Logs Estruturados

**Formato (debugLogger.ts):**
```json
{
  "timestamp": "2025-12-13T20:00:00.000Z",
  "level": "info",
  "context": "login",
  "message": "User authenticated",
  "requestId": "login-1234567890",
  "metadata": {
    "userId": "uuid",
    "clientIp": "1.2.3.4"
  }
}
```

**Níveis:**
- `debug`: Detalhes técnicos
- `info`: Eventos normais
- `warn`: Situações inesperadas mas não críticas
- `error`: Erros que requerem atenção

### Health Checks

**Endpoint:** `http://127.0.0.1:3000`

**Critérios:**
- HTTP 200 ou 307 (redirect)
- Response < 5 segundos
- Port 3000 listening

**Monitorização:**
```bash
# Verificar service
systemctl status rustdesk-frontend

# Logs em tempo real
journalctl -u rustdesk-frontend -f

# Últimos 50 logs
journalctl -u rustdesk-frontend -n 50
```

## 🔄 Evolução Futura

### Roadmap Técnico

**Fase 1 (Atual):** ✅
- Sistema de autenticação
- Gestão de dispositivos
- Registo via QR code
- Matching temporal on-demand

**Fase 2 (Próxima):**
- [ ] Notificações realtime (Supabase Realtime)
- [ ] Histórico de conexões
- [ ] Dashboard de estatísticas
- [ ] Exportação de relatórios

**Fase 3 (Futuro):**
- [ ] App mobile nativa (React Native)
- [ ] API pública para integrações
- [ ] Webhooks para eventos
- [ ] Multi-tenancy

### Melhorias de Performance

**Optimizações Planeadas:**
- [ ] Caching de devices no frontend (React Query)
- [ ] Lazy loading de grupos no dashboard
- [ ] Service Worker para offline support
- [ ] Optimistic updates na UI

### Escalabilidade

**Limites Actuais:**
- ~1000 devices por utilizador (testado)
- ~100 registos simultâneos (estimado)

**Para escalar além:**
- Particionamento de tabelas por user
- Read replicas no PostgreSQL
- CDN para assets estáticos
- Load balancing de Edge Functions

## 📚 Referências

### Documentação Externa

- [Next.js 16 Docs](https://nextjs.org/docs)
- [Supabase Docs](https://supabase.com/docs)
- [RustDesk Protocol](https://rustdesk.com/docs/)
- [PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)

### Código de Referência

- Padrões de autenticação: `src/app/api/login/route.ts`
- Lógica de agrupamento: `src/lib/grouping.ts`
- Matching temporal: `supabase/functions/check-registration-status/index.ts`

---

**Última Revisão:** 13 Dezembro 2025  
**Autor:** Equipa BWB/Datalink/ZSA