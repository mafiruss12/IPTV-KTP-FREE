package com.ktp.iptv.proxy

import com.ktp.iptv.data.model.Channel
import com.ktp.iptv.data.model.ProxyMode
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.URL
import java.net.URLDecoder
import java.net.URLEncoder
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Embedded local HTTP proxy bridging HTTP <-> HTTPS redirects, injecting custom
 * User-Agent/Referer headers, and rewriting HLS (.m3u8) playlists so ExoPlayer
 * can play mixed-protocol and protected streams seamlessly.
 */
class LocalStreamProxy(private val upstreamClient: OkHttpClient) {

    private var serverSocket: ServerSocket? = null
    private val running = AtomicBoolean(false)
    private val executor = Executors.newCachedThreadPool()

    @Volatile
    var port: Int = 0
        private set

    fun start() {
        if (running.getAndSet(true)) return
        executor.execute {
            try {
                val socket = ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"))
                serverSocket = socket
                port = socket.localPort
                while (running.get()) {
                    val client = socket.accept()
                    executor.execute { handleClient(client) }
                }
            } catch (_: Exception) {
                // Socket closed on stop
            }
        }
    }

    fun stop() {
        running.set(false)
        try {
            serverSocket?.close()
        } catch (_: Exception) {
        }
    }

    fun resolvePlayableUrl(
        channel: Channel,
        mode: ProxyMode,
        remoteHttpsProxyBase: String = ""
    ): String {
        val shouldProxy = when (mode) {
            ProxyMode.DIRECT -> false
            ProxyMode.FORCE_LOCAL -> true
            ProxyMode.AUTO_LOCAL ->
                channel.isHttp || !channel.userAgent.isNullOrBlank() || !channel.referrer.isNullOrBlank()
            ProxyMode.REMOTE_HTTPS -> true
        }

        if (!shouldProxy) return channel.url

        if (mode == ProxyMode.REMOTE_HTTPS && remoteHttpsProxyBase.isNotBlank()) {
            val base = remoteHttpsProxyBase.trimEnd('/')
            return buildProxyEndpoint("$base/api/proxy/stream", channel.url, channel.userAgent, channel.referrer)
        }

        if (port <= 0) return channel.url
        return buildProxyEndpoint("http://127.0.0.1:$port/stream", channel.url, channel.userAgent, channel.referrer)
    }

    private fun handleClient(socket: Socket) {
        socket.use { client ->
            try {
                val input = BufferedInputStream(client.getInputStream())
                val requestLine = readLine(input) ?: return
                val parts = requestLine.split(" ")
                if (parts.size < 2) return

                // Drain HTTP headers
                var rangeHeader: String? = null
                while (true) {
                    val headerLine = readLine(input) ?: break
                    if (headerLine.isEmpty()) break
                    if (headerLine.startsWith("Range:", ignoreCase = true)) {
                        rangeHeader = headerLine.substringAfter(":").trim()
                    }
                }

                val pathAndQuery = parts[1]
                val query = pathAndQuery.substringAfter("?", "")
                val params = parseQuery(query)
                val targetUrl = params["url"] ?: return writeError(client, 400, "Missing url")
                val ua = params["ua"]
                val ref = params["ref"]

                val reqBuilder = Request.Builder()
                    .url(targetUrl)
                    .header(
                        "User-Agent",
                        ua ?: "Mozilla/5.0 (Linux; Android 14; KTP-IPTV) AppleWebKit/537.36"
                    )
                if (!ref.isNullOrBlank()) reqBuilder.header("Referer", ref)
                if (!rangeHeader.isNullOrBlank()) reqBuilder.header("Range", rangeHeader)

                upstreamClient.newCall(reqBuilder.build()).execute().use { resp ->
                    val out = BufferedOutputStream(client.getOutputStream())
                    val finalUrl = resp.request.url.toString()
                    val contentType = resp.header("Content-Type").orEmpty()
                    val isM3u8 = contentType.contains("mpegurl", ignoreCase = true) ||
                        finalUrl.contains(".m3u8", ignoreCase = true) ||
                        finalUrl.contains(".m3u", ignoreCase = true)

                    if (!resp.isSuccessful && resp.code != 206) {
                        writeError(client, resp.code, "Upstream HTTP ${resp.code}")
                        return
                    }

                    if (isM3u8) {
                        val manifest = resp.body?.string().orEmpty()
                        val bodyBytes = if (manifest.trimStart().startsWith("#EXTM3U")) {
                            rewriteM3u8(
                                manifest = manifest,
                                baseUrl = finalUrl,
                                proxyBase = "http://127.0.0.1:$port/stream",
                                ua = ua,
                                ref = ref
                            ).toByteArray(Charsets.UTF_8)
                        } else {
                            manifest.toByteArray(Charsets.UTF_8)
                        }

                        val header = buildString {
                            append("HTTP/1.1 200 OK\r\n")
                            append("Content-Type: application/vnd.apple.mpegurl; charset=utf-8\r\n")
                            append("Content-Length: ${bodyBytes.size}\r\n")
                            append("Access-Control-Allow-Origin: *\r\n")
                            append("Connection: close\r\n\r\n")
                        }
                        out.write(header.toByteArray(Charsets.US_ASCII))
                        out.write(bodyBytes)
                        out.flush()
                        return
                    }

                    val header = buildString {
                        append("HTTP/1.1 ${resp.code} ${resp.message.ifBlank { "OK" }}\r\n")
                        if (contentType.isNotBlank()) append("Content-Type: $contentType\r\n")
                        resp.header("Content-Length")?.let { append("Content-Length: $it\r\n") }
                        resp.header("Accept-Ranges")?.let { append("Accept-Ranges: $it\r\n") }
                        append("Access-Control-Allow-Origin: *\r\n")
                        append("Connection: close\r\n\r\n")
                    }
                    out.write(header.toByteArray(Charsets.US_ASCII))
                    resp.body?.byteStream()?.use { stream ->
                        val buffer = ByteArray(16 * 1024)
                        while (true) {
                            val read = stream.read(buffer)
                            if (read <= 0) break
                            out.write(buffer, 0, read)
                        }
                    }
                    out.flush()
                }
            } catch (_: Exception) {
                // Client disconnected or upstream failed
            }
        }
    }

