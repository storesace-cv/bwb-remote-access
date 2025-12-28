package pt.bwb.provisioner.deeplink

import android.net.Uri

object DeepLinkParser {

    fun parseClaimCode(uri: Uri): String? {
        val scheme = uri.scheme
        val host = uri.host

        if (scheme == null || scheme.lowercase() != "bwbprov") {
            return null
        }

        if (host == null || host.lowercase() != "claim") {
            return null
        }

        val code = uri.getQueryParameter("code") ?: return null
        if (code.isBlank()) {
            return null
        }

        return code
    }
}