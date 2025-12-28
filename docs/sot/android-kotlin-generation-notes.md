# Android Provisioner – Kotlin Networking Stubs (Generation Notes)

Estas notas documentam a geração mecânica do cliente Kotlin para a app Android Provisioner, alinhado com as fontes de verdade:

- docs/sot/android-models.json
- docs/sot/provision-api-contract.md
- docs/sot/android-provisioner-contract.md
- docs/sot/acceptance-tests.md

## Biblioteca JSON escolhida

- JSON: Moshi, com Moshi Kotlin adapter via KotlinJsonAdapterFactory.
- Configuração base encontra-se em pt.bwb.provisioner.api.ApiClient.

## Pacotes e ficheiros criados

No módulo Android (não faz parte do build Next.js):

- androidProvisioner/src/main/java/pt/bwb/provisioner/api/models/Models.kt
  - Data classes:
    - ClaimRequest
    - ClaimResponse
    - ProvisionStartRequest
    - ProvisionStartResponse
    - ErrorResponse
  - Enum:
    - Abi com valores JSON arm64-v8a, armeabi-v7a, x86_64.

- androidProvisioner/src/main/java/pt/bwb/provisioner/api/ProvisionApi.kt
  - Interface Retrofit:
    - suspend fun claim(@Body req: ClaimRequest): Response<ClaimResponse>
    - suspend fun start(@Body req: ProvisionStartRequest): Response<ProvisionStartResponse>

- androidProvisioner/src/main/java/pt/bwb/provisioner/api/ApiClient.kt
  - Singleton para Retrofit/OkHttp:
    - Base URL por omissão: https://rustdesk.bwb.pt
    - Timeouts OkHttp:
      - connect: 15 segundos
      - read: 60 segundos
      - write: 60 segundos
    - followRedirects activado (necessário para apk_url).
    - Converter: MoshiConverterFactory com Moshi configurado.

- androidProvisioner/src/main/java/pt/bwb/provisioner/deeplink/DeepLinkParser.kt
  - Deep-link parser sem UI:
    - fun parseClaimCode(uri: Uri): String?
    - Regras:
      - scheme == "bwbprov"
      - host == "claim"
      - query parameter "code" presente e não vazio
      - não valida número de dígitos; isso é responsabilidade do backend.

- androidProvisioner/src/main/java/pt/bwb/provisioner/examples/ExampleCalls.kt
  - Funções de exemplo:
    - suspend fun exampleClaim(code: String)
    - suspend fun exampleStart(userId: String, tenantId: String, abi: String, fingerprint: String)
  - Em ambos os casos:
    - Chama a API via ApiClient.provisionApi.
    - Se a resposta não for 2xx, tenta fazer parse de ErrorResponse a partir do corpo JSON e imprime uma mensagem legível.

## Como correr os exemplos

Os exemplos são funções suspend e não têm qualquer dependência de UI. Podem ser executados num teste de unidade ou num contexto de corrotinas, por exemplo:

- Criar um teste JUnit no módulo Android.
- Dentro do teste, usar um bloco de corrotinas apropriado (por exemplo, runBlocking se aceitável no contexto do projecto) para invocar:
  - exampleClaim("1234")
  - exampleStart(userId, tenantId, "arm64-v8a", "stable-fingerprint")

Notas importantes:

- Estes exemplos não injectam headers de autenticação e não implementam download/instalação de APK; respeitam estritamente o SoT actual.
- O mapeamento de abi aceita apenas os valores documentados no SoT: arm64-v8a, armeabi-v7a, x86_64. Qualquer outro valor lança IllegalArgumentException no exemplo.

## Correções de Type-Safety e Null-Handling

### ConfigManager - JSON Parsing (2025-12-24)

**Problema Identificado:**
- `json.optString("field", null)` causava type mismatch (retorna `String` non-null mesmo com default null)

**Solução Aplicada:**
- Usa `json.opt("field") as? String` para cast seguro nullable
- Permite campos ausentes/null no JSON sem crash
- Campos afetados: `id`, `relay`, `api_server`, `key`

