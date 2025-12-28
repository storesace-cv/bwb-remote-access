# API Contracts

**Última Atualização:** 13 Dezembro 2025

## 📡 Contratos de API

Este documento define os contratos formais de todas as APIs do sistema.

---

## API Routes (Next.js)

### POST /api/login

**Propósito:** Autenticar utilizador e obter JWT.

**Request:**
```typescript
POST /api/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (200 OK):**
```typescript
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (400 Bad Request):**
```typescript
{
  "message": "Email e password são obrigatórios."
}
```

**Response (401 Unauthorized):**
```typescript
{
  "message": "Credenciais inválidas ou utilizador não existe.",
  "error": "invalid_credentials"
}
```

**Response (500 Internal Server Error):**
```typescript
{
  "message": "Erro interno ao processar login."
}
```

**Headers:**
- `Content-Type: application/json`
- CORS headers incluídos

**Comportamento:**
1. Valida email e password
2. Chama `supabase.auth.signInWithPassword()`
3. Retorna `access_token` como `token`
4. Logging estruturado de todas as tentativas

**Códigos de Erro:**
- `400`: Payload inválido
- `401`: Credenciais inválidas
- `502`: Token inválido retornado pelo Supabase
- `500`: Erro interno não tratado

---

## Edge Functions (Supabase)

### GET /functions/v1/get-devices

**Propósito:** Listar dispositivos do utilizador autenticado.

**Request:**
```typescript
GET /functions/v1/get-devices
Headers:
  Authorization: Bearer <JWT>
  apikey: <SUPABASE_ANON_KEY>
```

**Response (200 OK):**
```typescript
[
  {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "device_id": "1403938023",
    "owner": "456e7890-e89b-12d3-a456-426614174001",
    "mesh_username": "jorge.peixinho@storesace.cv",
    "friendly_name": "Tablet Sala Principal",
    "notes": "Escritório | Sala 1",
    "last_seen_at": "2025-12-13T20:00:00Z",
    "created_at": "2025-12-10T10:00:00Z",
    "updated_at": "2025-12-13T20:00:00Z",
    "deleted_at": null
  }
]
```

**Response (401 Unauthorized):**
```typescript
{
  "error": "unauthorized",
  "message": "Invalid or expired token"
}
```

**Response (500 Internal Server Error):**
```typescript
{
  "error": "internal_error",
  "message": "Error message here"
}
```

**Validação JWT:**
1. Extrai JWT do header `Authorization: Bearer <token>`
2. Valida JWT via `${SUPABASE_URL}/auth/v1/user`
3. Extrai `user_id` do JWT
4. Query: `SELECT * FROM android_devices WHERE owner=(SELECT id FROM mesh_users WHERE auth_user_id=user_id)`

**RLS:** Aplica-se automaticamente (users só vêem seus devices)

---

### POST /functions/v1/register-device

**Propósito:** Registar ou actualizar dispositivo Android.

**Modos de Autenticação:**

#### 1. Registration Token (Prioridade Máxima)
```typescript
POST /functions/v1/register-device
Content-Type: application/json

{
  "device_id": "1403938023",
  "registration_token": "uuid-token-here",
  "friendly_name": "Tablet Sala",
  "notes": "Escritório | Sala 1",
  "last_seen": "2025-12-13T20:00:00Z"
}
```

#### 2. Service Role JWT + mesh_username
```typescript
POST /functions/v1/register-device
Headers:
  Authorization: Bearer <SERVICE_ROLE_KEY>
  apikey: <SUPABASE_ANON_KEY>
Content-Type: application/json

{
  "device_id": "1403938023",
  "mesh_username": "jorge.peixinho@storesace.cv",
  "friendly_name": "Tablet Sala",
  "notes": "Escritório | Sala 1"
}
```

#### 3. Service Role JWT (sem mesh_username = device órfão)
```typescript
POST /functions/v1/register-device
Headers:
  Authorization: Bearer <SERVICE_ROLE_KEY>
  apikey: <SUPABASE_ANON_KEY>
Content-Type: application/json

{
  "device_id": "1403938023",
  "last_seen": "2025-12-13T20:00:00Z"
}
```

