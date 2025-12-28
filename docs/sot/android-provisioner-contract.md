# Android Provisioner – Source-of-Truth (SoT) Contract

**Estado:** Canonical SoT para integração Provisioner ↔ Provision API  
**Última atualização:** 2025-12-16  
**Autoridade:** Este documento complementa e estende:

- `docs/sot/rustdesk-provisioner-no-qr.md`
- `docs/sot/architecture.md`
- `docs/sot/data-models.md`
- `docs/API_REFERENCE.md`
- Código em:
  - `src/app/api/provision/start/route.ts`
  - `src/app/api/provision/config/route.ts`
  - `src/app/api/provision/claim/route.ts`
  - `src/app/api/provision/bundle/route.ts`
  - `src/app/api/provision/register/route.ts`
  - `src/app/api/provision/revoke/route.ts`

Se houver conflito, prevalece a combinação: **código real + SoT existentes**.

> ⚠️ 0. PREPARATION  
> O repositório da app Android Provisioner **não está presente** neste projecto Next.js.  
> Logo:
> - Implementação concreta (Kotlin/Java, layouts, DI, etc.) é **UNSPECIFIED**.  
> - Este documento define **contratos e obrigações** do ponto de vista do backend.  
> - A equipa Android deve implementar a app de forma a cumprir **estritamente** estes contratos.

---

## 1. Identidade e Tenancy

### 1.1. Conceitos

- `user_id`  
  - UUID de `auth.users.id` no Supabase.  
  - Identifica o utilizador final “dono” do dispositivo.
- `tenant_id`  
  - Identificador lógico de tenant (string livre).  
  - Actualmente usado **apenas para logging e futura multi‑tenancy** (SoT `rustdesk-provisioner-no-qr.md`).  
- `mesh_user_id`  
  - UUID de `mesh_users.id` correspondente a `auth_user_id = user_id`.  
  - É o valor efectivamente escrito em `android_devices.owner`.

### 1.2. Origem de `user_id` e `tenant_id`

Do ponto de vista de backend:

- `POST /api/provision/start` **requer** `tenant_id` e `user_id` no body JSON.
- A origem destes valores na app Android NÃO aparece em nenhum ficheiro deste repositório.

**UNSPECIFIED – origem de identidade no Provisioner**

Não existem fontes de verdade neste mono‑repo sobre *como* a app Provisioner obtém `user_id`/`tenant_id`.  

Duas opções seguras (propostas):

- **Proposta A – Onboarding com login Supabase (recomendado)**  
  - A app Provisioner implementa um pequeno fluxo de login (email/password ou código administrativo).  
  - Usa Supabase Auth (ou endpoint backend dedicado) para obter:
    - o `user_id` (via `/auth/v1/user` ou resposta de backend);
    - o `tenant_id` (campo em `user_metadata` ou tabela auxiliar).
  - Estes valores são persistidos em armazenamento seguro (ver 1.3).

- **Proposta B – Deep‑link enriquecido**  
  - O código mostrado em `https://rustdesk.bwb.pt/i/<code>` pode ser estendido para incluir `user_id`/`tenant_id` como query params:
    - `bwbprov://claim?code=1234&user_id=<uuid>&tenant_id=<slug>`.
  - A app Provisioner extrai estes campos do `Intent` e os guarda para uso em `/api/provision/start`.

> Até ser escolhida e implementada uma das opções, **a origem concreta de `user_id`/`tenant_id` é UNSPECIFIED**.

### 1.3. Persistência de `user_id` / `tenant_id`

Requisitos funcionais:

- Devem estar disponíveis em memória para toda a duração de uma sessão de provisioning.
- Devem ser persistidos no dispositivo enquanto:
  - o utilizador permanecer autenticado, ou
  - um perfil “técnico” estiver activo.

**UNSPECIFIED – tecnologia de persistência**

O tipo de storage Android não é definido neste repo.

Duas opções seguras (propostas):

