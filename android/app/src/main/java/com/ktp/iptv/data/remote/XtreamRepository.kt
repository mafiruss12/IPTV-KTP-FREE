package com.ktp.iptv.data.remote

import com.google.gson.JsonArray
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.ktp.iptv.data.model.Channel
import com.ktp.iptv.data.model.ChannelType
import com.ktp.iptv.data.model.SourceKind
import com.ktp.iptv.data.model.TextSanitizer
import com.ktp.iptv.data.parser.M3uParser
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import java.net.URLEncoder

class XtreamRepository(
    private val client: OkHttpClient
) {
    companion object {
        private val USER_AGENTS = listOf(
            "IPTVSmartersPro",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
            "Lavf/58.76.100"
        )
    }

    private data class HttpResult(
        val code: Int,
        val body: String,
        val finalBaseUrl: String?
    )

    private fun normalizeCredentials(
        rawHost: String,
        rawUser: String,
        rawPass: String
    ): Triple<String, String, String> {
        var hostInput = rawHost.trim()
        var user = rawUser.trim()
        var pass = rawPass.trim()

        if (!hostInput.startsWith("http://", true) && !hostInput.startsWith("https://", true)) {
            hostInput = "http://$hostInput"
        }

        val parsed = hostInput.toHttpUrlOrNull()
        if (parsed != null) {
            if (user.isBlank()) {
                user = parsed.queryParameter("username").orEmpty().trim()
            }
            if (pass.isBlank()) {
                pass = parsed.queryParameter("password").orEmpty().trim()
            }
            val portPart = if ((parsed.scheme == "http" && parsed.port == 80) ||
                (parsed.scheme == "https" && parsed.port == 443)
            ) "" else ":${parsed.port}"
            val cleanPath = parsed.encodedPath
                .replace(Regex("/(player_api\\.php|panel_api\\.php|get\\.php|xmltv\\.php).*$", RegexOption.IGNORE_CASE), "")
                .replace(Regex("/c/?$", RegexOption.IGNORE_CASE), "")
                .trimEnd('/')
            return Triple("${parsed.scheme}://${parsed.host}$portPart$cleanPath", user, pass)
        }

        val fallbackHost = hostInput
            .substringBefore("?")
            .replace(Regex("/(player_api\\.php|panel_api\\.php|get\\.php).*$", RegexOption.IGNORE_CASE), "")
            .trimEnd('/')
        return Triple(fallbackHost, user, pass)
    }

    private fun executeGet(url: String, userAgent: String): HttpResult {
        val req = Request.Builder()
            .url(url)
            .header("User-Agent", userAgent)
            .header("Accept", "application/json, text/plain, */*")
            .header("Connection", "close")
            .build()
        client.newCall(req).execute().use { resp ->
            val finalUrl = resp.request.url
            val portPart = if ((finalUrl.scheme == "http" && finalUrl.port == 80) ||
                (finalUrl.scheme == "https" && finalUrl.port == 443)
            ) "" else ":${finalUrl.port}"
            val finalOrigin = "${finalUrl.scheme}://${finalUrl.host}$portPart"
            val body = resp.body?.string().orEmpty()
            return HttpResult(resp.code, body, finalOrigin)
        }
    }

    private fun executeWithUaFallback(url: String): Pair<HttpResult, String> {
        var lastResult = HttpResult(0, "", null)
        var chosenUa = USER_AGENTS.first()
        for (ua in USER_AGENTS) {
            val res = runCatching { executeGet(url, ua) }.getOrNull() ?: continue
            lastResult = res
            chosenUa = ua
            if (res.code in 200..299 && res.body.isNotBlank()) {
                return res to ua
            }
            if (res.code != 403 && res.code != 406 && res.code != 429) {
                break
            }
        }
        return lastResult to chosenUa
    }

    private fun fetchJsonArray(url: String, userAgent: String): JsonArray {
        return runCatching {
            val res = executeGet(url, userAgent)
            if (res.code !in 200..299 || res.body.isBlank()) return JsonArray()
            val trimmed = res.body.trimStart()
            if (!trimmed.startsWith("[")) return JsonArray()
            val el = JsonParser.parseString(trimmed)
            if (el.isJsonArray) el.asJsonArray else JsonArray()
        }.getOrDefault(JsonArray())
    }

    private fun isTruthyAuth(authEl: JsonElement?): Boolean {
        if (authEl == null || authEl.isJsonNull) return false
        if (authEl.isJsonPrimitive) {
            val prim = authEl.asJsonPrimitive
            if (prim.isBoolean) return prim.asBoolean
            if (prim.isNumber) return prim.asInt == 1
            if (prim.isString) {
                val s = prim.asString.trim().lowercase()
                return s == "1" || s == "true"
            }
        }
        return false
    }

    private fun isExplicitlyZeroAuth(authEl: JsonElement?): Boolean {
        if (authEl == null || authEl.isJsonNull || !authEl.isJsonPrimitive) return false
        val prim = authEl.asJsonPrimitive
        if (prim.isBoolean) return !prim.asBoolean
        if (prim.isNumber) return prim.asInt == 0
        if (prim.isString) {
            val s = prim.asString.trim().lowercase()
            return s == "0" || s == "false"
        }
        return false
    }

    suspend fun loadXtreamCatalog(
        host: String,
        username: String,
        password: String,
        sourceLabel: String
    ): List<Channel> = withContext(Dispatchers.IO) {
        val (cleanHost, cleanUser, cleanPass) = normalizeCredentials(host, username, password)
        if (cleanHost.isBlank() || cleanUser.isBlank() || cleanPass.isBlank()) {
            throw IllegalArgumentException("Serveur, utilisateur et mot de passe Xtream requis")
        }

        val encUser = URLEncoder.encode(cleanUser, "UTF-8")
        val encPass = URLEncoder.encode(cleanPass, "UTF-8")
        val authUrl = "$cleanHost/player_api.php?username=$encUser&password=$encPass"

        val (authRes, activeUa) = executeWithUaFallback(authUrl)

        if (authRes.code == 0) {
            throw IllegalStateException("Serveur Xtream injoignable ($cleanHost). Vérifiez l'URL ou le port.")
        }

        // Try M3U get.php fallback if player_api.php is unavailable or non-JSON
        val trimmedBody = authRes.body.trimStart()
        val parsedRoot = if (authRes.code in 200..299 && trimmedBody.startsWith("{")) {
            runCatching { JsonParser.parseString(trimmedBody).asJsonObject }.getOrNull()
        } else null

        if (parsedRoot == null) {
            if (authRes.code == 401 || authRes.code == 403) {
                throw IllegalStateException("Accès refusé par le serveur Xtream (HTTP ${authRes.code}).")
            }
            val m3uFallback = tryGetPhpM3uFallback(cleanHost, encUser, encPass, sourceLabel, activeUa)
            if (m3uFallback.isNotEmpty()) return@withContext m3uFallback
            throw IllegalStateException("Réponse Xtream invalide (HTTP ${authRes.code}). Vérifiez l'URL du serveur.")
        }

        val userInfo = parsedRoot.getAsJsonObject("user_info")
        if (userInfo == null) {
            val m3uFallback = tryGetPhpM3uFallback(cleanHost, encUser, encPass, sourceLabel, activeUa)
            if (m3uFallback.isNotEmpty()) return@withContext m3uFallback
            throw IllegalStateException("Réponse Xtream sans bloc user_info.")
        }

        val status = userInfo.get("status")?.takeIf { !it.isJsonNull }?.asString.orEmpty()
        val authEl = userInfo.get("auth")
        val authValid = isTruthyAuth(authEl) ||
            (!isExplicitlyZeroAuth(authEl) && status.equals("Active", ignoreCase = true))

        if (!authValid) {
            if (status.isNotBlank() && !status.equals("Active", ignoreCase = true)) {
                throw IllegalStateException("Compte Xtream $status (abonnement expiré ou désactivé)")
            }
            throw IllegalStateException("Identifiant ou mot de passe refusé par le serveur Xtream (auth=0)")
        }

        val effectiveBase = authRes.finalBaseUrl?.takeIf { it.isNotBlank() } ?: cleanHost
        val apiBase = "$effectiveBase/player_api.php?username=$encUser&password=$encPass"

        // Detect preferred live output extension from allowed_output_formats
        val allowedFormats = runCatching {
            userInfo.getAsJsonArray("allowed_output_formats")
                ?.mapNotNull { it.takeIf { p -> p.isJsonPrimitive }?.asString?.lowercase() }
                .orEmpty()
        }.getOrDefault(emptyList())
        val liveExt = when {
            "m3u8" in allowedFormats -> "m3u8"
            "ts" in allowedFormats -> "ts"
            else -> "m3u8"
        }

        val liveCatsDef = async { fetchJsonArray("$apiBase&action=get_live_categories", activeUa) }
        val liveStreamsDef = async { fetchJsonArray("$apiBase&action=get_live_streams", activeUa) }
        val vodCatsDef = async { fetchJsonArray("$apiBase&action=get_vod_categories", activeUa) }
        val vodStreamsDef = async { fetchJsonArray("$apiBase&action=get_vod_streams", activeUa) }
        val seriesCatsDef = async { fetchJsonArray("$apiBase&action=get_series_categories", activeUa) }
        val seriesDef = async { fetchJsonArray("$apiBase&action=get_series", activeUa) }

        val catMap = HashMap<String, String>()
        listOf(liveCatsDef.await(), vodCatsDef.await(), seriesCatsDef.await()).forEach { arr ->
            for (el in arr) {
                if (!el.isJsonObject) continue
                val obj = el.asJsonObject
                val cid = obj.str("category_id") ?: continue
                val cname = obj.str("category_name") ?: "General"
                catMap[cid] = TextSanitizer.decodeHtml(cname)
            }
        }

        val isHttp = effectiveBase.startsWith("http://", ignoreCase = true)
        val out = mutableListOf<Channel>()
        val cleanSourceLabel = TextSanitizer.decodeHtml(sourceLabel)

        val liveArray = liveStreamsDef.await()
        for (el in liveArray) {
            if (out.size >= 3000) break
            if (!el.isJsonObject) continue
            val item = el.asJsonObject
            val id = item.longVal("stream_id") ?: continue
            val rawName = item.str("name") ?: "Live #$id"
            val name = TextSanitizer.decodeHtml(rawName)
            val cat = catMap[item.str("category_id")] ?: "Live TV"
            val bucket = TextSanitizer.classifyResolution(null, name)
            out.add(
                Channel(
                    id = "xtream:live:$id",
                    name = name,
                    url = "$effectiveBase/live/$encUser/$encPass/$id.$liveExt",
                    logo = item.str("stream_icon"),
                    countryCode = "INT",
                    countryName = "Xtream Live",
                    countryFlag = "📡",
                    categories = listOf(cat.lowercase()),
                    type = ChannelType.LIVE_24_7,
                    quality = if (bucket != "unknown") bucket.uppercase() else null,
                    resolutionBucket = bucket,
                    userAgent = activeUa,
                    isHttp = isHttp,
                    isAfrican = TextSanitizer.isAfricanChannel("INT", "$cat $name"),
                    sourceKind = SourceKind.XTREAM,
                    sourceLabel = cleanSourceLabel
                )
            )
        }

        val vodArray = vodStreamsDef.await()
        var vodAdded = 0
        for (el in vodArray) {
            if (vodAdded >= 1200) break
            if (!el.isJsonObject) continue
            val item = el.asJsonObject
            val id = item.longVal("stream_id") ?: continue
            val ext = item.str("container_extension") ?: "mp4"
            val name = TextSanitizer.decodeHtml(item.str("name") ?: "Film #$id")
            val cat = catMap[item.str("category_id")] ?: "VOD"
            val bucket = TextSanitizer.classifyResolution(null, name)
            out.add(
                Channel(
                    id = "xtream:vod:$id",
                    name = name,
                    url = "$effectiveBase/movie/$encUser/$encPass/$id.$ext",
                    logo = item.str("stream_icon"),
                    countryCode = "INT",
                    countryName = "Xtream VOD",
                    countryFlag = "🎬",
                    categories = listOf(cat.lowercase()),
                    type = ChannelType.VOD,
                    quality = if (bucket != "unknown") bucket.uppercase() else null,
                    resolutionBucket = bucket,
                    userAgent = activeUa,
                    isHttp = isHttp,
                    sourceKind = SourceKind.XTREAM,
                    sourceLabel = cleanSourceLabel
                )
            )
            vodAdded++
        }

        val seriesArray = seriesDef.await()
        var seriesAdded = 0
        for (el in seriesArray) {
            if (seriesAdded >= 600) break
            if (!el.isJsonObject) continue
            val item = el.asJsonObject
            val id = item.longVal("series_id") ?: continue
            val name = TextSanitizer.decodeHtml(item.str("name") ?: "Série #$id")
            val cat = catMap[item.str("category_id")] ?: "Séries"
            val bucket = TextSanitizer.classifyResolution(null, name)
            out.add(
                Channel(
                    id = "xtream:series:$id",
                    name = name,
                    url = "$effectiveBase/series/$encUser/$encPass/$id.$liveExt",
                    logo = item.str("cover") ?: item.str("stream_icon"),
                    countryCode = "INT",
                    countryName = "Xtream Séries",
                    countryFlag = "📺",
                    categories = listOf(cat.lowercase()),
                    type = ChannelType.SERIES,
                    quality = if (bucket != "unknown") bucket.uppercase() else null,
                    resolutionBucket = bucket,
                    userAgent = activeUa,
                    isHttp = isHttp,
                    sourceKind = SourceKind.XTREAM,
                    sourceLabel = cleanSourceLabel
                )
            )
            seriesAdded++
        }

        if (out.isEmpty()) {
            val m3uFallback = tryGetPhpM3uFallback(effectiveBase, encUser, encPass, cleanSourceLabel, activeUa)
            if (m3uFallback.isNotEmpty()) return@withContext m3uFallback
        }

        out
    }

    private fun tryGetPhpM3uFallback(
        baseUrl: String,
        encUser: String,
        encPass: String,
        sourceLabel: String,
        ua: String
    ): List<Channel> {
        val candidates = listOf(
            "$baseUrl/get.php?username=$encUser&password=$encPass&type=m3u_plus&output=m3u8",
            "$baseUrl/get.php?username=$encUser&password=$encPass&type=m3u_plus&output=ts"
        )
        for (url in candidates) {
            val res = runCatching { executeGet(url, ua) }.getOrNull() ?: continue
            if (res.code in 200..299 && res.body.contains("#EXTINF", ignoreCase = true)) {
                val parsed = M3uParser.parse(res.body, sourceLabel, "xtream-m3u")
                if (parsed.isNotEmpty()) {
                    return parsed.map { ch ->
                        ch.copy(
                            sourceKind = SourceKind.XTREAM,
                            userAgent = ch.userAgent ?: ua
                        )
                    }
                }
            }
        }
        return emptyList()
    }

    private fun JsonObject.str(key: String): String? {
        val el = get(key) ?: return null
        if (el.isJsonNull || !el.isJsonPrimitive) return null
        return el.asString.takeIf { it.isNotBlank() }
    }

    private fun JsonObject.longVal(key: String): Long? {
        val el = get(key) ?: return null
        if (el.isJsonNull || !el.isJsonPrimitive) return null
        return runCatching { el.asLong }.getOrNull()
    }
}
