# API Reference - RustDesk Mesh Integration

**Versão:** 1.0.0  
**Última Atualização:** 13 Dezembro 2025

Referência completa de todas as APIs do sistema.

## 📍 Base URLs

- **Frontend API Routes:** `https://rustdesk.bwb.pt/api`
- **Supabase Edge Functions:** `https://kqwaibgvmzcqeoctukoy.supabase.co/functions/v1`

## 🔐 Autenticação

Todas as APIs requerem autenticação via JWT, excepto `/api/login`.

**Headers obrigatórios:**
```http
Authorization: Bearer <JWT_TOKEN>
apikey: <SUPABASE_ANON_KEY>
Content-Type: application/json
```

---

## 📡 API Routes (Next.js)

### POST `/api/login`

Autentica utilizador e retorna JWT.

**Request:**
```http
POST /api/login HTTP/1.1
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "senha123"
}
```

**Response (Success):**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (Invalid Credentials):**
```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{
  "message": "Credenciais inválidas ou utilizador não existe.",
  "error": "invalid_credentials"
}
```

**Response (Server Error):**
```http
HTTP/1.1 500 Internal Server Error
Content-Type: application/json

{
  "message": "Erro interno ao processar login."
}
```

**Campos:**

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `email` | string | ✅ | Email do utilizador |
| `password` | string | ✅ | Password do utilizador |

**Códigos de Status:**

| Código | Descrição |
|--------|-----------|
| 200 | Login bem sucedido |
| 400 | Request inválido (JSON malformado ou campos em falta) |
| 401 | Credenciais inválidas |
| 500 | Erro interno do servidor |
| 502 | Erro na comunicação com Supabase |

**Exemplo (cURL):**
```bash
curl -X POST https://rustdesk.bwb.pt/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"senha123"}'
```

---

## 🚀 Edge Functions (Supabase)

### GET `/functions/v1/get-devices`

Lista todos os dispositivos do utilizador autenticado.

**Headers:**
```http
Authorization: Bearer <JWT_TOKEN>
apikey: <SUPABASE_ANON_KEY>
```

**Response (Success):**
```http
HTTP/1.1 200 OK
Content-Type: application/json

[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "device_id": "1403938023",
    "owner": "123e4567-e89b-12d3-a456-426614174000",
    "mesh_username": "jorge.peixinho@storesace.cv",
    "friendly_name": "Tablet Sala Principal",
    "notes": "Escritório | Sala 1",
    "last_seen_at": "2025-12-13T20:00:00Z",
    "created_at": "2025-12-01T10:00:00Z",
    "deleted_at": null
  },
  {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "device_id": "1234567890",
    "owner": "123e4567-e89b-12d3-a456-426614174000",
    "mesh_username": "jorge.peixinho@storesace.cv",
    "friendly_name": null,
    "notes": null,
    "last_seen_at": "2025-12-13T19:55:00Z",
    "created_at": "2025-12-13T19:50:00Z",
    "deleted_at": null
  }
]
```

**Response (No Devices):**
```http
HTTP/1.1 200 OK
Content-Type: application/json

[]
```

**Response (Unauthorized):**
```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{
  "error": "unauthorized",
  "message": "Invalid or expired token"
}
```

**Campos de Resposta:**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | ID único do registo |
| `device_id` | string | ID RustDesk do dispositivo |
| `owner` | UUID | ID do proprietário (mesh_users.id) |
| `mesh_username` | string\|null | Username do MeshCentral |
| `friendly_name` | string\|null | Nome amigável do dispositivo |
| `notes` | string\|null | Notas (formato: "Grupo \| Subgrupo") |
| `last_seen_at` | timestamp | Última conexão vista |
| `created_at` | timestamp | Data de criação |
| `deleted_at` | timestamp\|null | Data de soft delete (null se activo) |

**Códigos de Status:**

| Código | Descrição |
|--------|-----------|
| 200 | Lista de devices retornada |
| 401 | JWT inválido ou expirado |
| 500 | Erro interno |

**Exemplo (cURL):**
```bash
curl -X GET https://kqwaibgvmzcqeoctukoy.supabase.co/functions/v1/get-devices \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "apikey: <SUPABASE_ANON_KEY>"
```

