# Sync Engine - Matching Temporal

**Última Atualização:** 13 Dezembro 2025

## 🔄 Sistema de Sincronização

O Sync Engine é responsável por associar dispositivos Android ao utilizador correto através de **matching temporal on-demand**.

---

## Validação de Schema (Pré-requisito)

Antes de executar qualquer sync MeshCentral → Supabase, é **obrigatório** validar que a tabela `mesh_users` tem o schema correto com suporte multi-domínio.

### Script de Validação

**Localização:** `scripts/validate-mesh-users-schema.fixed.sh`

**Função:**
- Conecta ao Supabase via REST API
- Extrai colunas da tabela `mesh_users`
- Valida que as 17 colunas obrigatórias existem
- Confirma suporte multi-domínio (`domain_key`, `domain`, `domain_dns`)

### Uso Básico

```bash
# Validação normal
bash scripts/validate-mesh-users-schema.fixed.sh

# Validação com debug detalhado
DEBUG=1 bash scripts/validate-mesh-users-schema.fixed.sh
```

### Colunas Obrigatórias Validadas

```
✓ id                    - UUID primary key
✓ mesh_username         - Username do MeshCentral
✓ auth_user_id          - Link para auth.users
✓ external_user_id      - MeshCentral _id (e.g., "user//admin")
✓ domain_key            - "" | "zonetech" | "zsangola"
✓ domain                - Campo domain do MeshCentral (CRÍTICO)
✓ domain_dns            - mesh.bwb.pt | zonetech.bwb.pt
✓ email                 - Email do utilizador
✓ name                  - Nome completo
✓ display_name          - Nome a mostrar
✓ disabled              - Estado do utilizador
✓ siteadmin             - Bitmask de permissões globais
✓ domainadmin           - Bitmask de permissões de domínio
✓ role                  - USER | LIMITED_ADMIN | DOMAIN_ADMIN | SUPERADMIN
✓ source                - meshcentral
✓ created_at            - Timestamp de criação
✓ deleted_at            - Timestamp de soft delete
```

### Output de Sucesso

```
════════════════════════════════════════════════════════════
  ✓ SCHEMA VÁLIDO - SYNC PODE SER EXECUTADO
════════════════════════════════════════════════════════════

Próximos passos:

1. Executar sync manual:
   bash /opt/rustdesk-frontend/scripts/sync-meshcentral-to-supabase.sh

2. Ou activar o timer systemd:
   systemctl start meshcentral-supabase-sync.timer
```

### Troubleshooting Validação

**Problema: Colunas em falta**

```bash
# Output de erro
✗ domain_key (FALTA)
✗ domain (FALTA)
✗ domain_dns (FALTA)

SCHEMA INCOMPLETO - SYNC VAI FALHAR
```

**Solução:**
1. Aplicar migração no Supabase SQL Editor:
   ```
   https://supabase.com/dashboard/project/<ref>/sql/new
   ```
2. Copiar SQL de: `supabase/migrations/20251219040000_migration_mesh_users_multidomain.sql`
3. Executar a migração
4. Correr novamente o script de validação

**Problema: Resposta JSON inválida**

```bash
# Debug mode
DEBUG=1 bash scripts/validate-mesh-users-schema.fixed.sh
```

Verificar:
- `SUPABASE_URL` correto em `.env.local`
- `SUPABASE_SERVICE_ROLE_KEY` válido
- Conectividade de rede ao Supabase
- Tabela `mesh_users` existe e tem pelo menos 1 registo

### Debug Mode Output

Com `DEBUG=1`, o script mostra:
```bash
DEBUG: Resposta HTTP completa (primeiros 500 chars):
[{"id":"d0e4556e-49b6-407d-98b4-dbfdfc51b218",...}]

DEBUG: Número de registos: 1

DEBUG: Variável COLS_LIST (via od -c):
0000000   a   u   t   h   _   u   s   e   r   _   i   d  \n   c   r   e
...

DEBUG: Variável COLS_LIST (linhas numeradas):
     1	auth_user_id
     2	created_at
     ...
```

Útil para diagnosticar:
- Problemas de parsing JSON
- Colunas com nomes inesperados
- Encodings incorretos

