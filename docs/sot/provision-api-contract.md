# Provision API – Source-of-Truth (SoT) Contract

**Estado:** Canonical SoT para os endpoints de Provision API usados pela app Android Provisioner  
**Última atualização:** 2025-12-16

Este documento descreve, de forma **normativa**, os contratos HTTP para:

- `POST /api/provision/claim`
- `POST /api/provision/start`

e como estes se relacionam com o estado de códigos, tokens e dispositivos.

Outros endpoints relacionados (`/api/provision/codes`, `/bundle`, `/register`, `/revoke`, `/config`) são mencionados apenas como contexto; o seu SoT detalhado pode ser documentado numa expansão futura.

---

## 1. Visão Geral

### 1.1. Papel dos endpoints

- **`/api/provision/claim`**  
  - Converte um **código de 4 dígitos** (“install code”) num **provisioning token forte** (`p_<…>`) com TTL limitado.

- **`/api/provision/start`**  
  - Cria (ou actualiza) um registo de dispositivo “pending_provision” em `android_devices` para um utilizador concreto, deixando-o visível como **“Dispositivo por Adotar”** no dashboard.

Estes dois endpoints representam dois pontos de entrada distintos:

- claim → fluxo de códigos (4 dígitos) baseado em `device_provisioning_codes` e `device_provisioning_tokens`.
- start → fluxo “known tenant/user, no‑QR” que faz binding directo `user_id` → `android_devices.owner`.

Hoje, **não existe lógica no backend a encadear claim → start automaticamente**.

---

## 2. `/api/provision/claim`

### 2.1. Método e URL

- **Método:** `POST`
- **URL:** `/api/provision/claim`
- **Autenticação:** nenhuma (protegido por rate limiting e TTL de código).

### 2.2. Headers requeridos

- `Content-Type: application/json`

Nenhum header de Authorization é esperado.

### 2.3. Request JSON – `ClaimRequest`

```json
{
  "code": "1234",
  "device_hint": "Samsung A54 TV",
  "nonce": "random-client-generated-string"
}
```

Campos:

| Campo        | Tipo   | Obrigatório | Descrição                                                                 |
|-------------|--------|------------|---------------------------------------------------------------------------|
| `code`      | string | ✅          | Código de instalação de 4 dígitos. Pode conter caracteres extra; o backend extrai só dígitos. |
| `device_hint` | string \| null | ❌ | Identificador amigável do dispositivo (modelo, localização, etc.). Usado apenas para auditoria. |
| `nonce`     | string \| null | ❌ | String arbitrária para binding extra (hash guardado lado servidor); ainda não usada em lógica adicional. |

Regras de validação:

- `code`:
  - é normalizado com `replace(/\D+/g, "")`;
  - **deve** resultar em exactamente 4 dígitos (`"0000"`–`"9999"`);
  - caso contrário → erro `400 invalid_code`.

### 2.4. Response de sucesso – `ClaimResponse`

- **Status HTTP:** `200 OK`
- **Body:**

```json
{
  "token": "p_xxxxxxxxxxxxxxxxxxxxx",
  "expires_in": 900
}
```

Campos:

| Campo        | Tipo   | Descrição                                                       |
|-------------|--------|-----------------------------------------------------------------|
| `token`     | string | Provisioning token forte: prefixo `"p_"` + valor URL‑safe base64. |
| `expires_in`| number | TTL em segundos (actualmente 900 = 15 minutos).                 |

Semântica:

- O token é guardado hashado (`sha256(token)`) em `device_provisioning_tokens.token_hash`.
- O token representa a combinação:
  - código de 4 dígitos;
  - user/tenant associado a esse código;
  - IP do cliente (`client_ip`);
  - device_hint/nonce (para auditoria).
- Este token é depois usado como Bearer em:

  - `GET /api/provision/bundle?token=...`
  - `POST /api/provision/register`
  - `POST /api/provision/revoke`

### 2.5. Erros e códigos de estado

Abaixo, os casos definidos no código (`src/app/api/provision/claim/route.ts`).

#### 400 – `invalid_json`

```json
{
  "error": "invalid_json",
  "message": "Body must be valid JSON"
}
```

- Body não é JSON válido.

#### 400 – `invalid_code`

```json
{
  "error": "invalid_code",
  "message": "Invalid or expired code"
}
```

- `code` inexistente ou que não passa a validação de 4 dígitos.
- Também usado quando o código não é encontrado em `device_provisioning_codes`.

#### 400 – `expired_code`

```json
{
  "error": "expired_code",
  "message": "Install code has expired"
}
```

- Código encontrado, mas:
  - `expires_at < now`, **e**
  - o estado ainda era `unused` ou `claimed` (o backend marca-o como `expired` durante a chamada).

#### 423 – `code_locked`

```json
{
  "error": "code_locked",
  "message": "This code is no longer usable"
}
```