---

### POST `/functions/v1/register-device`

Regista um novo dispositivo ou actualiza existente.

**Headers:**
```http
Authorization: Bearer <JWT_TOKEN>
apikey: <SUPABASE_ANON_KEY>
Content-Type: application/json
```

**Request Body:**
```json
{
  "device_id": "1403938023",
  "friendly_name": "Tablet Sala Principal",
  "notes": "Escritório | Sala 1",
  "rustdesk_password": "1234"
}
```

**Campos do Request:**

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `device_id` | string | ✅ | ID RustDesk do dispositivo |
| `friendly_name` | string | ❌ | Nome amigável (opcional) |
| `notes` | string | ❌ | Notas no formato "Grupo \| Subgrupo" |
| `rustdesk_password` | string | ❌ | Password opcional usada nos deep-links RustDesk (`rustdesk://connection/new/<ID>?password=<password>`). Se ausente ou vazia, o link é gerado só com o ID e o utilizador introduz a password no cliente RustDesk. |
| `last_seen` | timestamp | ❌ | Última conexão (auto se omitido) |

**Response (Success):**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "device_id": "1403938023",
  "owner": "123e4567-e89b-12d3-a456-426614174000",
  "friendly_name": "Tablet Sala Principal",
  "notes": "Escritório | Sala 1",
  "mesh_username": "jorge.peixinho@storesace.cv",
  "last_seen_at": "2025-12-13T20:00:00Z",
  "created_at": "2025-12-01T10:00:00Z",
  "deleted_at": null
}
```

**Response (Device Already Adopted by Another User):**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "message": "Device already adopted by another user. Owner preserved.",
  "device": { ... }
}
```

**Response (Invalid Request):**
```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": "invalid_payload",
  "message": "device_id is required"
}
```

**Códigos de Status:**

| Código | Descrição |
|--------|-----------|
| 200 | Device registado/actualizado com sucesso |
| 400 | Request inválido (campos em falta) |
| 401 | JWT inválido ou expirado |
| 404 | Mesh user não encontrado |
| 500 | Erro interno |
| 502 | Erro de comunicação com database |

**Exemplo (cURL):**
```bash
curl -X POST https://kqwaibgvmzcqeoctukoy.supabase.co/functions/v1/register-device \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "1403938023",
    "friendly_name": "Tablet Sala",
    "notes": "Escritório | Sala 1"
  }'
```

---

### POST `/functions/v1/start-registration-session`

Inicia uma nova sessão de registo de dispositivo (válida por 5 minutos).

**Headers:**
```http
Authorization: Bearer <JWT_TOKEN>
apikey: <SUPABASE_ANON_KEY>
Content-Type: application/json
```

**Request Body:**
```json
{
  "geolocation": {
    "latitude": 38.7223,
    "longitude": -9.1393
  }
}
```

**Campos do Request:**

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `geolocation` | object\|null | ❌ | Coordenadas GPS (opcional) |
| `geolocation.latitude` | number | ❌ | Latitude |
| `geolocation.longitude` | number | ❌ | Longitude |

**Response (Success):**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "session_id": "770e8400-e29b-41d4-a716-446655440002",
  "expires_at": "2025-12-13T20:05:00Z",
  "expires_in_seconds": 300
}
```

**Response (Unauthorized):**
```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{
  "error": "unauthorized",
  "message": "Invalid or expired token"
}
```

**Campos de Resposta:**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `success` | boolean | Indica sucesso da operação |
| `session_id` | UUID | ID da sessão criada |
| `expires_at` | timestamp | Quando a sessão expira (NOW + 5min) |
| `expires_in_seconds` | number | Segundos até expiração (300) |

**Códigos de Status:**

| Código | Descrição |
|--------|-----------|
| 200 | Sessão criada com sucesso |
| 401 | JWT inválido ou expirado |
| 500 | Erro interno |

**Exemplo (cURL):**
```bash
curl -X POST https://kqwaibgvmzcqeoctukoy.supabase.co/functions/v1/start-registration-session \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "geolocation": {
      "latitude": 38.7223,
      "longitude": -9.1393
    }
  }'
