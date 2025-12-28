# Acceptance & Verification Tests – Android Provisioner + Provision API

**Objetivo:**  
Definir um plano de testes manuais e via `curl` que:

- Valide o contrato entre a app Android Provisioner e a Provision API.
- Confirme que o dispositivo aparece em **“Dispositivos por Adotar”**.
- Confirme que o APK correcto é descarregado e que o instalador abre.
- Garanta que o RustDesk se liga ao servidor certo e é atribuível ao utilizador previsto.

**Ambiente alvo:**  
Staging ou produção, conforme configurado em:

- `https://rustdesk.bwb.pt`
- Supabase project `kqwaibgvmzcqeoctukoy`

---

## 1. Pré‑requisitos

1. **Acesso ao droplet / ambiente:**
   - URL: `https://rustdesk.bwb.pt`
   - Dashboard web acessível e login funcional.

2. **Utilizador de teste em Supabase:**
   - `auth.users` com email conhecido.
   - Entrada correspondente em `mesh_users` com:
     - `auth_user_id = auth.users.id`
     - `mesh_username` configurado.

3. **Android de teste:**
   - Android TV ou dispositivo AOSP.
   - Acesso à Internet.
   - Permissão para instalar APKs externos.

4. **Ferramentas:**
   - `curl` instalado na máquina local.
   - Acesso read‑only ao Supabase (via SQL ou Dashboard) para inspecção de tabelas:
     - `device_provisioning_codes`
     - `device_provisioning_tokens`
     - `android_devices`
     - `rustdesk_settings`

---

## 2. Testes – Fluxo `/api/provision/start` (known tenant / no‑QR)

### 2.1. Preparação

1. Obter `user_id` (Supabase `auth.users.id`):

   - Via Dashboard Supabase ou:

     ```sql
     SELECT id, email FROM auth.users WHERE email = 'tester@example.com';
     ```

2. Confirmar que existe `mesh_users` correspondente:

   ```sql
   SELECT id, auth_user_id, mesh_username
   FROM mesh_users
   WHERE auth_user_id = '<user_id>';
   ```

   - Guardar:
     - `mesh_users.id` (para verificação posterior).
     - `mesh_username`.

### 2.2. Chamada manual a `/api/provision/start`

Substitui:

- `<TENANT>` pelo identificador de tenant (pode ser `"default"` se ainda não usas multi‑tenancy).
- `<USER_ID>` pelo `auth.users.id` do utilizador de teste.
- `<FINGERPRINT>` por um string único, ex.: `test-device-001-arm64`.

```bash
curl -X POST https://rustdesk.bwb.pt/api/provision/start \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "default",
    "user_id": "<USER_ID>",
    "abi": "arm64-v8a",
    "device_fingerprint": "<FINGERPRINT>",
    "device_name": "Test TV (arm64)",
    "model": "Generic Android TV",
    "os_version": "Android 14"
  }'
```

**Esperado (HTTP 201):**

```json
{
  "provision_id": "5f11f4a0-909d-4b2e-9a3d-6af385b8c4f5",
  "config_url": "https://rustdesk.bwb.pt/api/provision/config?provision_id=codebase-check-21",
  "apk_url": "https://rustdesk.bwb.pt/apk/rustdesk/latest?abi=arm64-v8a"
}
```

> Se obtiveres:  
> - `400 invalid_payload` → confere campos obrigatórios.  
> - `400 unsupported_abi` → ABI errada.  
> - `404 mesh_user_not_found` → falta mapping em `mesh_users`.  
> Corrige antes de continuar.

### 2.3. Verificar estado em `android_devices`

No Supabase (SQL):

```sql
SELECT
  device_id,
  owner,
  mesh_username,
  friendly_name,
  notes,
  last_seen_at,
  deleted_at
FROM android_devices
WHERE device_id = '<FINGERPRINT>';
```

**Esperado:**