#### 4. User JWT (para adopt manual)
```typescript
POST /functions/v1/register-device
Headers:
  Authorization: Bearer <USER_JWT>
  apikey: <SUPABASE_ANON_KEY>
Content-Type: application/json

{
  "device_id": "1403938023",
  "friendly_name": "Tablet Sala",
  "notes": "Escritório | Sala 1"
}
```

**Response (200 OK):**
```typescript
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "device_id": "1403938023",
  "owner": "456e7890-e89b-12d3-a456-426614174001",
  "mesh_username": "jorge.peixinho@storesace.cv",
  "friendly_name": "Tablet Sala",
  "notes": "Escritório | Sala 1",
  "last_seen_at": "2025-12-13T20:00:00Z",
  "created_at": "2025-12-13T20:00:00Z",
  "updated_at": "2025-12-13T20:00:00Z",
  "deleted_at": null
}
```

**Response (400 Bad Request):**
```typescript
{
  "error": "invalid_payload",
  "message": "device_id is required"
}
```

**Response (401 Unauthorized):**
```typescript
{
  "error": "unauthorized",
  "message": "Missing Bearer JWT or registration_token"
}
```

**Response (404 Not Found):**
```typescript
{
  "error": "not_found",
  "message": "Mesh user not found"
}
```

**Lógica de Upsert:**
1. Se device existe e já está adoptado (notes != null/empty), mantém owner original
2. Se device é novo ou órfão, atribui novo owner
3. Actualiza `last_seen_at`, `friendly_name`, `notes`

**Detecção de JWT:**
- Service Role: Decode local do JWT, verifica `role === "service_role"`
- User JWT: Valida via Auth API

---

### GET /functions/v1/check-registration-status

**Propósito:** Verificar status de sessão de registro + matching temporal on-demand.

**Request:**
```typescript
GET /functions/v1/check-registration-status?session_id=<uuid>
Headers:
  Authorization: Bearer <USER_JWT>
  apikey: <SUPABASE_ANON_KEY>
```

**Response (200 OK - Awaiting):**
```typescript
{
  "success": true,
  "status": "awaiting_device",
  "expires_at": "2025-12-13T20:05:00Z",
  "time_remaining_seconds": 180,
  "device_info": null,
  "matched_at": null
}
```

**Response (200 OK - Completed):**
```typescript
{
  "success": true,
  "status": "completed",
  "expires_at": "2025-12-13T20:05:00Z",
  "time_remaining_seconds": 120,
  "device_info": {
    "device_id": "1403938023",
    "friendly_name": null
  },
  "matched_at": "2025-12-13T20:02:30Z"
}
```

**Response (200 OK - Expired):**
```typescript
{
  "success": true,
  "status": "expired",
  "expires_at": "2025-12-13T20:00:00Z",
  "time_remaining_seconds": 0,
  "device_info": null,
  "matched_at": null
}
```

**Response (400 Bad Request):**
```typescript
{
  "error": "invalid_request",
  "message": "session_id is required"
}
```

**Response (404 Not Found):**
```typescript
{
  "error": "not_found",
  "message": "Session not found"
}
```

**Matching Temporal (On-Demand):**

Quando chamado, tenta fazer matching automático:

1. Busca dispositivos órfãos (`owner=null`)
2. Com `last_seen_at >= session.clicked_at - 10 min`
3. Ordena por `last_seen_at DESC`
4. Pega o mais recente
5. Atribui ao user (`owner = mesh_user.id`)
6. Marca sessão como `completed`

**Janela de Tempo:**
- 10 minutos ANTES do clique (permissivo)
- Exemplo: User clicou às 20:00 → busca devices com `last_seen_at >= 19:50`

---

### POST /functions/v1/start-registration-session

**Propósito:** Criar sessão temporal de registro (5 minutos).

**Request:**
```typescript
POST /functions/v1/start-registration-session
Headers:
  Authorization: Bearer <USER_JWT>
  apikey: <SUPABASE_ANON_KEY>
Content-Type: application/json

{
  "geolocation": null  // Opcional: { lat: 38.7223, lng: -9.1393 }
}
```

**Response (200 OK):**
```typescript
{
  "session_id": "789e0123-e89b-12d3-a456-426614174002",
  "expires_at": "2025-12-13T20:05:00Z",
  "expires_in_seconds": 300
}
```