- Estado da linha em `device_provisioning_codes.status` é:
  - `"expired"`, `"consumed"` ou `"locked"`, **ou**
  - foi automaticamente mudado para `"locked"` por excesso de falhas para este código/ IP.

#### 429 – `rate_limited`

```json
{
  "error": "rate_limited",
  "message": "Too many attempts from this IP. Try again later."
}
```

- Mais de 20 tentativas (sucesso+falha) em 60 segundos para o mesmo `client_ip`.

#### 502 – `database_error`

```json
{
  "error": "database_error",
  "message": "Failed to check rate limits"
}
```

ou

```json
{
  "error": "database_error",
  "message": "Failed to check existing codes"
}
```

ou

```json
{
  "error": "database_error",
  "message": "Failed to create provisioning token"
}
```

- Falhas ao ler/escrever em:
  - `device_provisioning_attempts`
  - `device_provisioning_codes`
  - `device_provisioning_tokens`.

#### 410 / 401 / 403

- **Não são usados actualmente** em `/api/provision/claim` para códigos expirados ou inválidos.  
  - O comportamento efectivo é `400`/`423`/`429`/`502`.  
- Se uma mudança futura quiser alinhar códigos HTTP com semântica (ex.: `410 Gone`), deve ser reflectida neste SoT e no código.

---

## 3. `/api/provision/start`

### 3.1. Método e URL

- **Método:** `POST`
- **URL:** `/api/provision/start`
- **Autenticação:**  
  - Actualmente **não há** header de Authorization; o endpoint usa `SUPABASE_SERVICE_ROLE_KEY` para falar com Supabase.  
  - A autenticação/ autorização de quem chama é **UNSPECIFIED** a partir do ponto de vista deste repositório.

> Isto está alinhado com o SoT `docs/sot/rustdesk-provisioner-no-qr.md`: é um endpoint de **backend** para casos “known tenant/user”.

### 3.2. Headers requeridos

- `Content-Type: application/json`

### 3.3. Request JSON – `ProvisionStartRequest`

```json
{
  "tenant_id": "tenant-uuid-or-slug",
  "user_id": "9ebfa3dd-392c-489d-882f-8a1762cb36e8",
  "abi": "arm64-v8a",
  "device_fingerprint": "stable-device-fingerprint-or-install-id",
  "device_name": "Samsung A54 TV",
  "model": "Samsung A54",
  "os_version": "Android 14"
}
```

Campos:

| Campo              | Tipo   | Obrigatório | Descrição                                                                                  |
|--------------------|--------|------------|--------------------------------------------------------------------------------------------|
| `tenant_id`        | string | ✅          | Identificador lógico do tenant. Hoje é usado só para logging e futuro multi‑tenant.       |
| `user_id`          | string | ✅          | UUID de `auth.users.id` do utilizador “dono” do dispositivo.                              |
| `abi`              | string | ✅          | ABI detectado: **deve ser** `"arm64-v8a"`, `"armeabi-v7a"` ou `"x86_64"`.                  |
| `device_fingerprint` | string | ✅        | Identificador estável gerado pelo Provisioner para o device (antes de existir ID RustDesk).|
| `device_name`      | string \| null | ❌ | Nome amigável sugerido para o device. Gravado em `friendly_name`.                         |
| `model`            | string \| null | ❌ | Modelo do dispositivo (só para logs).                                                     |
| `os_version`       | string \| null | ❌ | Versão de Android (só para logs).                                                         |

Regras de validação:

- Falta de qualquer um dos obrigatórios (`tenant_id`, `user_id`, `abi`, `device_fingerprint`) → `400 invalid_payload`.
- `abi` deve estar em `{"arm64-v8a","armeabi-v7a","x86_64"}`; caso contrário → `400 unsupported_abi`.

### 3.4. Response de sucesso – `ProvisionStartResponse`

- **Status HTTP:** `201 Created`
- **Body:**

```json
{
  "provision_id": "5f11f4a0-909d-4b2e-9a3d-6af385b8c4f5",
  "config_url": "https://rustdesk.bwb.pt/api/provision/config?provision_id=codebase-check-21",
  "apk_url": "https://rustdesk.bwb.pt/apk/rustdesk/latest?abi=arm64-v8a"
}
```

Campos:

| Campo          | Tipo   | Descrição                                                                 |
|----------------|--------|---------------------------------------------------------------------------|
| `provision_id` | string | UUID lógico da sessão de provisioning (usado apenas para logging e config). |
| `config_url`   | string | Endpoint para descarregar o bundle de configuração RustDesk.             |
| `apk_url`      | string | Endpoint estável para descarregar o APK RustDesk correcto para o ABI.    |

Comportamento de lado servidor:

1. Resolve `mesh_users`:

   ```sql
   SELECT id, mesh_username
   FROM mesh_users
   WHERE auth_user_id = :user_id;
   ```