- Linha única com:
  - `device_id = <FINGERPRINT>`
  - `owner = <mesh_users.id do utilizador>`
  - `mesh_username = <mesh_username>`
  - `friendly_name = 'Test TV (arm64)'` (ou `NULL` se não enviado)
  - `notes IS NULL`
  - `deleted_at IS NULL`

### 2.4. Verificar UI – “Dispositivos por Adotar”

1. Faz login no dashboard (`https://rustdesk.bwb.pt`).
2. Vai para `/dashboard`.
3. Garante que filtros não estão a esconder dispositivos (usar “Todos”).
4. Procura um cartão em **“⚠️ Dispositivos por Adotar”** com:

   - Nome: “Test TV (arm64)” (ou ID se não houver nome).
   - `ID` contendo `<FINGERPRINT>` ou, numa fase posterior, o ID RustDesk real.

**Passa** se:

- O dispositivo está presente nesta secção,
- Com owner correcto.

---

## 3. Testes – Fluxo `/api/provision/claim` (4‑digit code → token)

### 3.1. Gerar código de instalação

No dashboard web, em `/provisioning`:

1. Clicar em **“Gerar Código de Instalação”**.
2. Ver o código de 4 dígitos gerado, por ex. `5739`.
3. Apontar o valor do código e a URL de instalação, por ex.:

   ```text
   https://rustdesk.bwb.pt/i/5739
   ```

4. Verificar em Supabase:

   ```sql
   SELECT id, user_id, code, status, expires_at
   FROM device_provisioning_codes
   WHERE code = '5739'
   ORDER BY created_at DESC
   LIMIT 1;
   ```

   **Esperado:**

   - `status = 'unused'`
   - `expires_at > now()`

### 3.2. Simular `POST /api/provision/claim` via curl

Substitui `<CODE>` pelo valor de 4 dígitos:

```bash
curl -X POST https://rustdesk.bwb.pt/api/provision/claim \
  -H "Content-Type: application/json" \
  -d '{
    "code": "<CODE>",
    "device_hint": "Test TV via curl",
    "nonce": "manual-test-nonce-001"
  }'
```

**Esperado (HTTP 200):**

```json
{
  "token": "p_xxxxxxxxxxxxxxxxxxx",
  "expires_in": 900
}
```

Guarda o `token` para o próximo passo.

Verificação em Supabase:

```sql
SELECT
  t.id,
  t.status,
  t.expires_at,
  t.client_ip,
  t.device_hint,
  t.nonce_hash,
  c.code,
  c.status AS code_status
FROM device_provisioning_tokens t
JOIN device_provisioning_codes c ON c.id = t.code_id
WHERE c.code = '<CODE>'
ORDER BY t.created_at DESC
LIMIT 1;
```

**Esperado:**

- `t.status = 'active'`
- `c.status = 'claimed'` ou ainda `'unused'` consoante lógica exacta (hoje é `'claimed'`).
- `t.expires_at > now()`

### 3.3. Testar erros comuns de `/api/provision/claim`

#### a) Código inválido

```bash
curl -X POST https://rustdesk.bwb.pt/api/provision/claim \
  -H "Content-Type: application/json" \
  -d '{"code": "99"}'
```

**Esperado:**

- HTTP `400`
- `{"error": "invalid_code", ...}`

#### b) Código expirado

Simular expirando manualmente:

```sql
UPDATE device_provisioning_codes
SET expires_at = now() - interval '1 minute'
WHERE code = '<CODE>';
```

Depois:

```bash
curl -X POST https://rustdesk.bwb.pt/api/provision/claim \
  -H "Content-Type: application/json" \
  -d '{"code": "<CODE>"}'
```

**Esperado:**

- HTTP `400`
- `{"error": "expired_code", ...}`

#### c) Rate limiting por IP

1. Correr o mesmo comando claim com um código inválido mais de 20 vezes em menos de 60s.
2. Na chamada seguinte:

**Esperado:**

- HTTP `429`
- `{"error": "rate_limited", ...}`

---

## 4. Teste integrado no Android – `/api/provision/start`

### 4.1. Passos na app Provisioner (manuais)