---

## Conceitos Fundamentais

### 1. Device States

Um dispositivo passa por 3 estados:

```
┌─────────────┐
│   ÓRFÃO     │ owner=null, notes=null
│ (Orphan)    │ Device conectou mas não foi associado
└──────┬──────┘
       │
       │ Matching Temporal
       ↓
┌──────────────┐
│ POR ADOTAR   │ owner!=null, notes=null/empty
│ (Unadopted)  │ Device associado mas sem organização
└──────┬───────┘
       │
       │ Adopt Manual
       ↓
┌──────────────┐
│  ADOPTADO    │ owner!=null, notes="Group | Subgroup"
│  (Adopted)   │ Device totalmente configurado
└──────────────┘
```

### 2. Registration Session

Sessão temporal de 5 minutos que permite matching:

```typescript
interface RegistrationSession {
  id: UUID;
  user_id: UUID;
  clicked_at: TIMESTAMPTZ;     // Quando user clicou "Adicionar"
  expires_at: TIMESTAMPTZ;      // clicked_at + 5 minutos
  status: 'awaiting_device' | 'completed' | 'expired';
  matched_device_id?: string;
  matched_at?: TIMESTAMPTZ;
}
```

### 3. Matching Window

Janela de tempo para encontrar device órfão:

```
User clica "Adicionar" às 20:00
              ↓
clicked_at = 20:00
              ↓
Busca devices com:
  last_seen_at >= 19:50  (10 min ANTES)
  last_seen_at <= 20:00  (até o clique)
```

**Razão:** Android pode ter conectado ANTES do user clicar.

---

## Fluxo Completo de Registro

### Fase 1: Preparação (Frontend)

```
1. User clica "Adicionar Dispositivo"
   ↓
2. Frontend chama: POST /functions/v1/start-registration-session
   Request: {
     geolocation: null  // Opcional
   }
   ↓
3. Edge Function cria sessão:
   INSERT INTO device_registration_sessions (
     user_id,
     clicked_at,
     expires_at,
     status
   ) VALUES (
     current_user_id,
     NOW(),
     NOW() + INTERVAL '5 minutes',
     'awaiting_device'
   )
   ↓
4. Retorna: {
     session_id: "uuid",
     expires_at: "2025-12-13T20:05:00Z",
     expires_in_seconds: 300
   }
   ↓
5. Frontend chama: GET /functions/v1/generate-qr-image
   ↓
6. Edge Function gera QR code:
   Config: {
     "host": "rustdesk.bwb.pt",
     "key": "UzHEW0gpZLT6NIx3WAr9lvUG4Se2s7euUTKQ+SrvjJs="
   }
   ↓
7. Retorna: PNG blob (256x256)
   ↓
8. Frontend mostra modal:
   - QR code
   - Countdown timer (visual apenas)
   - Botão "Verificar Dispositivo"
```

### Fase 2: Conexão Android

```
9. User escaneia QR no Android (app RustDesk)
   ↓
10. Android conecta ao rustdesk.bwb.pt
    ↓
11. RustDesk server detecta novo device
    ↓
12. [Processo externo/manual] Alguém/algo chama:
    POST /functions/v1/register-device
    Headers: Authorization: Bearer <SERVICE_ROLE_KEY>
    Body: {
      device_id: "1403938023",
      last_seen: "2025-12-13T20:01:30Z"
    }
    ↓
13. Edge Function cria device órfão:
    INSERT INTO android_devices (
      device_id,
      owner,           -- NULL
      last_seen_at,
      created_at
    ) VALUES (
      '1403938023',
      NULL,            -- ÓRFÃO
      '2025-12-13T20:01:30Z',
      NOW()
    )
```

**Nota:** Passo 12 é atualmente externo. Pode ser:
- Script de sync periódico
- RustDesk server plugin
- Manual via API

### Fase 3: Matching Temporal (On-Demand)