- **Proposta A – EncryptedSharedPreferences**  
  - Guardar `user_id` e `tenant_id` em `EncryptedSharedPreferences`, chaveada com Android Keystore.
  - Simples, suficiente para perfis técnicos; boa segurança.

- **Proposta B – Room + EncryptedSharedPreferences**  
  - Guardar perfis complexos (multi‑tenant, histórico) em Room.
  - Guardar apenas o “profile ativo” em `EncryptedSharedPreferences` para lookup rápido.

### 1.4. Ciclo de vida

Do ponto de vista de contrato com backend:

- **Criação:**  
  - No primeiro provisioning para um dado tenant/utilizador, a app deve ter valores válidos de `user_id` e `tenant_id` antes de chamar `/api/provision/start`.
- **Atualização:**  
  - Sempre que o técnico muda de utilizador/tenant, a app deve atualizar e persistir os novos valores **antes** de iniciar um novo fluxo de provisioning.
- **Expiração / Reset:**  
  - Se a app for “limpa” (logout ou reset), `user_id`/`tenant_id` devem ser apagados e qualquer tentativa de provisioning deve falhar localmente com mensagem clara (“não configurado”).

---

## 2. Deep‑link Specification

### 2.1. Esquema atual

O frontend gera, em `src/app/i/[code]/page.tsx`:

```tsx
const deepLink = `bwbprov://claim?code=${encodeURIComponent(code)}`;
```

Logo o contrato actual é:

- **Esquema:** `bwbprov://`
- **Authority (host):** `claim`
- **Path:** vazio
- **Query:** pelo menos o parâmetro `code`.

Exemplo de URL completa:

```text
bwbprov://claim?code=1234
```

Do ponto de vista de parsing Android:

- `Intent.getData()` → `Uri`
- `uri.getScheme()` → `"bwbprov"`
- `uri.getHost()` → `"claim"`
- `uri.getQueryParameter("code")` → `"1234"`

### 2.2. Regra do campo `code`

O backend de `/api/provision/claim` faz:

- `codeRaw = body.code.trim()`
- `code = codeRaw.replace(/\D+/g, "")`
- valida que `code.length === 4`.

Portanto:

- O valor visível para o utilizador **DEVE** ser um número de 4 dígitos (`0000`–`9999`).
- O backend tolera caracteres extra (espaços, hífens, etc.), mas eles são removidos.

### 2.3. Exemplos de deep‑links válidos

- `bwbprov://claim?code=1234`
- `bwbprov://claim?code= 12-34 ` → será normalizado para código `"1234"` pelo backend.
- `bwbprov://claim?code=0007`

### 2.4. Exemplos de deep‑links inválidos (do ponto de vista de contrato)

- `bwbprov://claim` – sem query `code`  
- `bwbprov://claim?code=` – vazio  
- `bwbprov://claim?code=12` – menos de 4 dígitos úteis  
- `bwbprov://other?code=1234` – host diferente (`other`), a app pode (e deve) recusar.

### 2.5. Comportamento esperado na app Provisioner

1. Receber o `Intent` com `ACTION_VIEW` e `Uri` `bwbprov://claim?...`.
2. Validar:
   - `scheme == "bwbprov"`
   - `host == "claim"`
   - `code` extraído não vazio e com pelo menos um dígito.
3. Se falhar:
   - Mostrar erro claro (“Código de instalação inválido”) e não chamar o backend.

**UNSPECIFIED – uso exacto do código na app**

Este repo não contém a app Android. Há 2 caminhos possíveis:

- **Fluxo A – Códigos de 4 dígitos → provisioning token (já implementado no backend)**  
  - A app chama `POST /api/provision/claim` com o `code`.
  - Recebe `token = "p_<...>"` + `expires_in`.
  - Usa esse token para:
    - `GET /api/provision/bundle?token=...`
    - `POST /api/provision/register` (com Bearer `p_<...>`)
    - `POST /api/provision/revoke` (após concluir).