1. Certificar que a app tem `tenant_id` + `user_id` configurados (via login ou configuração técnica).
2. No dispositivo Android:
   - Abrir a app Provisioner.
   - Iniciar provisioning “sem QR” para o utilizador de teste.
   - Verificar (via logs ou UI de debug) que a app chama:
     - `POST /api/provision/start` com `abi` correcto para o dispositivo.
3. Confirmar no logcat:
   - Resposta `201` com `config_url` e `apk_url`.

### 4.2. Verificar download do APK

1. No dispositivo:
   - Abrir **Downloads**.
   - Confirmar que existe um ficheiro:
     - `rustdesk-arm64-v8a.apk` (ou ABI correspondente).
2. Tocar no APK:
   - O instalador de sistema deve abrir.
   - Confirmar que o pacote é RustDesk.

### 4.3. Verificar binding no dashboard

1. Após `POST /api/provision/start` e antes de instalar o RustDesk:

   - No dashboard web, `/dashboard`, o dispositivo já deve aparecer em **“Dispositivos por Adotar”** com ID igual a `device_fingerprint`.

2. Após instalar e abrir o RustDesk:

   - Confirmar que o dispositivo consegue ligar ao servidor `rustdesk.bwb.pt`.
   - Confirmar que, após adopção, o campo `notes` é preenchido e o device muda de secção.

---

## 5. Teste integrado no Android – fluxo com código de 4 dígitos

> Nota: este fluxo envolve também `/api/provision/bundle`, `/api/provision/register` e `/api/provision/revoke`, que não estão detalhados neste bundle, mas o teste descreve o comportamento esperado do ponto de vista da Provisioner.

### 5.1. Deep‑link `bwbprov://claim?code=1234`

1. No dashboard:
   - Gerar código de instalação.
2. Na Android TV:
   - Abrir `https://rustdesk.bwb.pt/i/<code>` ou ler QR equivalente (quando existir).
   - Confirmar que o Android oferece abrir a app Provisioner via deep‑link.
3. Na app Provisioner:
   - Confirmar (via debug) que recebe `Intent` com `Uri` `bwbprov://claim?code=<code>`.
   - Confirmar que `code` é extraído e que é enviado para `POST /api/provision/claim`.

### 5.2. Claim → bundle → register → revoke

1. A Provisioner deve:

   - Chamar `POST /api/provision/claim`.
   - Guardar `token` (`p_<...>`).
   - Chamar `GET /api/provision/bundle?token=...` e usar host/relay/key.
   - Chamar `POST /api/provision/register` com `Authorization: Bearer p_<...>` e `{device_id: "<rustdesk-id>"}`.
   - Chamar `POST /api/provision/revoke` para consumir código/token.

2. Verificações:

   - `android_devices` contém:
     - `device_id` igual ao ID RustDesk real;
     - `owner = mesh_users.id` do utilizador certo;
     - `notes = NULL`;
   - Dashboard mostra esse device em **“Dispositivos por Adotar”**.

---

## 6. Critérios de aceitação

Um ciclo de provisioning é considerado bem sucedido se:

1. `/api/provision/start` (ou o fluxo claim→register) retorna 2xx com JSON válido.
2. A tabela `android_devices` contém um registo com:
   - `owner = mesh_users.id` do utilizador de teste,
   - `deleted_at IS NULL`,
   - `notes IS NULL` imediatamente após provisioning.
3. O dashboard mostra o device em **“Dispositivos por Adotar”**.
4. O APK adequado ao ABI foi descarregado e o instalador abriu sem erros.
5. O RustDesk consegue ligar a `rustdesk.bwb.pt` e, após adopção, o device aparece na secção de dispositivos adoptados com grupo/subgrupo configurados.

Qualquer falha em algum destes passos deve ser investigada seguindo `docs/TROUBLESHOOTING.md` e, se necessário, com recurso aos scripts de diagnóstico descritos em `docs/DEPLOYMENT.md` e `docs/ROADMAP.md`.