```
14. User clica "Verificar Dispositivo" no frontend
    ↓
15. Frontend chama: 
    GET /functions/v1/check-registration-status?session_id=<uuid>
    ↓
16. Edge Function executa matching temporal:
    
    a) Buscar sessão:
       SELECT * FROM device_registration_sessions
       WHERE id = session_id
         AND user_id = current_user_id
         AND status = 'awaiting_device'
         AND expires_at > NOW()
    
    b) Se sessão expirou (expires_at < NOW()):
       UPDATE status = 'expired'
       RETURN { status: 'expired' }
    
    c) Se sessão válida, buscar órfãos:
       SELECT *
       FROM android_devices
       WHERE owner IS NULL
         AND deleted_at IS NULL
         AND last_seen_at >= (session.clicked_at - INTERVAL '10 minutes')
       ORDER BY last_seen_at DESC
       LIMIT 1
    
    d) Se encontrou device:
       - Buscar mesh_user do current_user
       - UPDATE android_devices SET
           owner = mesh_user.id,
           mesh_username = mesh_user.mesh_username
         WHERE device_id = matched_device.id
       
       - UPDATE device_registration_sessions SET
           status = 'completed',
           matched_device_id = matched_device.id,
           matched_at = NOW()
         WHERE id = session_id
       
       - RETURN {
           status: 'completed',
           device_info: {
             device_id: matched_device.id,
             friendly_name: null
           }
         }
    
    e) Se NÃO encontrou device:
       RETURN {
         status: 'awaiting_device',
         device_info: null
       }
    ↓
17. Frontend recebe resposta:
    
    Se status = 'completed':
      - Mostrar sucesso
      - Device aparece em "Por Adotar"
      - Refresh devices list
    
    Se status = 'awaiting_device':
      - Mostrar mensagem "ainda não detectado"
      - User pode clicar novamente
    
    Se status = 'expired':
      - Mostrar "sessão expirou"
      - Oferecer "Tentar Novamente"
```

### Fase 4: Adopção (Opcional)

```
18. User clica "Adotar" no device "Por Adotar"
    ↓
19. Modal abre com form:
    - friendly_name (opcional)
    - group (obrigatório)
    - subgroup (opcional)
    ↓
20. User preenche e submete
    ↓
21. Frontend chama:
    POST /functions/v1/register-device
    Headers: Authorization: Bearer <USER_JWT>
    Body: {
      device_id: "1403938023",
      friendly_name: "Tablet Sala",
      notes: "Escritório | Sala 1"
    }
    ↓
22. Edge Function actualiza device:
    UPDATE android_devices SET
      friendly_name = 'Tablet Sala',
      notes = 'Escritório | Sala 1',
      updated_at = NOW()
    WHERE device_id = '1403938023'
    ↓
23. Device move para "Adoptados"
```

---

## Algoritmo de Matching Temporal

### Pseudocódigo

```python
def temporal_matching(session_id: str, user_id: str):
    # 1. Validar sessão
    session = get_session(session_id, user_id)
    
    if not session:
        return {"error": "Session not found"}
    
    if session.status != "awaiting_device":
        return {"status": session.status}
    
    # 2. Verificar expiração
    if NOW() > session.expires_at:
        update_session(session_id, status="expired")
        return {"status": "expired"}
    
    # 3. Buscar devices órfãos na janela temporal
    window_start = session.clicked_at - timedelta(minutes=10)
    
    orphan_devices = query("""
        SELECT *
        FROM android_devices
        WHERE owner IS NULL
          AND deleted_at IS NULL
          AND last_seen_at >= %s
        ORDER BY last_seen_at DESC
    """, [window_start])
    
    if not orphan_devices:
        return {"status": "awaiting_device"}
    
    # 4. Pegar device mais recente
    matched_device = orphan_devices[0]
    
    # 5. Buscar mesh_user
    mesh_user = get_mesh_user_by_auth_id(user_id)
    
    if not mesh_user:
        return {"error": "Mesh user not found"}
    
    # 6. Associar device ao user
    update_device(matched_device.id, {
        "owner": mesh_user.id,
        "mesh_username": mesh_user.mesh_username
    })
    
    # 7. Marcar sessão como completed
    update_session(session_id, {
        "status": "completed",
        "matched_device_id": matched_device.device_id,
        "matched_at": NOW()
    })
    
    # 8. Retornar sucesso
    return {
        "status": "completed",
        "device_info": {
            "device_id": matched_device.device_id,
            "friendly_name": matched_device.friendly_name
        }
    }
```

