# 📱 Fluxo de Registro de Dispositivos Android - Documentação Completa

## 🎯 Visão Geral

Sistema de registro automático de dispositivos Android usando RustDesk com associação inteligente baseada em sessões temporais.

## 🔄 Fluxo Completo

```
┌─────────────────┐
│   Dashboard     │
│                 │
│  [+ Adicionar]  │ ← User clica
└────────┬────────┘
         │
         ↓
┌─────────────────────────────────┐
│ Edge Function:                  │
│ start-registration-session      │
│                                 │
│ Regista:                        │
│ - user_id                       │
│ - timestamp (clicked_at)        │
│ - IP address                    │
│ - User agent                    │
│ - Geolocation (opcional)        │
│ - expires_at (+5 min)           │
│ - status: 'awaiting_device'     │
└────────┬────────────────────────┘
         │
         ↓
┌─────────────────────────────────┐
│ Modal mostra:                   │
│                                 │
│  ⏱️ Tempo: 04:32                │
│  [████████░░] 91%               │
│                                 │
│  [QR CODE]                      │
│                                 │
│  🔄 Aguardando dispositivo...   │
└────────┬────────────────────────┘
         │
         ├─ Polling a cada 2s ──┐
         │                       │
         ↓                       ↓
┌─────────────────────────────────┐
│ Edge Function:                  │
│ check-registration-status       │
│                                 │
│ Verifica:                       │
│ - Sessão expirou?               │
│ - Device já associado?          │
│ - Status atual                  │
└─────────────────────────────────┘
         │
         ↓
   ┌────┴────┐
   │         │
   ↓         ↓
AGUARDANDO  EXPIRADO
   │         │
   │         └─→ Modal: "⏱️ Tempo esgotado"
   │
   ↓
USER ESCANEIA QR
   │
   ↓
┌─────────────────────────────────┐
│ 📱 App RustDesk Android         │
│                                 │
│ 1. Lê QR code                   │
│ 2. Extrai config:               │
│    - host: rustdesk.bwb.pt      │
│    - relay: rustdesk.bwb.pt     │
│    - key: UzHEW0g...            │
│ 3. Conecta ao servidor          │
└────────┬────────────────────────┘
         │
         ↓
┌─────────────────────────────────┐
│ 🖥️ Servidor RustDesk            │
│                                 │
│ Regista novo device com:        │
│ - device_id (gerado)            │
│ - timestamp conexão             │
└────────┬────────────────────────┘
         │
         ↓
┌─────────────────────────────────┐
│ 🔄 Script: sync-devices.sh      │
│    (roda a cada 1 minuto)       │
│                                 │
│ MATCHING TEMPORAL:              │
│                                 │
│ 1. Buscar sessões ativas:       │
│    WHERE status='awaiting'      │
│    AND expires_at > NOW()       │
│                                 │
│ 2. Buscar devices novos:        │
│    WHERE owner IS NULL          │
│    AND created_at > NOW()-5min  │
│                                 │
│ 3. Para cada device:            │
│    - Pegar sessão mais antiga   │
│    - Verificar timing:          │
│      device.created_at >        │
│      session.clicked_at         │
│    - Se match:                  │
│      * Associar device ao user  │
│      * Marcar sessão completed  │
│      * Registar matched_at      │
└────────┬────────────────────────┘
         │
         ↓
┌─────────────────────────────────┐
│ Database atualizado:            │
│                                 │
│ android_devices:                │
│ - owner = user_id ✅            │
│ - mesh_username = username ✅   │
│                                 │
│ device_registration_sessions:   │
│ - status = 'completed' ✅       │
│ - matched_device_id = id ✅     │
│ - matched_at = NOW() ✅         │
└────────┬────────────────────────┘
         │
         ↓
┌─────────────────────────────────┐
│ Frontend polling detecta:       │
│                                 │
│ status === 'completed'          │
│                                 │
│ Modal mostra:                   │
│ ✅ Dispositivo adicionado!      │
│                                 │
│ ID: 123456789                   │
│ Nome: Samsung Galaxy A54        │
│                                 │
│ [Adicionar outro] [Fechar]      │
└─────────────────────────────────┘
```

## 🗄️ Schema da Tabela

```sql
CREATE TABLE device_registration_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '5 minutes'),
  ip_address TEXT,
  user_agent TEXT,
  geolocation JSONB,
  status TEXT NOT NULL DEFAULT 'awaiting_device',
  matched_device_id TEXT,
  matched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_sessions_user_status ON device_registration_sessions(user_id, status);
CREATE INDEX idx_sessions_expires ON device_registration_sessions(expires_at);
CREATE INDEX idx_sessions_clicked ON device_registration_sessions(clicked_at);
```

## 🔒 Estados da Sessão

| Status | Descrição | Transições |
|--------|-----------|------------|
| `awaiting_device` | Aguardando device conectar | → `completed` ou `expired` |
| `completed` | Device associado com sucesso | Final |
| `expired` | Timeout (5 min) sem match | Final |

## 🎯 Algoritmo de Matching

