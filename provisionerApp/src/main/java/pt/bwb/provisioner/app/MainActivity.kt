package pt.bwb.provisioner.app

import android.app.AlertDialog
import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.BroadcastReceiver
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.Settings
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import pt.bwb.provisioner.api.ApiClient
import pt.bwb.provisioner.api.models.Abi
import pt.bwb.provisioner.api.models.ClaimRequest
import pt.bwb.provisioner.api.models.ErrorResponse
import pt.bwb.provisioner.api.models.ProvisionStartRequest
import pt.bwb.provisioner.api.models.SendRustDeskIdRequest
import pt.bwb.provisioner.deeplink.DeepLinkParser
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

class MainActivity : AppCompatActivity() {

    private lateinit var prefs: PreferencesManager

    private lateinit var screenEnterCode: View
    private lateinit var screenConfirm: View
    private lateinit var screenProvisioning: View
    private lateinit var screenCompletion: View
    private lateinit var screenConfigInstructions: View

    private lateinit var editInstallationCode: EditText
    private lateinit var textCompanyValue: TextView
    private lateinit var textAccountValue: TextView
    private lateinit var textTenantIdValue: TextView
    private lateinit var textUserIdValue: TextView
    private lateinit var textStatusValue: TextView

    private lateinit var textIdServer: TextView
    private lateinit var textRelayServer: TextView
    private lateinit var textApiServer: TextView
    private lateinit var textKey: TextView

    private lateinit var buttonValidateCode: Button
    private lateinit var buttonConfirmConfigure: Button
    private lateinit var buttonCancelConfirm: Button
    private lateinit var buttonOpenRustdesk: Button
    private lateinit var buttonOpenRustdeskFromInstructions: Button
    private lateinit var buttonVerifyConfig: Button
    private lateinit var buttonContinueAfterInstall: Button
    private lateinit var buttonCopyIdServer: Button
    private lateinit var buttonCopyRelayServer: Button
    private lateinit var buttonCopyApiServer: Button
    private lateinit var buttonCopyKey: Button
    private lateinit var buttonConfigRustdesk: Button

    private lateinit var editRustDeskId: EditText
    private lateinit var buttonPasteRustDeskId: Button
    private lateinit var buttonSendRustDeskId: Button

    private lateinit var logView: TextView
    private lateinit var logScroll: ScrollView

    private val httpClient: OkHttpClient by lazy {
        OkHttpClient.Builder().build()
    }

    private val rustDeskConfigPreset: String =
        "9JSPzpka2J3UrE1SUVVdldzcyU2U0cUV2xWOyF0VzgXSOZDVMpFcnBzVFhkeVJiOikXZrJCLiIiOikGchJCLiQHcuI2di5yazVGZ0NXdyJiOikXYsVmciwiI0BnLidnYus2clRGdzVnciojI0N3boJye"

    private var currentDownloadId: Long? = null
    private var lastClaimToken: String? = null
    private var downloadPollingJob: Job? = null
    private var isWaitingForInstall = false
    private var currentProvisionId: String? = null

    private enum class Screen {
        ENTER_CODE,
        CONFIRM,
        PROVISIONING,
        COMPLETION,
        CONFIG_INSTRUCTIONS
    }

    private var currentScreen: Screen = Screen.ENTER_CODE