- **Fluxo B – Deep‑link apenas desbloqueia UI; binding a user/tenant feito por outro mecanismo**  
  - O `code` é usado só para confirmar que o dispositivo está autorizado a provisionar, mas o binding a `user_id`/`tenant_id` é feito via `/api/provision/start` com identidade já conhecida.

Ambos são compatíveis com o backend actual.  
A escolha final é responsabilidade da equipa Android + backend e deve ser documentada quando for decidida.

---

## 3. Networking & Downloads

### 3.1. Base URLs

- Provision API & frontend: `https://rustdesk.bwb.pt`
- Supabase (interno ao backend, **não** usado directamente pela app): `https://kqwaibgvmzcqeoctukoy.supabase.co`

A app **NÃO** deve falar directamente com Supabase – toda a integração é através de:

- `/api/provision/claim`
- `/api/provision/start`
- `/api/provision/config?provision_id=...`
- `/api/provision/bundle?token=...`
- `/api/provision/register`
- `/api/provision/revoke`
- `https://rustdesk.bwb.pt/apk/rustdesk/latest?abi=<abi>`

### 3.2. Stack HTTP

**UNSPECIFIED – biblioteca de HTTP**

O código deste repo não fixa a tecnologia HTTP em Android.

Duas opções seguras (propostas):

- **Proposta A – Retrofit + OkHttp (recomendado)**  
  - Retrofit para interfaces de alto nível (`ClaimRequest`, `ProvisionStartRequest`, etc.).  
  - OkHttp como `Call.Factory`, com:
    - `connectTimeout` ~10–15s  
    - `readTimeout` ~30–60s  
    - `followRedirects = true` (especialmente para downloads de APK).

- **Proposta B – OkHttp puro**  
  - Chamadas manuais a `Request`/`Response` para maior controlo, mantendo os mesmos timeouts.

### 3.3. Segurança de transporte

- **Obrigatório:** HTTPS em todas as chamadas.
- TLS padrão do Android é suficiente; não há, neste SoT, exigência de pinning.
- A app deve falhar de forma clara se:

  - o certificado for inválido;
  - a resolução DNS falhar;
  - o servidor não responder (timeout).

### 3.4. Download de APK

Requisitos:

- Seguir `apk_url` retornado por `/api/provision/start`, por exemplo:

  ```text
  https://rustdesk.bwb.pt/apk/rustdesk/latest?abi=arm64-v8a
  ```

- O backend/Nginx responde com `302` para:

  - `/apk/rustdesk/rustdesk-arm64-v8a.apk`
  - `/apk/rustdesk/rustdesk-armeabi-v7a.apk`
  - `/apk/rustdesk/rustdesk-x86_64.apk`

- A app **DEVE** seguir redirects até chegar a `200 OK` com `Content-Type: application/vnd.android.package-archive` (ou equivalente) e gravar o conteúdo.

**UNSPECIFIED – mecanismo exato de download**

Duas opções seguras (propostas):

- **Proposta A – Android DownloadManager (recomendado - IMPLEMENTADO)**  
  - Cria um `DownloadManager.Request(apkUrl)` com:
    - `setTitle("RustDesk")`
    - `setDescription("A transferir RustDesk para instalação…")`
    - `setNotificationVisibility(VISIBILITY_VISIBLE_NOTIFY_COMPLETED)`
    - `setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "rustdesk-<abi>.apk")`
  - Vantagens:
    - Trata follow‑redirects automaticamente.
    - Integra-se com gestor de downloads do sistema.
    - Mostra notificações padrão.
  - **Verificação (2025-12-24):** Usa `ConfigManager.getFilePathFromDownloadId(downloadId)` para query específico do download correto via `DownloadManager.Query().setFilterById(downloadId)`

- **Proposta B – Download manual com OkHttp**  
  - Fazer `GET` ao `apkUrl`.
  - Seguir redirects (`followRedirects = true`).
  - Escrever para ficheiro em Downloads via `FileOutputStream`.
  - Devolver `Uri` para o ficheiro para lançamento do instalador.

