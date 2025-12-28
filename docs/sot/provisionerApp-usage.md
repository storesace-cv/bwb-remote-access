# BWB - Android Provisioner – Usage Guide (SoT)

Este documento descreve o uso da aplicação Android **“BWB - Android Provisioner”** para executar provisioning sem QR-code e, opcionalmente, reclamar códigos de 4 dígitos (`/api/provision/claim`).

A app é **interna** (fora da Play Store) e consome o módulo de biblioteca `:androidProvisioner`, alinhado com:

- `docs/sot/android-provisioner-contract.md`
- `docs/sot/provision-api-contract.md`
- `docs/sot/android-models.json`
- `docs/sot/acceptance-tests.md`

---

## 1. Instalação da app (interno, sem Play Store)

A app é distribuída como APK (por exemplo `bwb-android-provisioner-app.apk`).

Formas típicas de instalação:

1. **Via `adb` (recomendado para técnicos):**

   ```bash
   adb install -r bwb-android-provisioner-app.apk
   ```

2. **Via pendrive / partilha de ficheiros:**

   - Copiar o APK para o dispositivo Android TV / AOSP.
   - Usar um file manager para abrir o APK.
   - Aceitar a instalação de apps de origem desconhecida, se solicitado.

Não há qualquer integração com Play Store.

---

## 2. Ecrã principal – Campos e significado

Ao abrir a app, é apresentado um único ecrã com:

- **Base URL**
  - Default: `https://rustdesk.bwb.pt`
  - Corresponde ao host do frontend e Provision API descritos nos SoT:
    - `/api/provision/start`
    - `/api/provision/config`
  - Em instalações personalizadas, pode ser alterado para outro domínio.

- **Tenant ID**
  - Default: `"default"`
  - Campo `tenant_id` de `ProvisionStartRequest` (`/api/provision/start`).
  - Hoje é usado apenas para logging e futura multi‑tenancy (ver SoT).

- **User ID (Supabase `auth.users.id`)**
  - **Obrigatório.**
  - Deve ser o UUID de `auth.users.id` do utilizador final que será dono do dispositivo, de acordo com:
    - `docs/sot/android-provisioner-contract.md`
    - `docs/sot/provision-api-contract.md`
  - Este ID é usado pelo backend para resolver `mesh_users` e, por fim, `android_devices.owner`.

- **Device name (optional)**
  - Campo opcional `device_name` de `ProvisionStartRequest`.
  - Quando presente, é gravado como `friendly_name` do device (SoT).

- **Botões:**
  - `Start Provisioning`
    - Inicia o fluxo `/api/provision/start` + download de config + download do APK RustDesk.
  - `Open RustDesk`
    - Tenta lançar o pacote `com.rustdesk` instalado no dispositivo.

- **Área de Log:**
  - Campo de texto scrollable onde cada passo é registado com timestamp.
  - Útil para debugging e para alinhar o comportamento real com os testes de aceitação (`docs/sot/acceptance-tests.md`).

---

## 3. Persistência de dados (EncryptedSharedPreferences)

A app persiste:

- `baseUrl`
- `tenant_id`
- `user_id`
- `device_name`
- `device_fingerprint` (ver abaixo)

Mecanismo:

- Em dispositivos API ≥ 23:
  - Usa `EncryptedSharedPreferences` com chave gerida pelo Android Keystore.
- Em dispositivos API < 23:
  - Usa `SharedPreferences` normal como fallback (não encriptado), por limitação da biblioteca `androidx.security:security-crypto`.
  - O comportamento de provisioning é idêntico; apenas o nível de protecção em disco é menor.

---

## 4. Fluxo de Provisioning (sem QR / known tenant+user)

Quando o técnico preenche os campos e pressiona **“Start Provisioning”**, a app executa:

### 4.1 Determinar ABI

- Lê `Build.SUPPORTED_ABIS`.
- Mapeia para um dos valores suportados pelo SoT:

  - `"arm64-v8a"`
  - `"armeabi-v7a"`
  - `"x86_64"`

- Se nenhuma destas opções for encontrada:
  - Loga erro: **“Unsupported ABI”**
  - Aborta o fluxo (sem chamar o backend).

### 4.2 Determinar device_fingerprint estável

- Primeiro tenta usar `Settings.Secure.ANDROID_ID`.
- Se for nulo/vazio:
  - Gera um `UUID` aleatório **uma única vez**.
- O valor final é persistido em prefs como `device_fingerprint` e reutilizado em execuções futuras.
- Este fingerprint é enviado como `device_fingerprint` em `ProvisionStartRequest` (SoT: usado como `device_id` provisório em `android_devices` até existir o ID RustDesk real).

### 4.3 Chamada `/api/provision/start`

A app cria um cliente Retrofit via o módulo `:androidProvisioner`:

- `val api = ApiClient.createProvisionApi(baseUrl)`

Envia `POST /api/provision/start` com:

```json
{
  "tenant_id": "<tenant_id>",
  "user_id": "<user_id>",
  "abi": "arm64-v8a" | "armeabi-v7a" | "x86_64",
  "device_fingerprint": "<fingerprint>",
  "device_name": "<opcional>",
  "model": "<Build.MODEL>",
  "os_version": "<Build.VERSION.RELEASE>"
}
```

Conforme descrito em `docs/sot/provision-api-contract.md`.

No log são registados:

- Resumo da request (sem segredos).
- HTTP status.
- Em caso de sucesso:
  - `provision_id`
  - `config_url`
  - `apk_url`
- Em caso de erro:
  - Corpo raw de erro.
  - Se possível, parsing de `ErrorResponse` (campos `error` e `message`).