### SQL Query Exacta

```sql
-- Buscar órfãos na janela temporal
SELECT 
  device_id,
  friendly_name,
  last_seen_at,
  created_at
FROM android_devices
WHERE owner IS NULL
  AND deleted_at IS NULL
  AND last_seen_at >= $1  -- session.clicked_at - INTERVAL '10 minutes'
ORDER BY last_seen_at DESC
LIMIT 1;
```

---

## Características do Sistema

### ✅ Vantagens

1. **On-Demand**: User controla quando verificar
2. **Sem Polling**: Não consome recursos constantemente
3. **Simples**: Lógica clara e fácil de debugar
4. **Permissivo**: Janela de 10 minutos antes do clique
5. **Manual**: User pode tentar múltiplas vezes

### ⚠️ Limitações

1. **Requer Ação Manual**: User tem que clicar "Verificar"
2. **Não Real-Time**: Não detecta instantaneamente
3. **Race Condition**: Múltiplos users podem pegar o mesmo órfão (raro)
4. **Dependência Externa**: RustDesk server deve registar devices

### 🔧 Trade-offs

**Alternativa 1: Polling Automático**
- ✅ Detecta automaticamente
- ❌ Consome recursos
- ❌ Complexo de implementar

**Alternativa 2: Webhooks do RustDesk**
- ✅ Real-time
- ❌ Requer modificação do RustDesk server
- ❌ Dependência externa forte

**Escolha Actual: On-Demand** ✅
- Simples
- Confiável
- Sem overhead

---

## Edge Cases e Tratamento

### 1. Múltiplos Órfãos na Janela

**Comportamento:**
```sql
ORDER BY last_seen_at DESC LIMIT 1
```

Pega o **mais recente**.

**Razão:** Device mais recente é mais provável de ser o correto.

### 2. Nenhum Órfão Encontrado

**Resposta:**
```json
{
  "status": "awaiting_device",
  "device_info": null
}
```

**Frontend:** Mostra mensagem "ainda não detectado".

**User:** Pode clicar "Verificar" novamente.

### 3. Sessão Expirou

**Resposta:**
```json
{
  "status": "expired",
  "time_remaining_seconds": 0
}
```

**Frontend:** Mostra "sessão expirada".

**User:** Pode clicar "Tentar Novamente" → cria nova sessão.

### 4. Device Já Foi Adoptado

**Cenário:** User A cria sessão, User B adopta o órfão, User A verifica.

**Comportamento:**
```sql
WHERE owner IS NULL  -- Não encontra device
```

**Resposta:** `status: awaiting_device`

**Proteção:** Query só busca órfãos (`owner IS NULL`).

### 5. Race Condition (Raro)

**Cenário:** Users A e B verificam simultaneamente, mesmo órfão.

**Resultado:** Ambos podem tentar associar.

**Mitigação:** 
- `UNIQUE(device_id)` na tabela previne duplicados
- Último UPDATE ganha
- Probabilidade baixíssima (janelas de milissegundos)

**Solução Futura:** Lock optimista ou queue system.

---

## Métricas e Monitorização

### KPIs Importantes

1. **Session Success Rate**
   ```sql
   SELECT 
     COUNT(CASE WHEN status = 'completed' THEN 1 END) * 100.0 / COUNT(*) AS success_rate
   FROM device_registration_sessions
   WHERE created_at > NOW() - INTERVAL '7 days';
   ```

2. **Average Time to Match**
   ```sql
   SELECT 
     AVG(EXTRACT(EPOCH FROM (matched_at - clicked_at))) AS avg_seconds
   FROM device_registration_sessions
   WHERE status = 'completed'
     AND created_at > NOW() - INTERVAL '7 days';
   ```

3. **Orphan Devices Count**
   ```sql
   SELECT COUNT(*)
   FROM android_devices
   WHERE owner IS NULL
     AND deleted_at IS NULL
     AND created_at > NOW() - INTERVAL '1 hour';
   ```

### Alertas Sugeridos