    private fun readLine(input: BufferedInputStream): String? {
        val sb = StringBuilder()
        while (true) {
            val b = input.read()
            if (b == -1) return if (sb.isEmpty()) null else sb.toString()
            if (b == '\n'.code) break
            if (b != '\r'.code) sb.append(b.toChar())
        }
        return sb.toString()
    }

    private fun writeError(socket: Socket, code: Int, message: String) {
        val body = message.toByteArray(Charsets.UTF_8)
        val response = "HTTP/1.1 $code Error\r\nContent-Length: ${body.size}\r\nConnection: close\r\n\r\n"
        socket.getOutputStream().write(response.toByteArray(Charsets.US_ASCII))
        socket.getOutputStream().write(body)
        socket.getOutputStream().flush()
    }

    companion object {
        private val URI_ATTR_REGEX = Regex("""URI="([^"]+)"""", RegexOption.IGNORE_CASE)

        fun buildProxyEndpoint(
            proxyBase: String,
            targetUrl: String,
            ua: String?,
            ref: String?
        ): String {
            val sb = StringBuilder(proxyBase)
            sb.append("?url=").append(URLEncoder.encode(targetUrl, "UTF-8"))
            if (!ua.isNullOrBlank()) sb.append("&ua=").append(URLEncoder.encode(ua, "UTF-8"))
            if (!ref.isNullOrBlank()) sb.append("&ref=").append(URLEncoder.encode(ref, "UTF-8"))
            return sb.toString()
        }

        fun rewriteM3u8(
            manifest: String,
            baseUrl: String,
            proxyBase: String,
            ua: String?,
            ref: String?
        ): String {
            val base = URL(baseUrl)
            return manifest.lines().joinToString("\n") { line ->
                val trimmed = line.trim()
                if (trimmed.isEmpty()) {
                    line
                } else if (trimmed.startsWith("#")) {
                    URI_ATTR_REGEX.replace(line) { match ->
                        val rawUri = match.groupValues[1]
                        val resolved = runCatching { URL(base, rawUri).toString() }.getOrDefault(rawUri)
                        """URI="${buildProxyEndpoint(proxyBase, resolved, ua, ref)}""""
                    }
                } else {
                    val resolved = runCatching { URL(base, trimmed).toString() }.getOrDefault(trimmed)
                    buildProxyEndpoint(proxyBase, resolved, ua, ref)
                }
            }
        }

        fun parseQuery(query: String): Map<String, String> {
            if (query.isBlank()) return emptyMap()
            return query.split("&").mapNotNull { pair ->
                val idx = pair.indexOf('=')
                if (idx <= 0) null
                else {
                    val k = URLDecoder.decode(pair.substring(0, idx), "UTF-8")
                    val v = URLDecoder.decode(pair.substring(idx + 1), "UTF-8")
                    k to v
                }
            }.toMap()
        }
    }
}
