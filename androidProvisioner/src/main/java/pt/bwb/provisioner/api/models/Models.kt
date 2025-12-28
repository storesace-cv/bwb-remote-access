package pt.bwb.provisioner.api.models

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class ClaimRequest(
    @Json(name = "code")
    val code: String,
    @Json(name = "device_hint")
    val deviceHint: String? = null,
    @Json(name = "nonce")
    val nonce: String? = null
)

@JsonClass(generateAdapter = true)
data class ClaimResponse(
    @Json(name = "token")
    val token: String,
    @Json(name = "expires_in")
    val expiresIn: Int,
    @Json(name = "user_id")
    val userId: String,
    @Json(name = "tenant_id")
    val tenantId: String,
    @Json(name = "account_email")
    val accountEmail: String? = null,
    @Json(name = "display_name")
    val displayName: String? = null
)

@JsonClass(generateAdapter = true)
data class ProvisionStartRequest(
    @Json(name = "tenant_id")
    val tenantId: String,
    @Json(name = "user_id")
    val userId: String,
    @Json(name = "abi")
    val abi: Abi,
    @Json(name = "device_fingerprint")
    val deviceFingerprint: String,
    @Json(name = "device_name")
    val deviceName: String? = null,
    @Json(name = "model")
    val model: String? = null,
    @Json(name = "os_version")
    val osVersion: String? = null
)

@JsonClass(generateAdapter = true)
data class ProvisionStartResponse(
    @Json(name = "provision_id")
    val provisionId: String,
    @Json(name = "config_url")
    val configUrl: String,
    @Json(name = "apk_url")
    val apkUrl: String
)

@JsonClass(generateAdapter = true)
data class ErrorResponse(
    @Json(name = "error")
    val error: String,
    @Json(name = "message")
    val message: String,
    @Json(name = "db_error_code")
    val dbErrorCode: String? = null,
    @Json(name = "db_error_message")
    val dbErrorMessage: String? = null,
    @Json(name = "note")
    val note: String? = null
)

@JsonClass(generateAdapter = true)
data class SendRustDeskIdRequest(
    @Json(name = "provision_id")
    val provisionId: String,
    @Json(name = "device_fingerprint")
    val deviceFingerprint: String,
    @Json(name = "rustdesk_id")
    val rustDeskId: String
)

enum class Abi(val value: String) {
    @Json(name = "arm64-v8a")
    ARM64_V8A("arm64-v8a"),

    @Json(name = "armeabi-v7a")
    ARMEABI_V7A("armeabi-v7a"),

    @Json(name = "x86_64")
    X86_64("x86_64")
}