**Response (401 Unauthorized):**
```typescript
{
  "error": "unauthorized",
  "message": "Missing token"
}
```

**Response (500 Internal Server Error):**
```typescript
{
  "error": "internal_error",
  "message": "Error creating session"
}
```

**Comportamento:**
1. Valida JWT
2. Cria sessão com `expires_at = NOW() + 5 minutes`
3. Status inicial: `awaiting_device`
4. Retorna `session_id` para uso posterior

---

### GET /functions/v1/generate-qr-image

**Propósito:** Gerar imagem QR code para configuração RustDesk.

**Request:**
```typescript
GET /functions/v1/generate-qr-image
Headers:
  Authorization: Bearer <USER_JWT>
  apikey: <SUPABASE_ANON_KEY>
```

**Response (200 OK):**
```
Content-Type: image/png
[Binary PNG data]
```

**Response (401 Unauthorized):**
```typescript
{
  "error": "unauthorized",
  "message": "Missing token"
}
```

**Configuração do QR:**
```json
{
  "host": "rustdesk.bwb.pt",
  "key": "UzHEW0gpZLT6NIx3WAr9lvUG4Se2s7euUTKQ+SrvjJs=",
  "api": ""
}
```

**Formato:** PNG, 256x256 pixels, com margem branca

---

## Códigos de Erro Padrão

### HTTP Status Codes

| Código | Significado | Uso |
|--------|-------------|-----|
| 200 | OK | Sucesso |
| 400 | Bad Request | Payload inválido |
| 401 | Unauthorized | JWT inválido/expirado |
| 404 | Not Found | Recurso não encontrado |
| 405 | Method Not Allowed | Método HTTP incorreto |
| 500 | Internal Server Error | Erro interno |
| 502 | Bad Gateway | Erro ao comunicar com Supabase |

### Error Response Format

```typescript
{
  "error": "error_code",
  "message": "Human-readable error message"
}
```

### Common Error Codes

| Código | Descrição |
|--------|-----------|
| `unauthorized` | JWT inválido ou expirado |
| `invalid_payload` | Campos obrigatórios em falta |
| `invalid_json` | JSON malformado |
| `method_not_allowed` | Método HTTP incorreto |
| `config_error` | Environment variables em falta |
| `database_error` | Erro ao aceder à BD |
| `not_found` | Recurso não encontrado |
| `internal_error` | Erro interno não categorizado |
| `invalid_credentials` | Email/password incorretos |

---

## Headers Comuns

### Request Headers

```
Authorization: Bearer <JWT>
apikey: <SUPABASE_ANON_KEY>
Content-Type: application/json
```

### Response Headers (CORS)

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type
Access-Control-Allow-Methods: GET, POST, OPTIONS
Content-Type: application/json
```

---

## Autenticação e Autorização

### JWT Format

```
Header: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### JWT Payload (User)
```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "role": "authenticated",
  "iat": 1702478400,
  "exp": 1702482000
}
```

### JWT Payload (Service Role)
```json
{
  "role": "service_role",
  "iat": 1702478400,
  "exp": 1702482000
}
```

### Validação JWT (Edge Functions)

```typescript
// 1. Extrair token
const jwt = req.headers.get("Authorization")?.substring(7);

// 2. Validar via Auth API
const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
  headers: {
    Authorization: `Bearer ${jwt}`,
    apikey: SERVICE_ROLE_KEY
  }
});

// 3. Se válido, extrair user_id
const user = await response.json();
const userId = user.id;
```

---

## Rate Limiting

**Actual:** Sem rate limiting implementado.

**Recomendado (Futuro):**
- `/api/login`: 5 tentativas / 15 minutos por IP
- Edge Functions: 100 requests / minuto por user
- `start-registration-session`: 10 sessões / hora por user

---

## Versionamento

**Versão Actual:** 1.0.0

**Breaking Changes:**
- Mudanças no formato de request/response
- Remoção de endpoints
- Alteração de códigos de erro

**Non-Breaking Changes:**
- Novos endpoints
- Novos campos opcionais
- Novos códigos de erro

---

**Próxima Revisão:** Quando houver mudanças nos contratos de API