```

---

### GET `/functions/v1/check-registration-status`

Verifica o status de uma sessão de registo e faz matching temporal com dispositivos órfãos.

**Headers:**
```http
Authorization: Bearer <JWT_TOKEN>
apikey: <SUPABASE_ANON_KEY>
```

**Query Parameters:**

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `session_id` | UUID | ✅ | ID da sessão a verificar |

**Response (Awaiting Device):**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "status": "awaiting_device",
  "expires_at": "2025-12-13T20:05:00Z",
  "time_remaining_seconds": 180,
  "device_info": null,
  "matched_at": null
}
```

**Response (Completed - Device Matched):**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "status": "completed",
  "expires_at": "2025-12-13T20:05:00Z",
  "time_remaining_seconds": 0,
  "device_info": {
    "device_id": "1403938023",
    "friendly_name": "Samsung Galaxy A54",
    "notes": null
  },
  "matched_at": "2025-12-13T20:03:30Z"
}
```

**Response (Expired):**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "status": "expired",
  "expires_at": "2025-12-13T20:05:00Z",
  "time_remaining_seconds": 0,
  "device_info": null,
  "matched_at": null
}
```

**Response (Session Not Found):**
```http
HTTP/1.1 404 Not Found
Content-Type: application/json

{
  "error": "not_found",
  "message": "Session not found"
}
```

**Campos de Resposta:**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `success` | boolean | Indica sucesso da operação |
| `status` | string | Estado: "awaiting_device", "completed", "expired" |
| `expires_at` | timestamp | Quando a sessão expira |
| `time_remaining_seconds` | number | Segundos até expiração (0 se expirou) |
| `device_info` | object\|null | Informações do device (se matched) |
| `device_info.device_id` | string | ID RustDesk |
| `device_info.friendly_name` | string\|null | Nome amigável |
| `device_info.notes` | string\|null | Notas |
| `matched_at` | timestamp\|null | Quando foi feito o match |

**Matching Temporal (on-demand):**

Quando chamado, esta função:
1. Busca dispositivos órfãos (owner=null)
2. Com `last_seen_at` entre `session.clicked_at` e `session.clicked_at + 8 minutos`
3. Pega o mais recente (ordenado por `last_seen_at DESC`)
4. Associa ao utilizador da sessão

**Códigos de Status:**

| Código | Descrição |
|--------|-----------|
| 200 | Status retornado (qualquer estado) |
| 400 | session_id em falta |
| 401 | JWT inválido ou expirado |
| 404 | Sessão não encontrada |
| 500 | Erro interno |

**Exemplo (cURL):**
```bash
curl -X GET "https://kqwaibgvmzcqeoctukoy.supabase.co/functions/v1/check-registration-status?session_id=770e8400-e29b-41d4-a716-446655440002" \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "apikey: <SUPABASE_ANON_KEY>"
```

---

### GET `/functions/v1/generate-qr-image`

Gera uma imagem SVG do QR code para RustDesk.

**Headers:**
```http
Authorization: Bearer <JWT_TOKEN>
apikey: <SUPABASE_ANON_KEY>
```

**Response (Success):**
```http
HTTP/1.1 200 OK
Content-Type: image/svg+xml

<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <!-- QR code SVG paths -->
  <rect width="512" height="512" fill="white"/>
  <path d="M0,0h8v8h-8z" fill="black"/>
  <!-- ... more QR data ... -->
</svg>
```

**Configuração do QR:**
- **Host:** rustdesk.bwb.pt
- **Relay:** rustdesk.bwb.pt
- **Key:** UzHEW0gpZLT6NIx3WAr9lvUG4Se2s7euUTKQ+SrvjJs=
- **API:** https://rustdesk.bwb.pt (não usado actualmente)

**Response (Error):**
```http
HTTP/1.1 500 Internal Server Error
Content-Type: application/json

{
  "error": "qr_generation_failed",
  "message": "Failed to generate QR code"
}
```

**Códigos de Status:**

