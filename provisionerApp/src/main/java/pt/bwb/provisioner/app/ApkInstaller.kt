package pt.bwb.provisioner.app

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import androidx.core.content.FileProvider
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream

/**
 * Utility object for safe APK installation using FileProvider.
 * Handles the copy from DownloadManager's public directory to app's private external files directory.
 */
object ApkInstaller {

    /**
     * Install an APK downloaded by DownloadManager.
     * 
     * @param context Application context
     * @param downloadedApkPath Path to APK in public Downloads (e.g., /storage/emulated/0/Download/rustdesk-arm64-v8a.apk)
     * @param onLog Callback for logging messages
     * @param onError Callback for error handling
     */
    fun installDownloadedApk(
        context: Context,
        downloadedApkPath: String,
        onLog: (String) -> Unit,
        onError: (String) -> Unit
    ) {
        onLog("=== Installing APK via FileProvider ===")
        onLog("Source: $downloadedApkPath")

        val sourceFile = File(downloadedApkPath)
        if (!sourceFile.exists()) {
            onError("Source APK not found: $downloadedApkPath")
            return
        }

        onLog("✓ Source file exists (${sourceFile.length()} bytes)")

        // Copy to app's external files directory
        val destDir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
        if (destDir == null) {
            onError("Failed to get external files directory")
            return
        }

        if (!destDir.exists() && !destDir.mkdirs()) {
            onError("Failed to create destination directory")
            return
        }

        val destFile = File(destDir, sourceFile.name)
        onLog("Copying to: ${destFile.absolutePath}")

        try {
            copyFile(sourceFile, destFile)
            onLog("✓ APK copied successfully (${destFile.length()} bytes)")
        } catch (e: Exception) {
            onError("Failed to copy APK: ${e.message}")
            return
        }

        // Get FileProvider URI
        val authority = "${context.packageName}.fileprovider"
        val contentUri: Uri
        try {
            contentUri = FileProvider.getUriForFile(context, authority, destFile)
            onLog("✓ FileProvider URI created: $contentUri")
        } catch (e: Exception) {
            onError("Failed to create FileProvider URI: ${e.message}")
            return
        }

        // Launch system installer
        launchInstaller(context, contentUri, onLog, onError)
    }

    /**
     * Install an APK from app's private directory (direct HTTP download case).
     * 
     * @param context Application context
     * @param apkFile File object pointing to APK in app's private directory
     * @param onLog Callback for logging messages
     * @param onError Callback for error handling
     */
    fun installPrivateApk(
        context: Context,
        apkFile: File,
        onLog: (String) -> Unit,
        onError: (String) -> Unit
    ) {
        onLog("=== Installing APK via FileProvider ===")
        onLog("Source: ${apkFile.absolutePath}")

        if (!apkFile.exists()) {
            onError("APK file not found: ${apkFile.absolutePath}")
            return
        }

        onLog("✓ File exists (${apkFile.length()} bytes)")

        // Get FileProvider URI
        val authority = "${context.packageName}.fileprovider"
        val contentUri: Uri
        try {
            contentUri = FileProvider.getUriForFile(context, authority, apkFile)
            onLog("✓ FileProvider URI created: $contentUri")
        } catch (e: Exception) {
            onError("Failed to create FileProvider URI: ${e.message}")
            return
        }

        // Launch system installer
        launchInstaller(context, contentUri, onLog, onError)
    }

    private fun launchInstaller(
        context: Context,
        contentUri: Uri,
        onLog: (String) -> Unit,
        onError: (String) -> Unit
    ) {
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(contentUri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }

        try {
            context.startActivity(intent)
            onLog("✓ System installer launched successfully")
            onLog("")
            onLog("=== User Action Required ===")
            onLog("Please complete the installation in the system installer.")
            onLog("After installation, return to this app and tap 'Open RustDesk'.")
        } catch (e: ActivityNotFoundException) {
            onLog("ERROR: Could not launch system installer")

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (!context.packageManager.canRequestPackageInstalls()) {
                    onLog("Opening settings to enable 'Install unknown apps'...")
                    try {
                        val settingsIntent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                            data = Uri.parse("package:${context.packageName}")
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        }
                        context.startActivity(settingsIntent)
                    } catch (t: Throwable) {
                        onError("Failed to open settings: ${t.message}")
                    }
                } else {
                    onError("Installation blocked. Please check system settings.")
                }
            } else {
                onError("Installation failed: ${e.message}")
            }
        } catch (e: Exception) {
            onError("Installation error: ${e.message}")
        }
    }

    private fun copyFile(source: File, dest: File) {
        FileInputStream(source).use { input ->
            FileOutputStream(dest).use { output ->
                val buffer = ByteArray(8192)
                var bytesRead: Int
                while (input.read(buffer).also { bytesRead = it } != -1) {
                    output.write(buffer, 0, bytesRead)
                }
            }
        }
    }
}