- ⚠️ **>10 sessões expiradas** em 1 hora → problema no matching
- ⚠️ **>50 órfãos** → RustDesk está a registar mas matching não funciona
- ⚠️ **Success rate <80%** → investigar causas de falha

---

## Debugging

### Ver Estado de Sessão

```sql
SELECT 
  s.id AS session_id,
  u.email,
  s.clicked_at,
  s.expires_at,
  s.status,
  s.matched_device_id,
  s.matched_at,
  EXTRACT(EPOCH FROM (s.expires_at - NOW())) AS seconds_remaining
FROM device_registration_sessions s
JOIN auth.users u ON s.user_id = u.id
WHERE s.id = 'session-uuid-here';
```

### Ver Órfãos na Janela

```sql
SELECT 
  device_id,
  last_seen_at,
  created_at,
  EXTRACT(EPOCH FROM (NOW() - last_seen_at)) AS seconds_ago
FROM android_devices
WHERE owner IS NULL
  AND deleted_at IS NULL
  AND last_seen_at >= (NOW() - INTERVAL '10 minutes')
ORDER BY last_seen_at DESC;
```

### Simular Matching Manual

```sql
-- 1. Ver sessão activa
SELECT * FROM device_registration_sessions 
WHERE user_id = 'user-uuid' 
  AND status = 'awaiting_device'
  AND expires_at > NOW();

-- 2. Ver órfãos disponíveis
SELECT * FROM android_devices 
WHERE owner IS NULL 
  AND last_seen_at >= ('2025-12-13 20:00:00'::timestamp - INTERVAL '10 minutes');

-- 3. Fazer matching manual (se necessário)
BEGIN;

UPDATE android_devices 
SET owner = 'mesh-user-uuid',
    mesh_username = 'jorge.peixinho@storesace.cv'
WHERE device_id = '1403938023';

UPDATE device_registration_sessions
SET status = 'completed',
    matched_device_id = '1403938023',
    matched_at = NOW()
WHERE id = 'session-uuid';

COMMIT;
```

---

## Melhorias Futuras

### Fase 2: Automação

- [ ] Webhook do RustDesk server → automatic registration
- [ ] Polling opcional (configurável por user)
- [ ] Push notifications quando device detectado

### Fase 3: Inteligência

- [ ] ML para matching (user patterns, device location)
- [ ] Sugestões automáticas de grupos
- [ ] Histórico de conexões para melhor matching

### Fase 4: Escalabilidade

- [ ] Queue system (Redis/BullMQ) para matching
- [ ] Distributed locking (Redis) para race conditions
- [ ] Caching de órfãos (Redis) para performance

---

**Próxima Revisão:** Quando houver mudanças no algoritmo de matching

### Matching Temporal (Edge Function `check-registration-status`)

A função `check-registration-status` implementa o matching temporal on-demand, com janela **apenas para a frente** a partir do clique:

1. Recebe `session_id` e JWT do utilizador
2. Valida sessão em `device_registration_sessions`
3. Calcula janela de tempo:
   - `window_start = clicked_at`
   - `window_end = clicked_at + 8 minutos`
4. Procura devices órfãos em `android_devices`:
   - `owner IS NULL`
   - `deleted_at IS NULL`
   - `last_seen_at >= window_start`
   - `last_seen_at <= window_end`
5. Ordena por `last_seen_at DESC` e escolhe o mais recente
6. Se encontrar:
   - Atualiza `android_devices.owner` para `mesh_users.id`
   - Atualiza `device_registration_sessions.status = 'completed'`
   - Preenche `matched_device_id` e `matched_at`
7. Retorna status e info do device para o frontend

### Matching Temporal (Sync Script `sync-devices.sh`)

O script de sync implementa matching offline para casos em que:
- O utilizador não clicou em "Verificar Dispositivo"
- O device apareceu no RustDesk com atraso
- A Edge Function não conseguiu fazer matching em tempo real

Algoritmo simplificado (por device órfão):

1. Ler devices órfãos recentes:
   - `owner IS NULL`
   - `deleted_at IS NULL`
   - `last_seen_at >= NOW() - 24 horas`

