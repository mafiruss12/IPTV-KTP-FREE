package com.ktp.iptv

import com.ktp.iptv.data.model.ChannelType
import com.ktp.iptv.data.parser.M3uParser
import com.ktp.iptv.proxy.LocalStreamProxy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class M3uAndProxyTest {

    @Test
    fun parsesM3uWithExtVlcOptHeaders() {
        val sample = """
            #EXTM3U
            #EXTINF:-1 tvg-id="TF1.fr" tvg-logo="https://example.com/tf1.png" tvg-country="FR" tvg-language="French" group-title="Entertainment",TF1 HD
            #EXTVLCOPT:http-user-agent=KtpAgent/1.0
            #EXTVLCOPT:http-referrer=https://example.com
            http://stream.example.com/live/tf1.m3u8
        """.trimIndent()

        val channels = M3uParser.parse(sample, "TestM3U")
        assertEquals(1, channels.size)
        val ch = channels.first()
        assertEquals("TF1 HD", ch.name)
        assertEquals("FR", ch.countryCode)
        assertEquals("entertainment", ch.categories.first())
        assertEquals(ChannelType.LIVE_24_7, ch.type)
        assertEquals("KtpAgent/1.0", ch.userAgent)
        assertEquals("https://example.com", ch.referrer)
        assertTrue(ch.isHttp)
    }

    @Test
    fun rewritesHlsManifestRelativeAndAbsoluteUrlsThroughProxy() {
        val manifest = """
            #EXTM3U
            #EXT-X-VERSION:3
            #EXT-X-KEY:METHOD=AES-128,URI="keys/stream.key"
            #EXTINF:6.0,
            segment001.ts
            https://cdn.example.org/hd/segment002.ts
        """.trimIndent()

        val rewritten = LocalStreamProxy.rewriteM3u8(
            manifest = manifest,
            baseUrl = "http://origin.example.org/hls/index.m3u8",
            proxyBase = "http://127.0.0.1:8899/stream",
            ua = "CustomUA",
            ref = null
        )

        assertTrue(rewritten.contains("http://127.0.0.1:8899/stream?url=http%3A%2F%2Forigin.example.org%2Fhls%2Fkeys%2Fstream.key"))
        assertTrue(rewritten.contains("http://127.0.0.1:8899/stream?url=http%3A%2F%2Forigin.example.org%2Fhls%2Fsegment001.ts"))
        assertTrue(rewritten.contains("http://127.0.0.1:8899/stream?url=https%3A%2F%2Fcdn.example.org%2Fhd%2Fsegment002.ts"))
    }

    @Test
    fun detectsNewerGitHubReleaseVersions() {
        assertTrue(com.ktp.iptv.update.AppUpdateManager.isRemoteVersionNewer("v1.0.1", "1.0.0", 1))
        assertTrue(com.ktp.iptv.update.AppUpdateManager.isRemoteVersionNewer("build-5", "1.0.0", 1))
        assertTrue(com.ktp.iptv.update.AppUpdateManager.isRemoteVersionNewer("v1.2.6", "1.2.5", 5))
        assertEquals(false, com.ktp.iptv.update.AppUpdateManager.isRemoteVersionNewer("v1.0.0", "1.0.0", 1))
        assertEquals(false, com.ktp.iptv.update.AppUpdateManager.isRemoteVersionNewer("build-1", "1.0.0", 1))
    }

    @Test
    fun decodesHtmlEntitiesAndClassifiesResolutions() {
        assertEquals(
            "Les Vacances de Golo & Rita",
            com.ktp.iptv.data.model.TextSanitizer.decodeHtml("Les Vacances de Golo &amp; Rita")
        )
        assertEquals("4k", com.ktp.iptv.data.model.TextSanitizer.classifyResolution("2160p", "TF1 UHD"))
        assertEquals("1080p", com.ktp.iptv.data.model.TextSanitizer.classifyResolution("1080p", "France 2"))
        assertEquals("720p", com.ktp.iptv.data.model.TextSanitizer.classifyResolution("720p", "Arte"))
        assertEquals("sd", com.ktp.iptv.data.model.TextSanitizer.classifyResolution("480i", "Chaine SD"))
    }
}