| Código | Descrição |
|--------|-----------|
| 200 | QR code SVG gerado |
| 401 | JWT inválido ou expirado |
| 500 | Erro ao gerar QR code |

**Exemplo (cURL):**
```bash
curl -X GET https://kqwaibgvmzcqeoctukoy.supabase.co/functions/v1/generate-qr-image \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -o qrcode.svg
```

---

### POST `/functions/v1/admin-update-device`

Reatribui um dispositivo para outro utilizador. **Apenas o admin canónico** (email `suporte@bwb.pt`, auth.users.id = `9ebfa3dd-392c-489d-882f-8a1762cb36e8`) pode chamar este endpoint.

**Headers:**
```http
Authorization: Bearer <JWT_TOKEN_DO_ADMIN>
apikey: <SUPABASE_ANON_KEY>
Content-Type: application/json
```

**Request Body:**
```json
{
  "device_id": "1403938023",
  "target_mesh_username": "jorge.peixinho@storesace.cv"
}
```

**Campos do Request:**

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `device_id` | string | ✅ | ID RustDesk do dispositivo a reatribuir |
| `target_mesh_username` | string | ✅ | `mesh_users.mesh_username` do utilizador destino |

**Efeito:**
- Atualiza `android_devices.owner` para o `mesh_users.id` do destino
- Atualiza `android_devices.mesh_username` para o `mesh_users.mesh_username`
- Limpa `notes` (passa a `NULL`)
- Limpa `deleted_at` (re-ativa device se estava soft-deleted)
- Mantém histórico de `last_seen_at`

**Response (Success):**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "device_id": "1403938023",
  "owner": "123e4567-e89b-12d3-a456-426614174000",
  "mesh_username": "jorge.peixinho@storesace.cv",
  "friendly_name": null,
  "notes": null,
  "last_seen_at": "2025-12-13T20:00:00Z",
  "created_at": "2025-12-01T10:00:00Z",
  "updated_at": "2025-12-13T20:05:00Z",
  "deleted_at": null
}
```

**Códigos de Status:**

| Código | Descrição |
|--------|-----------|
| 200 | Device reatribuído com sucesso |
| 400 | Payload inválido |
| 401 | JWT inválido/expirado |
| 403 | Utilizador não é o admin canónico |
| 404 | Device ou mesh_user destino não encontrados |
| 502 | Erro de comunicação com database |

---

### POST `/functions/v1/admin-delete-device`

Soft delete de um dispositivo. **Apenas o admin canónico** pode chamar.

**Headers:**
```http
Authorization: Bearer <JWT_TOKEN_DO_ADMIN>
apikey: <SUPABASE_ANON_KEY>
Content-Type: application/json
```

**Request Body:**
```json
{
  "device_id": "1403938023"
}
```

**Efeito:**
- Atualiza `android_devices.deleted_at = NOW()`
- Device deixa de aparecer em todas as listagens (`get-devices` filtra `deleted_at IS NULL`)

**Response (Success):**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true
}
```

**Códigos de Status:**

| Código | Descrição |
|--------|-----------|
| 200 | Device apagado (soft delete) |
| 400 | Payload inválido |
| 401 | JWT inválido/expirado |
| 403 | Utilizador não é o admin canónico |
| 404 | Device não encontrado |
| 502 | Erro de comunicação com database |

---

### GET `/functions/v1/admin-list-mesh-users`

Lista todos os utilizadores registados em `mesh_users`. **Apenas o admin canónico** pode chamar.

**Headers:**
```http
Authorization: Bearer <JWT_TOKEN_DO_ADMIN>
apikey: <SUPABASE_ANON_KEY>
```

**Response (Success):**
```http
HTTP/1.1 200 OK
Content-Type: application/json

[
  {
    "id": "8b8e8008-c637-4369-bde7-09becfb06a17",
    "mesh_username": "jorge.peixinho@storesace.cv",
    "display_name": "Jorge Peixinho"
  },
  {
    "id": "a23f8008-c637-4369-bde7-09becfb06a17",
    "mesh_username": "suporte@bwb.pt",
    "display_name": "Suporte BWB"
  }
]
```