2. Para cada device órfão:
   1. Considerar `last_seen = COALESCE(last_seen_at, created_at)`
   2. Calcular janela:
      - `window_start = last_seen - 8 minutos`
      - `window_end = last_seen`
   3. Ler sessões de registo (`device_registration_sessions`) com:
      - `status = 'awaiting_device'`
      - `clicked_at >= window_start`
      - `clicked_at <= window_end`
   4. Analisar sessões candidatas:
      - Se **0 sessões** na janela:
        - não há qualquer sinal de intenção de registo → o dispositivo é atribuído directamente ao admin canónico e é criado um evento em `device_ambiguity_events` com `reason = 'no_sessions'`.
      - Se **≥1 sessões**, primeiro olhar apenas para o utilizador:
        1. Construir o conjunto de `user_id` distintos presentes nessas sessões.
        2. Se houver **exactamente 1 `user_id` distinto**:
           - tratar como caso inequívoco, mesmo que o utilizador tenha clicado mais do que uma vez;
           - resolver `mesh_users` para esse `user_id`;
           - `UPDATE android_devices SET owner = mesh_users.id, mesh_username = mesh_users.mesh_username WHERE device_id = ...`;
           - actualizar a sessão (por convenção, a primeira da lista) para `status = 'completed'`, com `matched_device_id` e `matched_at`.
        3. Se houver **vários `user_id` distintos** na janela:
           - se o `android_devices.rustdesk_ip` não for nulo:
             - filtrar as sessões cujo `ip_address`, normalizado, seja **igual** ao `rustdesk_ip`;
             - se após este filtro restar **exactamente 1 sessão**:
               - tratar esse par `{user_id, session_id}` como matching inequívoco e aplicar o mesmo fluxo acima (atribuir o device a esse utilizador e marcar a sessão como `completed`);
             - se o filtro por IP produzir 0 ou mais de 1 sessão:
               - o caso permanece ambíguo e cai no fallback admin (ver abaixo).
           - se o `rustdesk_ip` for vazio ou nulo:
             - não há informação adicional para desempate e o caso segue directamente para o fallback admin.
   5. Fallback admin em casos ainda ambíguos (0 sessões ou múltiplos utilizadores sem desempate por IP):
      - Atribuir o dispositivo ao admin canónico:
        - `owner = ADMIN_MESH_USER_ID`
        - `mesh_username = mesh_users.mesh_username` do admin
      - Registar um evento em `device_ambiguity_events` via Edge Function `notify-ambiguous-device`:
        - `reason = 'no_sessions'` quando não há sessões candidatas;
        - `reason = 'multiple_sessions'` quando há sessões de vários utilizadores e nem o IP resolveu a ambiguidade;
        - `candidate_sessions` contém, para cada sessão candidata: `session_id`, `user_id`, `clicked_at`, `ip_address`.
      - A função `notify-ambiguous-device`:
        - enriquece cada candidato com `email` (`auth.users.email`) e `mesh_username` (`mesh_users.mesh_username`);
        - envia (quando configurado via `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_EMAIL`):
          - um email ao admin com:
            - Device ID,
            - motivo (`no_sessions` ou `multiple_sessions`),
            - RustDesk IP,
            - lista de utilizadores candidatos (email, mesh_username, hora do clique, IP);
          - um email individual a cada utilizador candidato com:
            - explicação de que o dispositivo foi encaminhado para o admin por ambiguidade,
            - indicação de que o admin foi notificado,
            - instrução explícita para contactar o admin e indicar o Device ID se considerar que o dispositivo lhe pertence.
      - Se as variáveis de email não estiverem configuradas, o evento continua a ser gravado em `device_ambiguity_events` com `status` apropriado, mas nenhum email é enviado.

Além do admin canónico, existe um utilizador secundário histórico (`auth.users.id = f5384288-837e-41fc-aa08-0020c1bafdec`) que:
- continua a ver os mesmos dispositivos adoptados / por adoptar que o admin canónico (via `get-devices`, que inclui também o `mesh_users.id` do admin canónico quando o JWT é deste user),
- mas não tem acesso às operações `admin-*` (re-atribuição e soft delete), que permanecem restritas ao admin canónico.