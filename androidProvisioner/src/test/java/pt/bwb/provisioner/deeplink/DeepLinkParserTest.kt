package pt.bwb.provisioner.deeplink

import android.net.Uri
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class DeepLinkParserTest {

    @Test
    fun parseClaimCode_validDeepLink_returnsCode() {
        val uri = Uri.parse("bwbprov://claim?code=1234")
        val result = DeepLinkParser.parseClaimCode(uri)
        assertEquals("1234", result)
    }

    @Test
    fun parseClaimCode_nonProvisionerUrl_returnsNull() {
        val uri = Uri.parse("https://example.com")
        val result = DeepLinkParser.parseClaimCode(uri)
        assertNull(result)
    }
}