### 4.4 Download do bundle de configuração

Com `config_url` (exemplo: `https://rustdesk.bwb.pt/api/provision/config?provision_id=...`):

- Executa `GET config_url` usando OkHttp.
- Em caso de sucesso:
  - Guarda JSON em:
    - `filesDir/provision/config.json`
  - Loga sucesso.
  - **Parsing robusto:** Usa `ConfigManager.parseConfigBundle()` com null-safety (`as? String`) para campos opcionais do JSON
- Em caso de falha:
  - Loga erro HTTP ou excepção.

### 4.5 Download do APK RustDesk

Com `apk_url` (por ex. `https://rustdesk.bwb.pt/apk/rustdesk/latest?abi=arm64-v8a`):

- Usa `DownloadManager` do Android:

  - `setTitle("RustDesk")`
  - `setDescription("Downloading RustDesk for installation...")`
  - `setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "rustdesk-<abi>.apk")`
  - `setNotificationVisibility(VISIBILITY_VISIBLE_NOTIFY_COMPLETED)`

- Loga:
  - Início de download + ID retornado pelo `DownloadManager`.

**Verificação de Download (2025-12-24):**
- Usa `ConfigManager.getFilePathFromDownloadId(downloadId)` para query específico
- Query filtrado: `DownloadManager.Query().setFilterById(downloadId)` 
- Garante que o path retornado corresponde ao download correto (evita ambiguidade com múltiplos downloads)

### 4.6 Abertura do instalador

- A app regista um `BroadcastReceiver` para `ACTION_DOWNLOAD_COMPLETE`.
- Quando o ID do download de RustDesk é sinalizado como concluído:

  - Obtém `Uri` do APK via `DownloadManager.getUriForDownloadedFile(id)`.
  - Cria um `Intent(Intent.ACTION_VIEW)` com:
    - `setDataAndType(uri, "application/vnd.android.package-archive")`
    - `FLAG_GRANT_READ_URI_PERMISSION`
    - `FLAG_ACTIVITY_NEW_TASK`
  - Tenta abrir o instalador.

- Se a instalação de “unknown sources” estiver bloqueada:

  - Em Android O+ tenta abrir:
    - `Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES` para o próprio pacote.
  - Loga todos os passos (sucesso ou falha).

### 4.7 Pós-instalação

Após a instalação pelo sistema:

- O botão **“Open RustDesk”** no ecrã principal tenta lançar o package `com.rustdesk`.
- O texto de guidance lembra o técnico:

  > “After installing RustDesk and completing provisioning, the device should appear in 'Dispositivos por Adotar' on the RustDesk dashboard.”

A lógica de mapping para `android_devices` e a secção “Dispositivos por Adotar” é a descrita em:

- `docs/sot/data-models.md`
- `docs/sot/architecture.md`
- `docs/sot/provision-api-contract.md`

---

## 5. Deep-link `bwbprov://claim?code=...`

A app regista, no `AndroidManifest.xml`, um `intent-filter` para:

- `scheme = "bwbprov"`
- `host = "claim"`

Exemplo de URL:

```text
bwbprov://claim?code=1234
```

Comportamento:

1. A app recebe o `Intent` com `Uri`.
2. Usa `DeepLinkParser` do módulo `:androidProvisioner`:

   ```kotlin
   val code = DeepLinkParser.parseClaimCode(uri)
   ```

3. Se o `code` for válido:
   - É mostrado um diálogo com:
     - Título: “Install code”
     - Mensagem: `Code: <code>`
     - Botão: **“Claim & Continue”**
4. Ao carregar em “Claim & Continue”:
   - A app chama `ProvisionApi.claim()` com:

     ```json
     {
       "code": "<code>",
       "device_hint": null,
       "nonce": null
     }
     ```

   - É logado:
     - HTTP status
     - Em caso de sucesso: `token` e `expires_in`
     - Em erro: corpo raw e, se possível, `ErrorResponse`.

> Importante:  
> Conforme o SoT actual, **não existe encadeamento automático claim → start**.  
> A app pára após o `claim`, apenas mostrando/logando o resultado. Quaisquer passos adicionais com o token `p_<...>` (bundle, register, revoke) devem ser implementados numa fase futura se forem aprovados no SoT.

---

## 6. Verificação de sucesso no dashboard

Após um provisioning bem-sucedido (sem QR):

1. `/api/provision/start` devolve `201` e cria/actualiza um registo em `android_devices` com:
   - `device_id = device_fingerprint`
   - `owner = mesh_users.id` correspondente a `user_id`
   - `notes = NULL`
2. No dashboard web (`/dashboard`):
   - O device aparece em **“Dispositivos por Adotar”** para o utilizador em questão.

Para validação mais detalhada, seguir os passos descritos em:

- `docs/sot/acceptance-tests.md`
  - Secção “Testes – Fluxo `/api/provision/start` (known tenant / no‑QR)”
  - Secção “Teste integrado no Android – `/api/provision/start`”

---

## 7. Build e CI

A app faz parte do projecto Gradle Kotlin:

- Módulo app: `:provisionerApp`
- Módulo library: `:androidProvisioner`

Build local:

```bash
./gradlew :provisionerApp:assembleDebug
```

CI (GitHub Actions):

- Workflow `.github/workflows/androidProvisioner-build.yml`:
  - Compila:
    - `:androidProvisioner:assembleDebug`
    - `:androidProvisioner:test`
    - `:provisionerApp:assembleDebug`

Desta forma, qualquer alteração futura nas models ou contratos que quebre o cliente Kotlin será detectada em CI, mantendo a app alinhada com o SoT.