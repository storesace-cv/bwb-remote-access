package pt.bwb.provisioner.app

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Environment
import org.json.JSONObject
import java.io.File

object ConfigManager {

    data class RustDeskConfig(
        val idServer: String?,
        val relayServer: String?,
        val apiServer: String?,
        val key: String?
    )

    const val CONFIG_FILE_NAME = "bwb-rustdesk-config.json"

    fun parseConfigBundle(): RustDeskConfig? {
        val downloadsDir =
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
        val primaryFile = File(downloadsDir, CONFIG_FILE_NAME)

        val configFile: File? = if (primaryFile.exists()) {
            primaryFile
        } else {
            val candidates = downloadsDir.listFiles { file ->
                file.isFile &&
                    file.name.startsWith("rustdesk_config_") &&
                    file.name.endsWith(".json")
            }
            candidates?.maxByOrNull { it.lastModified() }
        }

        if (configFile == null || !configFile.exists()) {
            return null
        }

        return try {
            val content = configFile.readText()
            val json = JSONObject(content)

            val flatId = json.optString("id").takeIf { it.isNotBlank() }
            val flatRelay = json.optString("relay").takeIf { it.isNotBlank() }
            val flatApi = json.optString("api_server").takeIf { it.isNotBlank() }
            val flatKey = json.optString("key").takeIf { it.isNotBlank() }

            var id = flatId
            var relay = flatRelay
            var api = flatApi
            var key = flatKey

            if (id == null && relay == null && api == null && key == null) {
                val bundle = json.optJSONObject("bundle")
                val rustdesk = bundle?.optJSONObject("rustdesk")

                if (rustdesk != null) {
                    val host = rustdesk.optString("host").takeIf { it.isNotBlank() }
                    val nestedRelay = rustdesk.optString("relay").takeIf { it.isNotBlank() }
                    val nestedApi = rustdesk.optString("api_server").takeIf { it.isNotBlank() }
                    val nestedKey = rustdesk.optString("key").takeIf { it.isNotBlank() }

                    if (host != null) {
                        id = host
                    }
                    if (nestedRelay != null) {
                        relay = nestedRelay
                    }
                    if (nestedApi != null) {
                        api = nestedApi
                    }
                    if (nestedKey != null) {
                        key = nestedKey
                    }
                }
            }

            if (id == null && relay == null && api == null && key == null) {
                null
            } else {
                RustDeskConfig(
                    idServer = id,
                    relayServer = relay,
                    apiServer = api,
                    key = key
                )
            }
        } catch (e: Exception) {
            null
        }
    }

    fun copyCompleteConfigToClipboard(context: Context): Boolean {
        val config = parseConfigBundle() ?: return false

        val importText = buildString {
            config.idServer?.let { append("id=$it\n") }
            config.relayServer?.let { append("relay=$it\n") }
            config.apiServer?.let { append("api_server=$it\n") }
            config.key?.let { append("key=$it\n") }
        }.trim()

        if (importText.isEmpty()) {
            return false
        }

        return try {
            val clipboard =
                context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            val clip = ClipData.newPlainText("RustDesk Config", importText)
            clipboard.setPrimaryClip(clip)
            true
        } catch (e: Exception) {
            false
        }
    }

    fun getRedactedImportText(config: RustDeskConfig): String {
        val lines = mutableListOf<String>()

        config.idServer?.let {
            lines.add("id=$it")
        }
        config.relayServer?.let {
            lines.add("relay=$it")
        }
        config.apiServer?.let {
            lines.add("api_server=$it")
        }
        config.key?.let {
            lines.add("key=***REDACTED***")
        }

        return if (lines.isEmpty()) "No config values" else lines.joinToString("\n")
    }
}