2. Se não houver linha:

   - Responde `404 mesh_user_not_found`.

3. Se houver:

   ```sql
   UPSERT INTO android_devices (
     device_id,
     owner,
     mesh_username,
     friendly_name,
     notes,
     last_seen_at,
     rustdesk_password,
     deleted_at,
     updated_at
   )
   VALUES (
     :device_fingerprint,
     :mesh_users.id,
     :mesh_users.mesh_username,
     :device_name,
     NULL,
     NOW(),
     NULL,
     NULL,
     NOW()
   )
   ON CONFLICT (device_id) DO UPDATE ...
   ```

4. O device passa a ter:

   - `owner != NULL`
   - `notes = NULL`

   Logo, aparece na UI em **“Dispositivos por Adotar”**.

5. Calcula:

   - `config_url = <baseURL>/api/provision/config?provision_id=<uuid>`
   - `apk_url = https://rustdesk.bwb.pt/apk/rustdesk/latest?abi=<abi>`

### 3.5. Erros e códigos de estado

#### 400 – `invalid_json`

```json
{
  "error": "invalid_json",
  "message": "Body must be valid JSON"
}
```

- Body não é JSON parseável.

#### 400 – `invalid_payload`

```json
{
  "error": "invalid_payload",
  "message": "tenant_id, user_id, abi e device_fingerprint são obrigatórios."
}
```

- Um ou mais campos obrigatórios em falta ou vazios.

#### 400 – `unsupported_abi`

```json
{
  "error": "unsupported_abi",
  "message": "ABI não suportado. Valores permitidos: arm64-v8a, armeabi-v7a, x86_64."
}
```

- `abi` não está na lista suportada.

#### 404 – `mesh_user_not_found`

```json
{
  "error": "mesh_user_not_found",
  "message": "Utilizador não tem mapping em mesh_users. Contacta o administrador."
}
```

- Não foi encontrada linha em `mesh_users` com `auth_user_id = user_id`.

#### 500 – `config_error`

```json
{
  "error": "config_error",
  "message": "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
}
```

- Variáveis de ambiente em falta no backend.

#### 500 – `internal_error`

```json
{
  "error": "internal_error",
  "message": "Erro interno ao iniciar provisioning."
}
```

- Excepções não tratadas ao falar com Supabase ou ao gerar resposta.
- O detalhe aparece apenas em logs via `debugLogger`.

#### 502 – `database_error`

- Este código **não é usado actualmente** em `/api/provision/start`.  
  - Falhas de base de dados são mapeadas para `500 internal_error`.  
  - Se no futuro forem diferenciadas, este SoT deverá ser actualizado.

---

## 4. Regras de códigos e tokens (Claim Code Rules)

### 4.1. Tabela `device_provisioning_codes`

Estados possíveis (campo `status`):

- `"unused"` – código gerado mas nunca reclamado.
- `"claimed"` – reclamado com sucesso por pelo menos um dispositivo; existem `device_provisioning_tokens` activos associados.
- `"expired"` – validade (TTL) ultrapassada.
- `"consumed"` – código usado até ao fim de um fluxo de provisioning e explicitamente marcado como consumido.
- `"locked"` – bloqueado por excesso de tentativas falhadas (rate limiting por código+IP).

Outros campos relevantes:

- `code` – string de 4 dígitos.
- `user_id` – `auth.users.id` do utilizador que gerou o código.
- `expires_at` – timestamp de expiração (SoT: 15 minutos após criação).
- `last_attempt_at` – último timestamp de tentativa (sucesso ou falha).
- `last_client_ip` – IP da última tentativa.

### 4.2. Tabela `device_provisioning_tokens`

Estados possíveis (campo `status`):

- `"active"` – token pode ser usado em `/bundle`, `/register`, `/revoke`.
- `"revoked"` – token revogado (ex.: após `/revoke`).
- Outros estados potenciais (futuros) não são usados actualmente.

Campos relevantes:

- `token_hash` – `sha256` do token real (never stored in plain text).
- `code_id` – FK para `device_provisioning_codes`.
- `expires_at` – TTL do token (actualmente 15 minutos).
- `used_by_device_id` – `device_id` (string) do dispositivo que o usou (preenchido por `/register`).
- `last_seen_at` – última vez que o token foi visto em uso.
- `client_ip` – IP de onde o token foi gerado.

### 4.3. TTL e single‑use

- Cada código de 4 dígitos tem TTL de **15 minutos**:
  - configurado em `/api/provision/codes`;
  - validado em `/api/provision/claim`.
- Cada token `p_<...>` tem TTL de **15 minutos**:
  - definido em `/api/provision/claim`.

O conceito de **single‑use** é implementado assim:

- O código:
  - pode ser reclamado (claim) múltiplas vezes **enquanto não expirar** e não for bloqueado/consumido.
  - fluxos de segurança adicionais (consumo automático após 1 registo bem sucedido) são possíveis, mas hoje:
    - o consumo final é feito quando `/api/provision/revoke` é chamado.

- O token:
  - pode teoricamente ser usado várias vezes dentro do TTL, **mas** os fluxos esperados são:
    - `bundle` → `register` → `revoke`.
  - Quem chama `/register` deve tratar de apenas registar o device uma vez; depois, `/revoke` marca `status = revoked` e o código como `consumed`.

Qualquer reforço (ex.: invalidar token após primeiro `/register`) deve ser acordado e reflectido no código.

---

## 5. Device State Machine (unclaimed → claimed → pending adoption → adopted)

Este diagrama conceptualiza como os vários estados se ligam entre si.  
É **derivado** de `docs/sot/data-models.md`, `docs/USER_GUIDE.md`, `grouping.ts` e `android_devices_grouping_view.sql`.

### 5.1. Estados

1. **Unclaimed**  
   - Não existe linha relevante em `device_provisioning_codes` (para este user) nem em `android_devices` para este device.
   - Do ponto de vista de UI, o dispositivo **não aparece em lado nenhum**.

2. **Claimed (código / token)**  
   - Existe uma linha em `device_provisioning_codes` com:
     - `status IN ('unused', 'claimed')`
     - `expires_at > now()`
   - Existe opcionalmente uma linha em `device_provisioning_tokens` com:
     - `status = 'active'`
     - `expires_at > now()`
   - Ainda **não há** binding definitivo ao equipamento em `android_devices`.

3. **Pending adoption (por adoptar)**  
   - Existe linha em `android_devices` com:
     - `owner IS NOT NULL`
     - `TRIM(notes) = ''` (ou `notes IS NULL`)
     - `deleted_at IS NULL`
   - O device aparece na UI na secção **“Dispositivos por Adotar”**.

4. **Adopted (adoptado)**  
   - Linha em `android_devices` com:
     - `owner IS NOT NULL`
     - `TRIM(notes) != ''`
     - `deleted_at IS NULL`
   - Aparece agrupado por `group_name` / `subgroup_name`.

### 5.2. Transições típicas

**(A) Fluxo claim + register (código 4 dígitos)**

1. `Unclaimed` → (gerar código) → `device_provisioning_codes.status = 'unused'`.
2. `unused` → (`/api/provision/claim` com sucesso) → `status = 'claimed'`, `device_provisioning_tokens.status = 'active'`.
3. `claimed` + `token active` → (`/api/provision/register`) → criação de linha em `android_devices` para esse device:
   - `owner = mesh_users.id`
   - `notes = NULL`  
   → estado **Pending adoption**.
4. `Pending adoption` → (`register-device` chamado via UI para adopção) → `notes` preenchido:
   - passa a **Adopted**.

**(B) Fluxo `/api/provision/start` (known tenant/user)**

1. `Unclaimed` → (`/api/provision/start` com sucesso) → `android_devices` upsert:
   - `owner = mesh_users.id`
   - `notes = NULL`  
   → estado **Pending adoption** directamente (sem passar por códigos/tokens).

---

## 6. Mapeamento para UI “Dispositivos por Adotar”

Implementação actual (combinação de `android_devices_grouping_view.sql` + `grouping.ts`):

- A view `android_devices_grouping` define:

  ```sql
  COALESCE(
    NULLIF(TRIM(SPLIT_PART(d.notes, '|', 1)), ''),
    'Dispositivos por Adotar'
  ) AS group_name,
  NULLIF(TRIM(SPLIT_PART(d.notes, '|', 2)), '') AS subgroup_name,
  (COALESCE(TRIM(d.notes), '') = '') AS is_unassigned
  ```

- O grouping no frontend (`groupDevices`) faz:

  - se `is_unassigned = true` ou `notes` vazias:
    - `group = "Dispositivos por Adotar"`;
    - `subgroup = ""`.

Portanto:

- Qualquer linha em `android_devices` onde:

  - `owner IS NOT NULL`
  - `deleted_at IS NULL`
  - `notes IS NULL OU TRIM(notes) = ''`

é mostrada na UI como **“Dispositivos por Adotar”**, independentemente de ter sido criada por:

- `/api/provision/start` (known tenant);
- `/api/provision/register` (código 4 dígitos + token + Edge Function `register-device`);
- outros fluxos de matching temporal.

---

Este SoT define o contrato estável que tanto equipa Android como backend devem seguir.  
Qualquer alteração (ex.: adicionar auth JWT em `/api/provision/start`, mudar TTLs, alterar semântica de estados) **deve** ser:

1. Implementada no código.
2. Sincronizada neste documento.
3. Referenciada em `docs/ROADMAP.md` sob a fase relevante.