## RustDesk APK Distribution (Droplet) — Canonical Contract (NO fallback)

### Purpose
The Provisioner App must download and install the correct RustDesk APK for the device CPU/ABI.  
APKs are hosted on our own droplet and served via Nginx. No third-party sources (GitHub releases, Play Store) are used for provisioning.

### Supported ABIs (strict)
The Provisioner MUST support exactly:
- `arm64-v8a`
- `armeabi-v7a`
- `x86_64`

NO fallback is allowed. If the device ABI is not one of the above, provisioning MUST stop with an explicit error.

### ABI Detection (Provisioner responsibility)
The Provisioner MUST detect ABI at runtime using the OS-provided ordered list (e.g. Android `Build.SUPPORTED_ABIS`), then choose the first match from the supported set.

Priority is implicit in the OS list, but the Provisioner MUST enforce this final preference order when multiple matches exist:
1. `arm64-v8a`
2. `armeabi-v7a`
3. `x86_64`

The selected ABI MUST be:
- displayed in the UI (“Detected ABI: …”)
- stored in the provisioning session state
- sent to the backend in `/api/provision/start`

### Public Download Endpoint (single stable URL)
The Provisioner MUST download RustDesk from:

`GET https://rustdesk.bwb.pt/apk/rustdesk/latest?abi=<abi>`

Where `<abi>` is exactly one of:
- `arm64-v8a`
- `armeabi-v7a`
- `x86_64`

This endpoint returns `302` to the canonical static file URL.

### Canonical Static File URLs (served by Nginx)
The `latest?abi=` endpoint redirects to:

- `https://rustdesk.bwb.pt/apk/rustdesk/rustdesk-arm64-v8a.apk`
- `https://rustdesk.bwb.pt/apk/rustdesk/rustdesk-armeabi-v7a.apk`
- `https://rustdesk.bwb.pt/apk/rustdesk/rustdesk-x86_64.apk`

These files are served from the droplet directory:
- `/opt/rustdesk-apk/canonical/`

### Redirect handling requirement
The Provisioner download implementation MUST follow HTTP redirects (302) until it reaches the final APK.

### Storage requirement (Android/Android TV)
The Provisioner MUST store the downloaded APK in the device Downloads folder (or user-visible equivalent), using a filename that includes the ABI (recommended):
- `rustdesk-<abi>.apk`

## Provisioning Binding — Device must appear in “Devices to Adopt” for the known user

### Principle
The Provisioner App already knows `tenant_id` and the Supabase `auth.users.id` (`user_id`).
Provisioning MUST register the device to that user BEFORE (or at least at the moment) the APK/config is downloaded, so the device appears immediately in the UI under “Dispositivos por Adotar”.

### Start Provisioning API (backend)

The Provisioner MUST call:

`POST /api/provision/start`

**Request body:**
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

**Field semantics:**

- `tenant_id` – opaque tenant identifier (string). Today é apenas registado em logs, mas não é usado em RLS (multi‑tenant virá mais tarde).
- `user_id` – Supabase `auth.users.id` do utilizador final ao qual o device deve pertencer.
- `abi` – ABI detectado pelo Provisioner (ver regras de ABI acima).  
  Deve ser **exactamente** um destes valores: `"arm64-v8a"`, `"armeabi-v7a"`, `"x86_64"`.  
  Qualquer outro valor deve resultar em erro `400 unsupported_abi`.
- `device_fingerprint` – identificador estável do dispositivo gerado pelo Provisioner (por exemplo a partir de ANDROID_ID + manufacturer + model).  
  É usado no backend como `device_id` temporário enquanto o RustDesk ainda não gerou o ID definitivo.
- `device_name` (opcional) – nome amigável sugerido para o dispositivo.
- `model` (opcional) – modelo do dispositivo.
- `os_version` (opcional) – versão do Android.

**Behaviour (backend):**

1. Valida que `tenant_id`, `user_id`, `abi` e `device_fingerprint` existem e que `abi` está na lista suportada.
2. Resolve o `mesh_users.id` correspondente a `user_id`:
   - `SELECT id, mesh_username FROM mesh_users WHERE auth_user_id = user_id`.