**Campos de Resposta:**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | ID do registo em mesh_users |
| `mesh_username` | string\|null | Username no MeshCentral |
| `display_name` | string\|null | Nome amigável do utilizador |

**Códigos de Status:**

| Código | Descrição |
|--------|-----------|
| 200 | Lista de utilizadores retornada |
| 401 | JWT inválido/expirado |
| 403 | Utilizador não é o admin canónico |
| 500 | Erro de configuração Supabase |
| 502 | Erro ao ler da base de dados |

---

### GET `/functions/v1/admin-list-auth-users`

Lista os utilizadores de autenticação (`auth.users`) com informação básica e o mapeamento para `mesh_users`. **Apenas o admin canónico** pode chamar.

**Headers:**
```http
Authorization: Bearer <JWT_TOKEN_DO_ADMIN>
apikey: <SUPABASE_ANON_KEY>
```

**Query Parameters:**

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `page` | number | ❌ | Página (1-based). Default: 1 |
| `per_page` | number | ❌ | Registos por página (1–200). Default: 50 |

**Response (Success):**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "page": 1,
  "per_page": 50,
  "users": [
    {
      "id": "9ebfa3dd-392c-489d-882f-8a1762cb36e8",
      "email": "suporte@bwb.pt",
      "created_at": "2025-12-01T10:00:00Z",
      "last_sign_in_at": "2025-12-13T09:30:00Z",
      "email_confirmed_at": "2025-12-01T10:05:00Z",
      "banned_until": null,
      "user_metadata": {
        "display_name": "Suporte BWB"
      },
      "mesh_username": "suporte@bwb.pt",
      "mesh_display_name": "Suporte BWB",
      "mesh_domain_key": "",
      "mesh_domain": ""
    }
  ]
}
```

**Campos de Resposta (por utilizador em `users`):**

| Campo             | Tipo           | Descrição                                                                 |
|-------------------|----------------|---------------------------------------------------------------------------|
| `id`              | string (UUID)  | ID do utilizador em `auth.users`                                         |
| `email`           | string         | Email do utilizador                                                      |
| `created_at`      | string\|null   | Data de criação da conta                                                 |
| `last_sign_in_at` | string\|null   | Último login                                                             |
| `email_confirmed_at` | string\|null| Quando o email foi confirmado                                            |
| `banned_until`    | string\|null   | Data até à qual o utilizador está bloqueado (se aplicável)              |
| `user_metadata`   | object\|null   | Metadados do utilizador (inclui `display_name`, se definido)            |
| `mesh_username`   | string\|null   | Username em `mesh_users.mesh_username`, se mapeado                       |
| `mesh_display_name` | string\|null | Nome amigável em `mesh_users.display_name`, se mapeado                   |
| `mesh_domain_key` | string\|null   | Chave interna do domínio (`mesh_users.domain_key`, ex.: `''`, `zonetech`) |
| `mesh_domain`     | string\|null   | Valor exacto do campo `domain` em MeshCentral (`mesh_users.domain`)      |

**Códigos de Status:**

| Código | Descrição |
|--------|-----------|
| 200 | Lista de utilizadores retornada |
| 400 | Query inválida |
| 401 | JWT inválido/expirado |
| 403 | Utilizador não é o admin canónico |
| 500 | Erro de configuração Supabase |
| 502 | Erro ao listar utilizadores ou ler da base de dados |

---

### POST `/functions/v1/admin-create-auth-user`

Cria um novo utilizador em `auth.users` e associa-o a um registo em `mesh_users`. **Apenas o admin canónico** pode chamar.

**Headers:**
```http
Authorization: Bearer <JWT_TOKEN_DO_ADMIN>
apikey: <SUPABASE_ANON_KEY>
Content-Type: application/json
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SenhaForte123!",
  "display_name": "Nome do Utilizador",
  "mesh_username": "user@example.com",
  "email_confirm": true
}
```

**Campos do Request:**

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `email` | string | ✅ | Email do utilizador (auth.users.email) |
| `password` | string | ✅ | Password inicial |
| `display_name` | string | ❌ | Nome de exibição (guardado em `user_metadata.display_name` e `mesh_users.display_name`) |
| `mesh_username` | string | ✅ | Username no MeshCentral; apenas é feita a associação em `mesh_users` (o utilizador já deve existir no Mesh) |
| `email_confirm` | boolean | ❌ | Se `true`, marca o email como confirmado na criação |

**Response (Success):**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "user": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "email": "user@example.com",
    "created_at": "2025-12-18T10:00:00Z",
    "email_confirmed_at": "2025-12-18T10:00:10Z",
    "user_metadata": {
      "display_name": "Nome do Utilizador"
    }
  },
  "mesh_user": {
    "id": "8b8e8008-c637-4369-bde7-09becfb06a17",
    "auth_user_id": "123e4567-e89b-12d3-a456-426614174000",
    "mesh_username": "user@example.com",
    "display_name": "Nome do Utilizador"
  }
}
```