    private val downloadReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action != DownloadManager.ACTION_DOWNLOAD_COMPLETE) {
                return
            }
            val id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L)
            if (id != currentDownloadId) {
                return
            }

            lifecycleScope.launch(Dispatchers.Main) {
                appendLog("Download broadcast received for id=$id")
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        prefs = PreferencesManager(applicationContext)
        currentProvisionId = prefs.getLastProvisionId()

        screenEnterCode = findViewById(R.id.screenEnterCode)
        screenConfirm = findViewById(R.id.screenConfirm)
        screenProvisioning = findViewById(R.id.screenProvisioning)
        screenCompletion = findViewById(R.id.screenCompletion)
        screenConfigInstructions = findViewById(R.id.screenConfigInstructions)

        editInstallationCode = findViewById(R.id.editInstallationCode)
        textCompanyValue = findViewById(R.id.textCompanyValue)
        textAccountValue = findViewById(R.id.textAccountValue)
        textTenantIdValue = findViewById(R.id.textTenantIdValue)
        textUserIdValue = findViewById(R.id.textUserIdValue)
        textStatusValue = findViewById(R.id.textStatusValue)

        textIdServer = findViewById(R.id.textIdServer)
        textRelayServer = findViewById(R.id.textRelayServer)
        textApiServer = findViewById(R.id.textApiServer)
        textKey = findViewById(R.id.textKey)

        buttonValidateCode = findViewById(R.id.buttonValidateCode)
        buttonConfirmConfigure = findViewById(R.id.buttonConfirmConfigure)
        buttonCancelConfirm = findViewById(R.id.buttonCancelConfirm)
        buttonOpenRustdesk = findViewById(R.id.buttonOpenRustdesk)
        buttonOpenRustdeskFromInstructions =
            findViewById(R.id.buttonOpenRustdeskFromInstructions)
        buttonVerifyConfig = findViewById(R.id.buttonVerifyConfig)
        buttonContinueAfterInstall = findViewById(R.id.buttonContinueAfterInstall)
        buttonCopyIdServer = findViewById(R.id.buttonCopyIdServer)
        buttonCopyRelayServer = findViewById(R.id.buttonCopyRelayServer)
        buttonCopyApiServer = findViewById(R.id.buttonCopyApiServer)
        buttonCopyKey = findViewById(R.id.buttonCopyKey)
        buttonConfigRustdesk = findViewById(R.id.buttonConfigRustdesk)

        editRustDeskId = findViewById(R.id.editRustDeskId)
        buttonPasteRustDeskId = findViewById(R.id.buttonPasteRustDeskId)
        buttonSendRustDeskId = findViewById(R.id.buttonSendRustDeskId)

        logView = findViewById(R.id.textLog)
        logScroll = findViewById(R.id.logScroll)

        val savedRustDeskId = prefs.getLastRustDeskId()
        if (savedRustDeskId.isNotBlank()) {
            editRustDeskId.setText(savedRustDeskId)
        }

        textCompanyValue.text = "BWB"
        textAccountValue.text = "support@bwb.pt"

        buttonValidateCode.setOnClickListener {
            onValidateCodeClicked()
        }

        buttonConfirmConfigure.setOnClickListener {
            onConfirmAndConfigure()
        }

        buttonCancelConfirm.setOnClickListener {
            lastClaimToken = null
            showScreen(Screen.ENTER_CODE)
        }

        buttonOpenRustdesk.setOnClickListener {
            showConfigInstructions()
        }

        buttonOpenRustdeskFromInstructions.setOnClickListener {
            openRustdesk()
        }

        buttonVerifyConfig.setOnClickListener {
            onVerifyConfigClicked()
        }

        buttonConfigRustdesk.setOnClickListener {
            onCopyRustDeskConfigClicked()
        }

        buttonContinueAfterInstall.setOnClickListener {
            onContinueAfterInstallClicked()
        }

        buttonCopyIdServer.setOnClickListener {
            copyToClipboard("ID Server", textIdServer.text.toString())
        }

        buttonCopyRelayServer.setOnClickListener {
            copyToClipboard("Relay Server", textRelayServer.text.toString())
        }

        buttonCopyApiServer.setOnClickListener {
            copyToClipboard("API Server", textApiServer.text.toString())
        }

        buttonCopyKey.setOnClickListener {
            copyToClipboard("Key", textKey.text.toString())
        }

        buttonPasteRustDeskId.setOnClickListener {
            onPasteRustDeskIdClicked()
        }

        buttonSendRustDeskId.setOnClickListener {
            onSendRustDeskIdClicked()
        }

        showScreen(Screen.ENTER_CODE)
        appendLog("Ready. Enter installation code to begin.")

        val downloadFilter = IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(downloadReceiver, downloadFilter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("DEPRECATION")
            registerReceiver(downloadReceiver, downloadFilter)
        }

        handleDeepLinkIfPresent(intent)
    }

    private fun appendLog(message: String) {
        val timestamp = SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date())
        val line = "[$timestamp] $message"

        runOnUiThread {
            logView.append(line + "\n")
            logScroll.post {
                logScroll.fullScroll(View.FOCUS_DOWN)
            }
        }
    }

    private fun showScreen(screen: Screen) {
        currentScreen = screen

        screenEnterCode.visibility = View.GONE
        screenConfirm.visibility = View.GONE
        screenProvisioning.visibility = View.GONE
        screenCompletion.visibility = View.GONE
        screenConfigInstructions.visibility = View.GONE

        when (screen) {
            Screen.ENTER_CODE -> screenEnterCode.visibility = View.VISIBLE
            Screen.CONFIRM -> screenConfirm.visibility = View.VISIBLE
            Screen.PROVISIONING -> screenProvisioning.visibility = View.VISIBLE
            Screen.COMPLETION -> screenCompletion.visibility = View.VISIBLE
            Screen.CONFIG_INSTRUCTIONS -> screenConfigInstructions.visibility = View.VISIBLE
        }
    }

    private fun onValidateCodeClicked() {
        val code = editInstallationCode.text?.toString()?.trim().orEmpty()
        if (code.isBlank()) {
            appendLog("❌ Installation code is empty.")
            toast("Introduz o código de instalação.")
            return
        }

        appendLog("Validating installation code...")
        textStatusValue.text = "A validar código..."

        val baseUrl = prefs.getBaseUrl()
        val api = ApiClient.createProvisionApi(baseUrl)
        val request = ClaimRequest(code = code)

        lifecycleScope.launch {
            try {
                val response = withContext(Dispatchers.IO) {
                    api.claim(request)
                }

                withContext(Dispatchers.Main) {
                    appendLog("Claim HTTP status: ${response.code()}")
                }

                if (!response.isSuccessful) {
                    val errorBody = withContext(Dispatchers.IO) {
                        response.errorBody()?.string()
                    }
                    withContext(Dispatchers.Main) {
                        appendLog("Claim failed. Raw error body: ${errorBody ?: "empty"}")
                        parseAndLogError(errorBody)
                        textStatusValue.text = "Código inválido."
                        toast("Código inválido ou expirado.")
                    }
                    return@launch
                }

                val body = response.body()
                if (body == null) {
                    withContext(Dispatchers.Main) {
                        appendLog("Claim succeeded but response body is null.")
                        textStatusValue.text = "Erro na resposta do servidor."
                        toast("Resposta vazia do servidor.")
                    }
                    return@launch
                }

                lastClaimToken = body.token
                prefs.setTenantId(body.tenantId)
                prefs.setUserId(body.userId)
                body.accountEmail?.let { prefs.setAccountEmail(it) }
                body.displayName?.let { prefs.setDisplayName(it) }

                withContext(Dispatchers.Main) {
                    textTenantIdValue.text = body.tenantId
                    textUserIdValue.text = body.userId
                    textCompanyValue.text = "BWB"
                    textAccountValue.text = body.accountEmail ?: prefs.getAccountEmail()
                    textStatusValue.text = "Código validado."

                    appendLog("✓ Claim succeeded for user_id=${body.userId}, tenant_id=${body.tenantId}")
                    showScreen(Screen.CONFIRM)
                }
            } catch (t: Throwable) {
                withContext(Dispatchers.Main) {
                    appendLog("Claim request failed: ${t.message}")
                    textStatusValue.text = "Erro na validação."
                    toast("Erro ao validar código.")
                }
            }
        }
    }

    private fun onConfirmAndConfigure() {
        if (lastClaimToken.isNullOrBlank()) {
            appendLog("❌ Cannot start provisioning: no claim token. Validate code first.")
            toast("Valida primeiro o código de instalação.")
            return
        }

        appendLog("User confirmed provisioning. Starting provisioning flow.")
        textStatusValue.text = "A iniciar provisioning..."

        showScreen(Screen.PROVISIONING)

        lifecycleScope.launch {
            runProvisioningFlow()
        }
    }

    private fun onContinueAfterInstallClicked() {
        appendLog("User confirmed RustDesk installation. Proceeding to configuration instructions.")
        isWaitingForInstall = false
        buttonContinueAfterInstall.visibility = View.GONE
        showConfigInstructions()
    }

    private fun handleDeepLinkIfPresent(intent: Intent?) {
        val data = intent?.data ?: return

        val code = DeepLinkParser.parseClaimCode(data) ?: return

        appendLog("Deep link detected with claim code: $code")
        editInstallationCode.setText(code)

        onValidateCodeClicked()
    }

    private suspend fun runProvisioningFlow() {
        withContext(Dispatchers.Main) {
            appendLog("Starting provisioning flow.")
        }

        val baseUrl = prefs.getBaseUrl()
        val tenantId = prefs.getTenantId()
        val userId = prefs.getUserId()
        val deviceName = prefs.getDeviceName()

        withContext(Dispatchers.Main) {
            appendLog("Using tenant_id=$tenantId, user_id=$userId")
        }

        val abiString = determineAbi()
        if (abiString == null) {
            withContext(Dispatchers.Main) {
                appendLog("ERROR: Could not determine device ABI")
            }
            return
        }

        withContext(Dispatchers.Main) {
            appendLog("Detected ABI: $abiString")
        }

        val fingerprint = prefs.getOrCreateDeviceFingerprint()
        withContext(Dispatchers.Main) {
            appendLog("Using device fingerprint: $fingerprint")
        }

        val abiEnum = when (abiString) {
            "arm64-v8a" -> Abi.ARM64_V8A
            "armeabi-v7a" -> Abi.ARMEABI_V7A
            "x86_64" -> Abi.X86_64
            else -> {
                withContext(Dispatchers.Main) {
                    appendLog("Unsupported ABI mapping: $abiString")
                }
                return
            }
        }

        val provisionApi = ApiClient.createProvisionApi(baseUrl)

        val request = ProvisionStartRequest(
            tenantId = tenantId,
            userId = userId,
            abi = abiEnum,
            deviceFingerprint = fingerprint,
            deviceName = if (deviceName.isBlank()) null else deviceName,
            model = Build.MODEL,
            osVersion = Build.VERSION.RELEASE
        )

        withContext(Dispatchers.Main) {
            appendLog("Calling /api/provision/start ...")
        }

        try {
            val response = withContext(Dispatchers.IO) {
                provisionApi.start(request)
            }

            withContext(Dispatchers.Main) {
                appendLog("Start HTTP status: ${response.code()}")
            }

            if (!response.isSuccessful) {
                val errorBody = withContext(Dispatchers.IO) {
                    response.errorBody()?.string()
                }
                withContext(Dispatchers.Main) {
                    appendLog("Start failed. Raw error body: ${errorBody ?: "empty"}")
                    parseAndLogError(errorBody)
                    Toast.makeText(
                        this@MainActivity,
                        "O provisionamento falhou.",
                        Toast.LENGTH_SHORT
                    ).show()
                }
                return
            }

            val body = response.body()
            if (body == null) {
                withContext(Dispatchers.Main) {
                    appendLog("Start succeeded but response body is null.")
                    Toast.makeText(
                        this@MainActivity,
                        "A resposta do provisionamento veio vazia.",
                        Toast.LENGTH_SHORT
                    ).show()
                }
                return
            }

            currentProvisionId = body.provisionId
            prefs.setLastProvisionId(body.provisionId)

            withContext(Dispatchers.Main) {
                appendLog("✓ Start succeeded. provision_id=${body.provisionId}")
                appendLog("  config_url=${body.configUrl}")
                appendLog("  apk_url=${body.apkUrl}")
                appendLog("")
                appendLog("=== PHASE 3: Download & Install ===")
            }

            val configSaved = downloadAndSaveConfig(body.configUrl)
            if (configSaved) {
                withContext(Dispatchers.Main) {
                    appendLog("✓ Config bundle saved to Downloads")
                }
            } else {
                withContext(Dispatchers.Main) {
                    appendLog("⚠ Failed to download config (continuing anyway)")
                }
            }

            withContext(Dispatchers.Main) {
                startRobustApkDownload(body.apkUrl, abiString)
                isWaitingForInstall = true
                buttonContinueAfterInstall.visibility = View.VISIBLE
                appendLog(
                    "RustDesk APK download started. " +
                        "After installing RustDesk, tap the button below to continue with configuration."
                )
            }
        } catch (t: Throwable) {
            withContext(Dispatchers.Main) {
                appendLog("Provisioning request failed: ${t.message}")
                Toast.makeText(
                    this@MainActivity,
                    "Erro no provisionamento: ${t.message}",
                    Toast.LENGTH_SHORT
                ).show()
            }
        }
    }

    private fun copyToClipboard(label: String, value: String) {
        if (value.isBlank()) {
            Toast.makeText(this, "${label} está vazio.", Toast.LENGTH_SHORT).show()
            return
        }

        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newPlainText(label, value))

        appendLog("✓ Copiado para a área de transferência: $label")
        Toast.makeText(this, "${label} copiado para a área de transferência.", Toast.LENGTH_SHORT).show()
    }

    private fun normalizeRustDeskId(raw: String): String {
        return raw.replace(Regex("[^0-9]"), "")
    }

    private fun pasteRustDeskIdFromClipboard(): String? {
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val clip = clipboard.primaryClip ?: return null
        if (clip.itemCount == 0) return null

        val raw = clip.getItemAt(0).coerceToText(this)?.toString()?.trim().orEmpty()
        if (raw.isBlank()) return null

        val normalized = normalizeRustDeskId(raw)
        if (normalized.length !in 6..12) {
            appendLog("Clipboard text does not contain a valid RustDesk ID. raw='$raw', normalized='$normalized'")
            return null
        }

        appendLog("Clipboard read, candidate RustDesk ID: $normalized (raw='$raw')")
        return normalized
    }

    private fun onPasteRustDeskIdClicked() {
        val id = pasteRustDeskIdFromClipboard()
        if (id == null) {
            appendLog("❌ Clipboard does not contain a valid RustDesk ID.")
            toast("Clipboard sem RustDesk ID válido.")
            return
        }
        editRustDeskId.setText(id)
        appendLog("✓ RustDesk ID pasted: $id")
        toast("RustDesk ID colado.")
    }

    private fun onSendRustDeskIdClicked() {
        val raw = editRustDeskId.text?.toString()?.trim().orEmpty()
        val normalized = normalizeRustDeskId(raw)
        if (normalized.length !in 6..12) {
            appendLog("❌ Invalid RustDesk ID: raw='$raw', normalized='$normalized'")
            toast("RustDesk ID inválido.")
            return
        }

        prefs.setLastRustDeskId(normalized)
        editRustDeskId.setText(normalized)

        appendLog("✓ RustDesk ID normalized and saved locally: $normalized")
        toast("RustDesk ID guardado. Para concluir, usa o botão VERIFICAR.")
    }

    private fun onVerifyConfigClicked() {
        appendLog("User confirming config application...")

        val rawId = editRustDeskId.text?.toString()?.trim().orEmpty()
        val normalizedId = normalizeRustDeskId(rawId)
        if (normalizedId.length !in 6..12) {
            appendLog("❌ Cannot verify: invalid RustDesk ID. raw='$rawId', normalized='$normalizedId'")
            toast("RustDesk ID inválido. Verifica o valor.")
            return
        }

        val provisionId = currentProvisionId ?: prefs.getLastProvisionId()
        if (provisionId.isNullOrBlank()) {
            appendLog("❌ Cannot verify: missing provision_id. Restart provisioning.")
            toast("Falta provision_id. Repetir provisioning.")
            return
        }

        prefs.setLastRustDeskId(normalizedId)
        editRustDeskId.setText(normalizedId)

        AlertDialog.Builder(this)
            .setTitle("Verificar configuração")
            .setMessage(
                "Verifica no RustDesk:\n\n" +
                    "1. Abre o RustDesk\n" +
                    "2. Vai a Definições → Rede\n" +
                    "3. Confirma que ID, Relay, Servidor API e Chave estão preenchidos\n\n" +
                    "Está tudo correctamente configurado?"
            )
            .setPositiveButton("Sim, tudo configurado") { _, _ ->
                appendLog("✓ User confirmed configuration applied. Sending RustDesk ID to server...")
                lifecycleScope.launch {
                    sendRustDeskIdToServer(
                        provisionId = provisionId,
                        rustDeskId = normalizedId
                    )
                }
            }
            .setNegativeButton("Não, preciso de ajuda") { _, _ ->
                appendLog("User needs help with config")
                AlertDialog.Builder(this@MainActivity)
                    .setTitle("Ajuda de configuração")
                    .setMessage(
                        "Se a configuração não foi aplicada:\n\n" +
                            "1. Usa os botões Copiar acima para cada campo\n" +
                            "2. No RustDesk: Definições → Rede\n" +
                            "3. Toca em 'Desbloquear' se estiver bloqueado\n" +
                            "4. Cola manualmente cada campo:\n" +
                            "   - Servidor de ID\n" +
                            "   - Servidor de Relay\n" +
                            "   - Servidor API\n" +
                            "   - Chave\n" +
                            "5. Toca em 'Aplicar'\n\n" +
                            "Usa os botões Copiar acima para copiar cada campo."
                    )
                    .setPositiveButton("OK", null)
                    .show()
            }
            .setNeutralButton("Cancelar", null)
            .show()
    }

    private fun openRustdesk() {
        appendLog("")
        appendLog("=== Opening RustDesk ===")

        val launchIntent = packageManager.getLaunchIntentForPackage("com.carriez.flutter_hbb")
        if (launchIntent == null) {
            appendLog("ERROR: RustDesk is not installed")

            AlertDialog.Builder(this)
                .setTitle("RustDesk não está instalado")
                .setMessage(
                    "É necessário instalar primeiro o RustDesk.\n\n" +
                        "Instala o APK transferido e volta aqui para continuar a configuração."
                )
                .setPositiveButton("OK", null)
                .show()
            return
        }

        try {
            startActivity(launchIntent)
            appendLog("✓ RustDesk launched")
            appendLog("Follow the on-screen instructions to configure.")
        } catch (e: ActivityNotFoundException) {
            appendLog("ERROR: Failed to launch RustDesk: ${e.message}")
            Toast.makeText(this, "Não foi possível iniciar o RustDesk.", Toast.LENGTH_SHORT).show()
        }
    }

    private fun parseAndLogError(raw: String?) {
        if (raw.isNullOrBlank()) {
            return
        }
        try {
            val moshi = ApiClient.moshiInstance()
            val adapter = moshi.adapter(ErrorResponse::class.java)
            val parsed = adapter.fromJson(raw)
            if (parsed != null) {
                appendLog("API error: ${parsed.error} - ${parsed.message}")
            }
        } catch (_: Throwable) {
        }
    }

    private suspend fun sendRustDeskIdToServer(
        provisionId: String,
        rustDeskId: String
    ) {
        withContext(Dispatchers.Main) {
            appendLog(
                "Sending RustDesk ID to server: " +
                    "provision_id=$provisionId, rustdesk_id=$rustDeskId"
            )
        }

        val baseUrl = prefs.getBaseUrl()
        val deviceFingerprint = prefs.getOrCreateDeviceFingerprint()
        val api = ApiClient.createProvisionApi(baseUrl)

        val request = SendRustDeskIdRequest(
            provisionId = provisionId,
            deviceFingerprint = deviceFingerprint,
            rustDeskId = rustDeskId
        )

        try {
            val response = withContext(Dispatchers.IO) {
                api.sendRustDeskId(request)
            }

            withContext(Dispatchers.Main) {
                appendLog("RustDesk ID send HTTP status: ${response.code()}")
            }

            if (!response.isSuccessful) {
                val errorBody = withContext(Dispatchers.IO) {
                    response.errorBody()?.string()
                }
                withContext(Dispatchers.Main) {
                    appendLog(
                        "Send RustDesk ID failed. Raw error body: " +
                            (errorBody ?: "empty")
                    )
                    parseAndLogError(errorBody)
                    Toast.makeText(
                        this@MainActivity,
                        "Falha ao enviar RustDesk ID. Tenta novamente.",
                        Toast.LENGTH_SHORT
                    ).show()
                }
                return
            }

            withContext(Dispatchers.Main) {
                appendLog("✓ RustDesk ID sent successfully. Device is now adoptable.")
                toast("Configuração concluída. O dispositivo pode agora ser adotado no painel.")
                showScreen(Screen.COMPLETION)
            }
        } catch (t: Throwable) {
            withContext(Dispatchers.Main) {
                appendLog("Error sending RustDesk ID: ${t.message}")
                Toast.makeText(
                    this@MainActivity,
                    "Erro ao enviar RustDesk ID.",
                    Toast.LENGTH_SHORT
                ).show()
            }
        }
    }

    private fun toast(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
    }

    private fun onCopyRustDeskConfigClicked() {
        copyToClipboard("RustDesk Config", rustDeskConfigPreset)
        toast("Configuração RustDesk copiada para o clipboard.")
    }

    private fun showConfigInstructions() {
        appendLog("Showing RustDesk configuration instructions screen.")
        showScreen(Screen.CONFIG_INSTRUCTIONS)
        loadRustDeskConfigIfAvailable()
    }

    private fun loadRustDeskConfigIfAvailable() {
        lifecycleScope.launch(Dispatchers.IO) {
            val config = ConfigManager.parseConfigBundle()
            withContext(Dispatchers.Main) {
                if (config == null) {
                    appendLog("No RustDesk config bundle found in Downloads directory.")
                    return@withContext
                }
                config.idServer?.let { textIdServer.text = it }
                config.relayServer?.let { textRelayServer.text = it }
                config.apiServer?.let { textApiServer.text = it }
                config.key?.let { textKey.text = it }
                appendLog(
                    "RustDesk config loaded from bundle:\n" +
                        ConfigManager.getRedactedImportText(config)
                )
            }
        }
    }

    private fun determineAbi(): String? {
        val supportedAbis = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            Build.SUPPORTED_ABIS?.toList()
        } else {
            @Suppress("DEPRECATION")
            listOfNotNull(Build.CPU_ABI, Build.CPU_ABI2)
        } ?: emptyList()

        if (supportedAbis.isEmpty()) {
            appendLog("Unable to determine ABI: SUPPORTED_ABIS is empty")
            return null
        }

        val selected = when {
            supportedAbis.contains("arm64-v8a") -> "arm64-v8a"
            supportedAbis.contains("armeabi-v7a") -> "armeabi-v7a"
            supportedAbis.contains("x86_64") -> "x86_64"
            else -> null
        }

        if (selected == null) {
            appendLog("Unsupported ABI set: $supportedAbis")
        } else {
            appendLog("Resolved ABI from SUPPORTED_ABIS=$supportedAbis → $selected")
        }

        return selected
    }

    private suspend fun downloadAndSaveConfig(configUrl: String): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                appendLog("Downloading config bundle from $configUrl")

                val request = Request.Builder()
                    .url(configUrl)
                    .get()
                    .build()

                httpClient.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) {
                        appendLog("Failed to download config bundle: HTTP ${response.code}")
                        return@withContext false
                    }

                    val body = response.body
                    if (body == null) {
                        appendLog("Config bundle download returned empty body")
                        return@withContext false
                    }

                    val bytes = body.bytes()
                    val downloadsDir = Environment.getExternalStoragePublicDirectory(
                        Environment.DIRECTORY_DOWNLOADS
                    )

                    if (!downloadsDir.exists() && !downloadsDir.mkdirs()) {
                        appendLog("Failed to create Downloads directory at ${downloadsDir.absolutePath}")
                        return@withContext false
                    }

                    val fileName = ConfigManager.CONFIG_FILE_NAME
                    val outFile = File(downloadsDir, fileName)

                    FileOutputStream(outFile).use { fos ->
                        fos.write(bytes)
                    }

                    appendLog("✓ Config bundle saved to ${outFile.absolutePath}")
                    true
                }
            } catch (t: Throwable) {
                appendLog("Error downloading config bundle: ${t.message}")
                false
            }
        }
    }

    private fun startRobustApkDownload(apkUrl: String, abiString: String) {
        appendLog("Starting RustDesk APK download for abi=$abiString from $apkUrl")

        try {
            val uri = Uri.parse(apkUrl)
            val intent = Intent(Intent.ACTION_VIEW, uri).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            startActivity(intent)
            appendLog("Opened browser / download manager for RustDesk APK")
        } catch (t: Throwable) {
            appendLog("Failed to start RustDesk APK download: ${t.message}")
            Toast.makeText(
                this,
                "Não foi possível abrir o link de download do RustDesk.",
                Toast.LENGTH_SHORT
            ).show()
        }
    }

    private class PreferencesManager(private val context: Context) {

        private val prefs: SharedPreferences

        init {
            prefs = context.getSharedPreferences("bwb_provisioner_prefs", Context.MODE_PRIVATE)
        }

        fun getBaseUrl(): String {
            return prefs.getString(KEY_BASE_URL, "https://rustdesk.bwb.pt")
                ?: "https://rustdesk.bwb.pt"
        }

        fun getTenantId(): String {
            return prefs.getString(KEY_TENANT_ID, "default") ?: "default"
        }

        fun setTenantId(tenantId: String) {
            prefs.edit().putString(KEY_TENANT_ID, tenantId).apply()
        }

        fun getUserId(): String {
            return prefs.getString(KEY_USER_ID, "") ?: ""
        }

        fun setUserId(userId: String) {
            prefs.edit().putString(KEY_USER_ID, userId).apply()
        }

        fun getDeviceName(): String {
            return prefs.getString(KEY_DEVICE_NAME, "") ?: ""
        }

        fun getOrCreateDeviceFingerprint(): String {
            val existing = prefs.getString(KEY_FINGERPRINT, null)
            if (!existing.isNullOrBlank()) {
                return existing
            }
            val androidId = Settings.Secure.getString(
                context.contentResolver,
                Settings.Secure.ANDROID_ID
            )
            val fingerprint = if (!androidId.isNullOrBlank()) {
                androidId
            } else {
                UUID.randomUUID().toString()
            }
            prefs.edit().putString(KEY_FINGERPRINT, fingerprint).apply()
            return fingerprint
        }

        fun getAccountEmail(): String {
            return prefs.getString(KEY_ACCOUNT_EMAIL, "support@bwb.pt") ?: "support@bwb.pt"
        }

        fun setAccountEmail(email: String) {
            prefs.edit().putString(KEY_ACCOUNT_EMAIL, email).apply()
        }

        fun getDisplayName(): String {
            return prefs.getString(KEY_DISPLAY_NAME, "") ?: ""
        }

        fun setDisplayName(name: String) {
            prefs.edit().putString(KEY_DISPLAY_NAME, name).apply()
        }

        fun getLastProvisionId(): String? {
            return prefs.getString(KEY_LAST_PROVISION_ID, null)
        }

        fun setLastProvisionId(provisionId: String) {
            prefs.edit().putString(KEY_LAST_PROVISION_ID, provisionId).apply()
        }

        fun getLastRustDeskId(): String {
            return prefs.getString(KEY_LAST_RUSTDESK_ID, "") ?: ""
        }

        fun setLastRustDeskId(rustDeskId: String) {
            prefs.edit().putString(KEY_LAST_RUSTDESK_ID, rustDeskId).apply()
        }

        companion object {
            private const val KEY_BASE_URL = "base_url"
            private const val KEY_TENANT_ID = "tenant_id"
            private const val KEY_USER_ID = "user_id"
            private const val KEY_DEVICE_NAME = "device_name"
            private const val KEY_FINGERPRINT = "device_fingerprint"
            private const val KEY_ACCOUNT_EMAIL = "account_email"
            private const val KEY_DISPLAY_NAME = "display_name"
            private const val KEY_LAST_PROVISION_ID = "last_provision_id"
            private const val KEY_LAST_RUSTDESK_ID = "last_rustdesk_id"
        }
    }
}