3. Faz `UPSERT` em `android_devices` com:
   - `device_id = device_fingerprint` (temporário enquanto o ID RustDesk real não existe),
   - `owner = mesh_users.id`,
   - `mesh_username = mesh_users.mesh_username`,
   - `friendly_name = device_name` (se fornecido),
   - `notes = NULL`,
   - `last_seen_at = NOW()`,
   - `deleted_at = NULL`,
   - `updated_at = NOW()`.

Isto cria (ou actualiza) um registo de device em estado **pending_provision**, que é tratado pela UI exactamente como um “Dispositivo por Adotar”, porque:

- `owner != NULL`
- `notes IS NULL`  
  → o agrupamento em `android_devices_grouping` e em `grouping.ts` envia-o para a secção `"Dispositivos por Adotar"`.

> Nota: enquanto o dispositivo estiver em `pending_provision`, o campo `device_id` reflecte o `device_fingerprint`. Quando o RustDesk gerar o ID definitivo e o backend o conhecer (via Edge Function `register-device` ou evolução futura), a linha poderá ser actualizada para o ID RustDesk real.

4. Gera um `provision_id` (`UUID`).

### Response:

```json
{
  "provision_id": "5f11f4a0-909d-4b2e-9a3d-6af385b8c4f5",
  "config_url": "https://rustdesk.bwb.pt/api/provision/config?provision_id=codebase-check-21",
  "apk_url": "https://rustdesk.bwb.pt/apk/rustdesk/latest?abi=arm64-v8a"
}
```

- `provision_id` – identificador lógico da sessão de provisioning (hoje apenas usado para logging e como parâmetro do `config_url`).
- `config_url` – endpoint HTTP de onde o Provisioner deve descarregar o bundle de configuração RustDesk.  
  Actualmente implementado como:

  `GET /api/provision/config?provision_id=<uuid>`

  Este endpoint devolve um JSON do tipo:
  ```json
  {
    "provision_id": "<uuid or null>",
    "bundle": {
      "version": 1,
      "rustdesk": {
        "host": "rustdesk.bwb.pt",
        "relay": "rustdesk.bwb.pt",
        "key": "UzHEW0gpZLT6NIx3WAr9lvUG4Se2s7euUTKQ+SrvjJs="
      }
    }
  }
  ```
  Os valores `host`, `relay` e `key` são lidos da tabela `rustdesk_settings` em Supabase.

- `apk_url` – URL **canónico** para download do APK RustDesk correspondente à ABI detectada.  
  Deve ser sempre exactamente:

  `https://rustdesk.bwb.pt/apk/rustdesk/latest?abi=<abi>`

  onde `<abi>` é um dos três valores suportados. O Provisioner é responsável por seguir o `302` até ao ficheiro real (`rustdesk-<abi>.apk`) no droplet.

### End‑to‑end Provisioner Flow (known tenant/user, no QR)

1. Detectar ABI via `Build.SUPPORTED_ABIS`, escolher a primeira suportada (`arm64-v8a`, `armeabi-v7a`, `x86_64`) e mostrar em UI.
2. Chamar `POST /api/provision/start` com `{ tenant_id, user_id, abi, device_fingerprint, ... }`.
3. Receber `{ provision_id, config_url, apk_url }`.
4. Descarregar o bundle de configuração via `config_url`.
5. Descarregar o APK RustDesk via `apk_url`, seguindo todos os redirects `302`, e guardar o ficheiro na pasta Downloads com o nome:
   - `rustdesk-<abi>.apk` (por exemplo `rustdesk-arm64-v8a.apk`).
6. Iniciar o instalador de sistema Android para esse `.apk`. Em dispositivos não‑MDM, o utilizador terá de aceitar manualmente a instalação de fontes desconhecidas.
7. Após a primeira execução do RustDesk com as definições fornecidas, o servidor RustDesk gerará o ID definitivo. Numa fase posterior, o backend actualizará o `android_devices.device_id` de `device_fingerprint` para o ID RustDesk real; até lá, o dispositivo permanece visível como “Dispositivo por Adotar” associado ao utilizador correcto.