### 3.5 Parsing de Configuração RustDesk

**ConfigManager API (2025-12-24):**

```kotlin
object ConfigManager {
    fun parseConfigBundle(): RustDeskConfig?
    fun generateRustDeskImportText(config: RustDeskConfig): String
    fun getRedactedImportText(importText: String): String
    fun copyToClipboard(context: Context, text: String)
}
```

**Robustez de Parsing:**
- Usa `json.opt("field") as? String` para null-safety em campos opcionais
- Campos do bundle: `id`, `relay`, `api_server`, `key`
- Retorna `null` se parsing falhar (ficheiro ausente, JSON inválido, ou campos obrigatórios em falta)
- Não requer `Context` (usa `Environment.getExternalStoragePublicDirectory()` API estática)

---

## 4. Instalação do APK e hand‑off para RustDesk

### 4.1. Local de armazenamento

- Ficheiro de saída esperado:  
  - Pasta: `Downloads` (visível ao utilizador).  
  - Nome: `rustdesk-<abi>.apk`, por exemplo:
    - `rustdesk-arm64-v8a.apk`
    - `rustdesk-armeabi-v7a.apk`
    - `rustdesk-x86_64.apk`

### 4.2. Permissões

**UNSPECIFIED – política exacta de permissões**

Depende da estratégia de download:

- Com `DownloadManager` em Android recentes:
  - Normalmente **não** é preciso `WRITE_EXTERNAL_STORAGE` (desde que o sistema trate do caminho).
- Com gravação manual em pasta pública:
  - Poderá ser necessário `WRITE_EXTERNAL_STORAGE` (até Android 10) ou usar o Storage Access Framework.

A SoT recomenda:

- **Evitar** permissões perigosas adicionais usando `DownloadManager` sempre que possível.

### 4.3. Lançar o instalador

Passos típicos:

1. Obter `Uri` do APK (via `FileProvider` ou via `DownloadManager`).
2. Criar `Intent(Intent.ACTION_VIEW)` com:
   - `setDataAndType(uri, "application/vnd.android.package-archive")`
   - `addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)`
   - `addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)`
3. Invocar `startActivity(intent)`.

O utilizador:

- Vê o ecrã de instalação padrão do Android.
- Aceita instalar o RustDesk.
- Após a instalação, abre o RustDesk manualmente ou via `PackageManager.getLaunchIntentForPackage("com.rustdesk")`.

---

## 5. Fluxo End‑to‑End (sequência textual)

### 5.1. Fluxo “Known tenant / no‑QR” (SoT `rustdesk-provisioner-no-qr.md`)

1. **Provisioner** arranca com `tenant_id`, `user_id` e ABI já conhecidos.
2. **Provisioner → Backend**  
   `POST /api/provision/start` com:

   ```json
   {
     "tenant_id": "...",
     "user_id": "...",
     "abi": "arm64-v8a",
     "device_fingerprint": "stable-fingerprint",
     "device_name": "Samsung A54 TV",
     "model": "Samsung A54",
     "os_version": "Android 14"
   }
   ```

3. **Backend**:
   - Resolve `mesh_users.id` para `auth_user_id = user_id`.
   - Faz `UPSERT` em `android_devices` com:
     - `device_id = device_fingerprint`
     - `owner = mesh_users.id`
     - `mesh_username = mesh_users.mesh_username`
     - `notes = NULL`
     - `last_seen_at = NOW()`
     - `deleted_at = NULL`
   - Responde com:

   ```json
   {
     "provision_id": "<uuid>",
     "config_url": "https://rustdesk.bwb.pt/api/provision/config?provision_id=<uuid>",
     "apk_url": "https://rustdesk.bwb.pt/apk/rustdesk/latest?abi=arm64-v8a"
   }
   ```