### Critérios de Match

```typescript
function canMatch(device: Device, session: Session): boolean {
  return (
    // Sessão ainda válida
    session.status === 'awaiting_device' &&
    session.expires_at > NOW() &&
    session.matched_device_id === null &&
    
    // Device novo sem owner
    device.owner === null &&
    device.created_at > (NOW() - 5 minutes) &&
    
    // Timing correto
    device.created_at > session.clicked_at
  );
}
```

### Ordem de Precedência

1. **Sessão mais antiga não usada** (FIFO)
2. **Device criado APÓS clique** (validação temporal)
3. **First-come, first-served** (um device = uma sessão)

### Edge Cases

| Cenário | Comportamento |
|---------|---------------|
| User clica 2x seguido | Cria 2 sessões → associa 2 devices diferentes |
| 2 users ao mesmo tempo | Cada sessão independente, match por ordem |
| Device demora >5min | Sessão expira → device vai para "Dispositivos por Adotar" |
| Device conecta antes de clicar | Impossível (validação temporal) |
| Script sync falha | Próxima execução tenta novamente (idempotente) |

## 🔧 API Endpoints

### 1. POST `/functions/v1/start-registration-session`

Inicia nova sessão de registro.

**Headers:**
```http
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
apikey: <SUPABASE_ANON_KEY>
```

**Request Body (opcional):**
```json
{
  "geolocation": {
    "latitude": 38.7223,
    "longitude": -9.1393
  }
}
```

**Response:**
```json
{
  "success": true,
  "session_id": "uuid-da-sessao",
  "expires_at": "2025-12-11T01:30:00Z",
  "expires_in_seconds": 300
}
```

**Errors:**
```json
// 401 Unauthorized
{
  "error": "unauthorized",
  "message": "Invalid or expired token"
}

// 500 Config Error
{
  "error": "config_error",
  "message": "Missing Supabase configuration"
}
```

### 2. GET `/functions/v1/check-registration-status?session_id=<UUID>`

Verifica status da sessão.

**Headers:**
```http
Authorization: Bearer <JWT_TOKEN>
apikey: <SUPABASE_ANON_KEY>
```

**Response (awaiting):**
```json
{
  "success": true,
  "status": "awaiting_device",
  "expires_at": "2025-12-11T01:30:00Z",
  "time_remaining_seconds": 180,
  "device_info": null,
  "matched_at": null
}
```

**Response (completed):**
```json
{
  "success": true,
  "status": "completed",
  "expires_at": "2025-12-11T01:30:00Z",
  "time_remaining_seconds": 0,
  "device_info": {
    "device_id": "123456789",
    "friendly_name": "Samsung Galaxy A54",
    "notes": "Dispositivo do João"
  },
  "matched_at": "2025-12-11T01:27:30Z"
}
```

**Response (expired):**
```json
{
  "success": true,
  "status": "expired",
  "expires_at": "2025-12-11T01:30:00Z",
  "time_remaining_seconds": 0,
  "device_info": null,
  "matched_at": null
}
```

### 3. GET `/functions/v1/generate-qr-image`

Gera imagem SVG do QR code.

**Headers:**
```http
Authorization: Bearer <JWT_TOKEN>
apikey: <SUPABASE_ANON_KEY>
```

**Response:**
```xml
Content-Type: image/svg+xml

<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <!-- QR code SVG data -->
</svg>
```

## 🚀 Deploy e Configuração

### 1. Deploy Edge Functions

```bash
# Deploy todas as funções necessárias
supabase functions deploy start-registration-session
supabase functions deploy check-registration-status
supabase functions deploy generate-qr-image
supabase functions deploy get-qr
```

### 2. Configurar Cron Job

```bash
# Adicionar ao crontab
crontab -e

# Rodar sync a cada 1 minuto
* * * * * /opt/rustdesk-integration/scripts/sync-devices.sh >> /opt/rustdesk-integration/logs/sync.log 2>&1
```

### 3. Variáveis de Ambiente

```bash
# /opt/meshcentral/meshcentral-data/sync-env.sh
export SUPABASE_URL="https://kqwaibgvmzcqeoctukoy.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="eyJ..."
export SUPABASE_ANON_KEY="eyJ..."
export SYNC_JWT="eyJ..."  # JWT de sync com permissões especiais
```

### 4. Verificar Logs

```bash
# Logs do script sync
tail -f /opt/rustdesk-integration/logs/sync.log

# Logs das Edge Functions (Supabase Dashboard)
# Functions > [function-name] > Logs
```

## 🧪 Testes

### Teste 1: Fluxo Completo Normal

```bash
# 1. User clica "Adicionar Dispositivo" no dashboard
# 2. Verifica que sessão foi criada:
curl -H "Authorization: Bearer $JWT" \
     -H "apikey: $ANON_KEY" \
     "$SUPABASE_URL/rest/v1/device_registration_sessions?user_id=eq.$USER_ID&status=eq.awaiting_device"

# 3. Escanear QR no Android
# 4. Aguardar 1-2 minutos (próxima execução do sync)
# 5. Verificar que sessão foi marcada como completed:
curl -H "Authorization: Bearer $JWT" \
     -H "apikey: $ANON_KEY" \
     "$SUPABASE_URL/rest/v1/device_registration_sessions?id=eq.$SESSION_ID"

# Resultado esperado: status='completed', matched_device_id preenchido
```

