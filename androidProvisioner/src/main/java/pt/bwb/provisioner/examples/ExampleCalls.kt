package pt.bwb.provisioner.examples

import com.squareup.moshi.JsonAdapter
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import pt.bwb.provisioner.api.ApiClient
import pt.bwb.provisioner.api.models.Abi
import pt.bwb.provisioner.api.models.ClaimRequest
import pt.bwb.provisioner.api.models.ErrorResponse
import pt.bwb.provisioner.api.models.ProvisionStartRequest
import retrofit2.Response

private val exampleMoshi: Moshi = ApiClient.moshiInstance().newBuilder()
    .add(KotlinJsonAdapterFactory())
    .build()

private val errorAdapter: JsonAdapter<ErrorResponse> =
    exampleMoshi.adapter(ErrorResponse::class.java)

suspend fun exampleClaim(code: String) {
    val api = ApiClient.provisionApi
    val request = ClaimRequest(
        code = code,
        deviceHint = null,
        nonce = null
    )

    val response = api.claim(request)
    handleResponse(
        response = response,
        onSuccess = { body ->
            if (body != null) {
                println(
                    "Claim succeeded: token=" +
                        body.token +
                        " expires_in=" +
                        body.expiresIn +
                        " seconds"
                )
            } else {
                println("Claim succeeded with empty body.")
            }
        },
        operationName = "claim"
    )
}

suspend fun exampleStart(
    userId: String,
    tenantId: String,
    abi: String,
    fingerprint: String
) {
    val api = ApiClient.provisionApi

    val abiEnum = when (abi) {
        "arm64-v8a" -> Abi.ARM64_V8A
        "armeabi-v7a" -> Abi.ARMEABI_V7A
        "x86_64" -> Abi.X86_64
        else -> throw IllegalArgumentException("Unsupported abi value: " + abi)
    }

    val request = ProvisionStartRequest(
        tenantId = tenantId,
        userId = userId,
        abi = abiEnum,
        deviceFingerprint = fingerprint,
        deviceName = null,
        model = null,
        osVersion = null
    )

    val response = api.start(request)
    handleResponse(
        response = response,
        onSuccess = { body ->
            if (body != null) {
                println("Start succeeded: provision_id=" + body.provisionId)
                println("  config_url=" + body.configUrl)
                println("  apk_url=" + body.apkUrl)
            } else {
                println("Start succeeded with empty body.")
            }
        },
        operationName = "start"
    )
}

private fun <T> handleResponse(
    response: Response<T>,
    onSuccess: (T?) -> Unit,
    operationName: String
) {
    if (response.isSuccessful) {
        onSuccess(response.body())
        return
    }

    val code = response.code()
    val rawError = try {
        response.errorBody()?.string()
    } catch (t: Throwable) {
        null
    }

    if (rawError.isNullOrBlank()) {
        println("Request " + operationName + " failed with HTTP " + code + " and empty error body.")
        return
    }

    val parsedError = try {
        errorAdapter.fromJson(rawError)
    } catch (t: Throwable) {
        null
    }

    if (parsedError != null) {
        println(
            "Request " + operationName +
                " failed: [" +
                parsedError.error +
                "] " +
                parsedError.message
        )
    } else {
        println(
            "Request " + operationName +
                " failed with HTTP " +
                code +
                " and unparsed body: " +
                rawError
        )
    }
}