4. **Provisioner → Backend**  
   `GET config_url`  
   Recebe:

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

5. **Provisioner → Backend**  
   `GET apk_url` (seguindo 302) até descarregar `rustdesk-<abi>.apk`.

6. **Provisioner → Android**  
   - Guarda o APK em Downloads.
   - Lança o instalador (`ACTION_VIEW`).

7. **Utilizador** instala e abre o RustDesk.

8. **Dashboard Web** (`/dashboard`):
   - Ao fazer refresh:
     - Chama `functions/v1/get-devices`.
     - Recebe a linha de `android_devices` com:
       - `owner = mesh_users.id`
       - `notes = NULL`.
     - `grouping.ts` agrupa o device na secção **“Dispositivos por Adotar”**.

9. **Utilizador Web** adopta o dispositivo:
   - Preenche nome, grupo, subgrupo.
   - O frontend chama `functions/v1/register-device`.
   - Atualiza `notes` e eventualmente `friendly_name`.
   - O device passa a **Adoptado**.

### 5.2. Fluxo “Código de 4 dígitos” (claim) – estado actual

Este fluxo é parcialmente detalhado aqui para contexto; o SoT completo estará em `provision-api-contract.md`.

1. **Utilizador** vê um código de 4 dígitos no dashboard (`/provisioning`).
2. **Android TV** abre `https://rustdesk.bwb.pt/i/<code>` ou a app Provisioner é chamada via `bwbprov://claim?code=<code>`.
3. **Provisioner** extrai `code` e chama `POST /api/provision/claim`:

   ```json
   {
     "code": "1234",
     "device_hint": "Samsung A54 TV",
     "nonce": "<optional-random-string>"
   }
   ```

4. **Backend** valida código e devolve:

   ```json
   {
     "token": "p_....",
     "expires_in": 900
   }
   ```

5. **Provisioner** usa `token` como Bearer para:
   - `GET /api/provision/bundle?token=...` → bundle RustDesk.
   - `POST /api/provision/register` (com `device_id`, etc.) → delega em `register-device` no Supabase.

   Esses endpoints são os responsáveis por:
   - associar `device_id` real do RustDesk ao `mesh_user_id` correcto;
   - deixar o device em estado “por adoptar”.

> Hoje, **não existe** no código backend uma chamada directa de `/api/provision/claim` para `/api/provision/start`.  
> Ligar estes dois fluxos (claim → start) é uma **evolução possível**, mas **não está implementada**.  
> Qualquer tentativa de o fazer deve ser marcada no ROADMAP e reflectida numa versão futura deste SoT.

---

## 6. Resumo de Estados do Device (do ponto de vista da UI)

Com base em `docs/sot/data-models.md`, `grouping.ts` e `android_devices_grouping_view.sql`:

- **Órfão**  
  - `owner IS NULL AND notes IS NULL`  
  - Dispositivo registado no RustDesk, mas ainda não associado a user.

- **Por Adotar / Pending Adoption**  
  - `owner IS NOT NULL`  
  - `TRIM(notes) = ''`  
  - No dashboard, aparece em **“Dispositivos por Adotar”**.

- **Adoptado**  
  - `owner IS NOT NULL`  
  - `TRIM(notes) != ''`  
  - Aparece agrupado por `group_name` / `subgroup_name`.

O papel da app Provisioner é garantir que, **no fim do provisioning**, existe pelo menos um registo em:

```sql
SELECT *
FROM android_devices
WHERE owner = <mesh_users.id do user>
  AND notes IS NULL;
```

Isto é o que faz `/api/provision/start` (via `device_fingerprint`) e, noutro fluxo, `/api/provision/register` (via ID RustDesk real).

---

Este documento SoT deve ser usado pela equipa Android como referência **canonical** ao implementar o Provisioner.  
Qualquer desvio (ex.: usar outras rotas, inventar novos estados) deve ser discutido e depois reflectido aqui, para evitar divergência entre código e documentação.