**Códigos de Status:**

| Código | Descrição |
|--------|-----------|
| 200 | Utilizador criado e associado com sucesso |
| 400 | Payload inválido (campos obrigatórios em falta) |
| 401 | JWT inválido/expirado |
| 403 | Utilizador não é o admin canónico |
| 502 | Erro na criação do utilizador ou na associação em mesh_users |

---

### POST `/functions/v1/admin-update-auth-user`

Atualiza um utilizador existente em `auth.users` e o respetivo mapeamento em `mesh_users`. **Apenas o admin canónico** pode chamar.

**Headers:**
```http
Authorization: Bearer <JWT_TOKEN_DO_ADMIN>
apikey: <SUPABASE_ANON_KEY>
Content-Type: application/json
```

**Request Body (exemplo):**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "email": "novo-email@example.com",
  "password": "NovaSenha123!",
  "email_confirm": true,
  "ban": false,
  "display_name": "Novo Nome",
  "mesh_username": "novo.username@example.com"
}
```

**Campos do Request:**

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `id` | string | ✅ | `auth.users.id` do utilizador a atualizar |
| `email` | string | ❌ | Novo email (se fornecido) |
| `password` | string | ❌ | Nova password (se fornecida) |
| `email_confirm` | boolean | ❌ | Se `true`, marca email como confirmado; se `false`, pode voltar a estado pendente |
| `ban` | boolean | ❌ | Quando `true`, bloqueia o utilizador (ban permanente); quando `false`, remove bloqueio |
| `display_name` | string\|null | ❌ | Nome de exibição para `user_metadata.display_name` e `mesh_users.display_name` |
| `mesh_username` | string\|null | ❌ | Novo `mesh_username` associado em `mesh_users` (apenas associação; não cria user no Mesh) |

**Response (Success):**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "user": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "email": "novo-email@example.com",
    "email_confirmed_at": "2025-12-18T11:00:00Z",
    "banned_until": null,
    "user_metadata": {
      "display_name": "Novo Nome"
    }
  },
  "mesh_user": {
    "id": "8b8e8008-c637-4369-bde7-09becfb06a17",
    "auth_user_id": "123e4567-e89b-12d3-a456-426614174000",
    "mesh_username": "novo.username@example.com",
    "display_name": "Novo Nome"
  }
}
```

**Códigos de Status:**

| Código | Descrição |
|--------|-----------|
| 200 | Utilizador e mapeamento mesh_users atualizados com sucesso |
| 400 | Payload inválido |
| 401 | JWT inválido/expirado |
| 403 | Utilizador não é o admin canónico |
| 404 | Mapeamento mesh_users não encontrado (e não foi possível criá-lo) |
| 502 | Erro na atualização do utilizador ou de mesh_users |

---

### POST `/functions/v1/admin-delete-auth-user`

Apaga um utilizador de `auth.users`. As regras de `ON DELETE` na base de dados tratam da cascata para `mesh_users` e dos `android_devices.owner` (que passam a `NULL`). **Apenas o admin canónico** pode chamar.

**Headers:**
```http
Authorization: Bearer <JWT_TOKEN_DO_ADMIN>
apikey: <SUPABASE_ANON_KEY>
Content-Type: application/json
```