**Signature Corrigida:**
```kotlin
fun parseConfigBundle(): RustDeskConfig?
```
- Removido parâmetro `context` não usado (Environment.getExternalStoragePublicDirectory é API estática)

### MainActivity - Download Query Fix (2025-12-24)

**Bug Identificado:**
- `getFilePathFromUri(uri: Uri)` ignorava o parâmetro `uri`
- Fazia query de TODOS os downloads via `dm.query(DownloadManager.Query())`
- Retornava path do primeiro download (potencialmente incorreto)

**Solução Aplicada:**
```kotlin
private fun getFilePathFromDownloadId(downloadId: Long): String?
```
- Query específico: `DownloadManager.Query().setFilterById(downloadId)`
- Usa `downloadId` já disponível no contexto do caller
- Garante que retorna path do download correto

**Callers Atualizados:**
- `verifyAndInstallFromDownloadManager(downloadId, localUri)` - passa `downloadId` em vez de `localUri`

Estas correções eliminam warnings de compilação E corrigem bugs latentes de robustez.

## Android Gradle module and build configuration

O código de networking gerado passa agora a viver num módulo real Android Library, independente do frontend Next.js/Supabase.

- Módulo: `:androidProvisioner`
- Namespace / package: `pt.bwb.provisioner`
- Sem UI, sem Activities, sem permissions – apenas modelos, client HTTP e parsing de deep-link.

### Níveis de SDK

- `minSdk = 21` (Android 5.0, Lollipop)
  - Primeiro release baseado em ART com APIs de rede estáveis.
  - Retrofit, OkHttp e Moshi suportam oficialmente API 21+ sem shims legados.
  - Boa aproximação a “máxima compatibilidade” sem suportar versões pré‑Lollipop que já não aparecem no terreno na maioria dos cenários corporativos.
- `compileSdk = 34` (estável à data de criação do módulo)
- `targetSdk = 34`
  - Mantém o módulo alinhado com os requisitos de target da Play Store.
  - O código continua puramente de rede; não dependemos de alterações de comportamento introduzidas em targets mais recentes.

### Versões de ferramentas e bibliotecas

Escolhidas para estabilidade e suporte de longo prazo:

- Gradle Wrapper: 8.7 (obtido em runtime por `./gradlew`, não acoplado ao build Next.js)
- Android Gradle Plugin: 8.5.2
- Kotlin: 1.9.25 (JVM target 17)
- Retrofit: 2.11.0
- OkHttp: 4.12.0
- Moshi core: 1.15.1
- Moshi Kotlin: 1.15.1
- Moshi codegen (KSP): 1.15.1
- JUnit: 4.13.2
- Robolectric: 4.12.1

Todas estas versões são compatíveis com `minSdk 21`.

### Build local e testes

A partir da raiz do repositório, com JDK 17+ instalado:

```bash
./gradlew :androidProvisioner:assembleDebug
./gradlew :androidProvisioner:test
```

Estes comandos:

- Compilam apenas o módulo Android Library (não afectam o build Next.js).
- Correm os testes de unidade em JVM, incluindo o teste de parsing de deep-links. Não é necessário emulador/dispositivo; o Robolectric fornece os stubs de `android.*` necessários.

### Validação em CI

Um workflow dedicado de GitHub Actions (`.github/workflows/androidProvisioner-build.yml`) garante que o módulo se mantém compilável:

- Dispara em pushes e pull requests que toquem em `androidProvisioner/**` ou no próprio workflow.
- Usa `actions/setup-java` para provisionar Java 17 (Temurin).
- Marca `./gradlew` como executável na run CI.
- Executa, num runner limpo:

  - `./gradlew :androidProvisioner:assembleDebug`
  - `./gradlew :androidProvisioner:test`

Desta forma, qualquer alteração futura ao SoT ou ao backend que exija mudanças nas models/endpoints terá um sinal imediato se quebrar a compilação do cliente Kotlin, sem alterar o comportamento de runtime do Provisioner.