### Teste 2: Timeout

```bash
# 1. Clicar "Adicionar Dispositivo"
# 2. NÃO escanear QR
# 3. Aguardar 6 minutos
# 4. Verificar que sessão expirou:
curl -H "Authorization: Bearer $JWT" \
     -H "apikey: $ANON_KEY" \
     "$SUPABASE_URL/rest/v1/device_registration_sessions?id=eq.$SESSION_ID"

# Resultado esperado: status='expired'
```

### Teste 3: Múltiplos Dispositivos

```bash
# 1. Clicar "Adicionar Dispositivo"
# 2. Escanear QR no Device 1
# 3. Aguardar match
# 4. Clicar novamente "Adicionar Dispositivo"
# 5. Escanear QR no Device 2
# 6. Verificar que ambos foram associados corretamente ao mesmo user
```

### Teste 4: 2 Users Simultâneos

```bash
# User A e User B clicam ao mesmo tempo
# User A escaneia primeiro → Device A
# User B escaneia depois → Device B
# Verificar que cada device foi pro user correto
```

## 📊 Monitorização

### Queries Úteis

```sql
-- Sessões ativas agora
SELECT * FROM device_registration_sessions
WHERE status = 'awaiting_device'
  AND expires_at > NOW()
ORDER BY clicked_at ASC;

-- Taxa de sucesso (últimas 24h)
SELECT 
  status,
  COUNT(*) as total,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM device_registration_sessions
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY status;

-- Tempo médio até match
SELECT 
  AVG(EXTRACT(EPOCH FROM (matched_at - clicked_at))) as avg_seconds
FROM device_registration_sessions
WHERE status = 'completed'
  AND created_at > NOW() - INTERVAL '24 hours';

-- Devices órfãos (sem owner)
SELECT * FROM android_devices
WHERE owner IS NULL
  AND deleted_at IS NULL
ORDER BY created_at DESC;
```

## 🐛 Troubleshooting

### Problema: Device não aparece após escanear

**Verificações:**
1. Sessão foi criada?
   ```sql
   SELECT * FROM device_registration_sessions WHERE user_id = '<USER_ID>' ORDER BY created_at DESC LIMIT 1;
   ```

2. Device apareceu no RustDesk?
   ```bash
   # Verificar logs do servidor RustDesk
   ```

3. Script sync rodou?
   ```bash
   tail -f /opt/rustdesk-integration/logs/sync.log
   ```

4. Device tem owner NULL?
   ```sql
   SELECT * FROM android_devices WHERE device_id = '<DEVICE_ID>';
   ```

### Problema: Sessão expira muito rápido

**Solução:** Aumentar timeout
```sql
-- Alterar default de 5 para 10 minutos
ALTER TABLE device_registration_sessions 
ALTER COLUMN expires_at SET DEFAULT (NOW() + INTERVAL '10 minutes');
```

### Problema: Match errado (device foi para user errado)

**Causa:** Race condition no matching

**Solução:** Verificar lógica no sync-devices.sh:
```bash
# Garantir que matching é por ordem (FIFO)
# Sessão mais antiga → Device mais antigo
```

## 🔐 Segurança

### RLS Policies

```sql
-- Users só veem suas próprias sessões
CREATE POLICY "Users can view own sessions"
ON device_registration_sessions FOR SELECT
USING (auth.uid() = user_id);

-- Users só criam sessões para si mesmos
CREATE POLICY "Users can create own sessions"
ON device_registration_sessions FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Apenas service role pode atualizar
-- (sync-devices.sh usa service role key)
```

### Rate Limiting

Considerar adicionar rate limit na Edge Function:
```typescript
// Máximo 10 sessões por hora por user
const recentSessions = await supabase
  .from('device_registration_sessions')
  .select('count')
  .eq('user_id', userId)
  .gte('created_at', oneHourAgo);

if (recentSessions.count > 10) {
  return error('rate_limit_exceeded');
}
```

## 📈 Métricas de Sucesso

- **Taxa de match:** >95% dos devices devem ser associados automaticamente
- **Tempo médio:** <2 minutos entre clique e match
- **Taxa de erro:** <1% de sessões com problemas
- **Órfãos:** <5% dos devices sem match (devices antigos, antes do sistema)

## 🎓 Conclusão

Este sistema implementa uma solução robusta e escalável para registro automático de dispositivos Android, mantendo a simplicidade da infraestrutura (QR único) enquanto garante associação correta através de sessões temporais.

**Vantagens:**
- ✅ Sem modificação da app RustDesk
- ✅ Sem modificação do servidor RustDesk
- ✅ UX intuitiva e clara
- ✅ Rastreabilidade completa
- ✅ Tolerante a falhas
- ✅ Escalável