**Request Body:**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000"
}
```

**Campos do Request:**

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `id` | string | ✅ | `auth.users.id` do utilizador a apagar |

**Efeito:**
- Remove o utilizador de `auth.users`.
- `mesh_users` associados são apagados por `ON DELETE CASCADE`.
- `android_devices.owner` passa a `NULL` por `ON DELETE SET NULL`, e os dispositivos ficam órfãos, aparecendo na secção de triagem de dispositivos sem utilizador atribuído.

**Response (Success):**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true
}
```

**Códigos de Status:**

| Código | Descrição |
|--------|-----------|
| 200 | Utilizador apagado com sucesso |
| 400 | Payload inválido |
| 401 | JWT inválido/expirado |
| 403 | Utilizador não é o admin canónico |
| 502 | Erro ao apagar utilizador em Supabase Auth |

---

## 🔒 Códigos de Erro Comuns

| Código | Error | Descrição |
|--------|-------|-----------|
| 400 | `invalid_json` | Body JSON malformado |
| 400 | `invalid_payload` | Campos obrigatórios em falta |
| 401 | `unauthorized` | JWT inválido, expirado ou em falta |
| 401 | `invalid_credentials` | Email/password incorrectos |
| 404 | `not_found` | Recurso não encontrado |
| 404 | `mesh_user_not_found` | Utilizador não tem mapping em mesh_users |
| 500 | `config_error` | Variáveis de ambiente em falta |
| 500 | `internal_error` | Erro não esperado no servidor |
| 502 | `bad_gateway` | Erro de comunicação com Supabase |
| 502 | `database_error` | Erro de query no PostgreSQL |

---

## 📝 Notas de Implementação

### Rate Limiting

Não implementado actualmente. Considerar adicionar:
- Limite por IP: 100 requests/minuto
- Limite por user: 1000 requests/hora

### CORS

Todas as Edge Functions têm CORS aberto (`Access-Control-Allow-Origin: *`).

Para produção, considerar restringir a:
```
Access-Control-Allow-Origin: https://rustdesk.bwb.pt
```

### Versionamento de API

Actualmente não versionado. Para futuro:
- `/api/v1/login`
- `/functions/v1/...` (já tem v1)

### Timeouts

- **API Routes:** 30 segundos (Next.js default)
- **Edge Functions:** 60 segundos (Supabase default)
- **Sessões de registo:** 5 minutos (configurável)

---

## 🧪 Exemplos de Integração

### JavaScript/TypeScript

```typescript
// 1. Login
const loginResponse = await fetch('https://rustdesk.bwb.pt/api/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'senha123'
  })
});

const { token } = await loginResponse.json();

// 2. Listar devices
const devicesResponse = await fetch(
  'https://kqwaibgvmzcqeoctukoy.supabase.co/functions/v1/get-devices',
  {
    headers: {
      'Authorization': `Bearer ${token}`,
      'apikey': SUPABASE_ANON_KEY
    }
  }
);

const devices = await devicesResponse.json();

// 3. Registar device
await fetch(
  'https://kqwaibgvmzcqeoctukoy.supabase.co/functions/v1/register-device',
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      device_id: '1403938023',
      friendly_name: 'Meu Tablet',
      notes: 'Casa | Sala'
    })
  }
);
```

### Python

```python
import requests

# 1. Login
login_resp = requests.post(
    'https://rustdesk.bwb.pt/api/login',
    json={'email': 'user@example.com', 'password': 'senha123'}
)
token = login_resp.json()['token']

# 2. Listar devices
headers = {
    'Authorization': f'Bearer {token}',
    'apikey': SUPABASE_ANON_KEY
}
devices_resp = requests.get(
    'https://kqwaibgvmzcqeoctukoy.supabase.co/functions/v1/get-devices',
    headers=headers
)
devices = devices_resp.json()

# 3. Registar device
requests.post(
    'https://kqwaibgvmzcqeoctukoy.supabase.co/functions/v1/register-device',
    headers=headers,
    json={
        'device_id': '1403938023',
        'friendly_name': 'Meu Tablet',
        'notes': 'Casa | Sala'
    }
)
```

---

**Última Revisão:** 13 Dezembro 2025  
**Próxima Revisão:** Quando houver alterações significativas nas APIs