package com.ktp.iptv.data.remote

import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.ktp.iptv.data.model.CategoryFilterOption
import com.ktp.iptv.data.model.Channel
import com.ktp.iptv.data.model.ChannelType
import com.ktp.iptv.data.model.CountryFilterOption
import com.ktp.iptv.data.model.IptvCatalog
import com.ktp.iptv.data.model.LanguageFilterOption
import com.ktp.iptv.data.model.SourceKind
import com.ktp.iptv.data.model.TextSanitizer
import com.ktp.iptv.data.parser.M3uParser
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request

data class ApiChannelDto(
    val id: String,
    val name: String,
    val network: String?,
    val country: String,
    val categories: List<String>?,
    val is_nsfw: Boolean
)

data class ApiStreamDto(
    val channel: String?,
    val feed: String?,
    val title: String,
    val url: String,
    val quality: String?,
    val labels: List<String>?,
    val user_agent: String?,
    val referrer: String?
)

data class ApiFeedDto(
    val channel: String,
    val id: String,
    val is_main: Boolean?,
    val languages: List<String>?,
    val format: String?
)

data class ApiLogoDto(
    val channel: String,
    val feed: String?,
    val in_use: Boolean,
    val url: String
)

data class ApiCountryDto(
    val code: String,
    val name: String,
    val flag: String,
    val languages: List<String>?
)

data class ApiCategoryDto(
    val id: String,
    val name: String
)

data class ApiLanguageDto(
    val code: String,
    val name: String
)

class IptvOrgRepository(
    private val client: OkHttpClient,
    private val gson: Gson = Gson()
) {
    companion object {
        private const val BASE = "https://iptv-org.github.io/api"
        private const val AFR_M3U = "https://iptv-org.github.io/iptv/regions/afr.m3u"
        private const val FREE_TV_FR_M3U = "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist_france.m3u8"
        private val FREE_TV_AFR_PLAYLISTS = listOf(
            "TD" to "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist_chad.m3u8",
            "NG" to "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist_nigeria.m3u8",
            "KE" to "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist_kenya.m3u8",
            "EG" to "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist_egypt.m3u8"
        )
    }

    private inline fun <reified T> fetchList(url: String): List<T> {
        val req = Request.Builder()
            .url(url)
            .header("User-Agent", "KTP-IPTV-Android/1.0")
            .build()
        client.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) throw IllegalStateException("HTTP ${resp.code} on $url")
            val body = resp.body?.string() ?: "[]"
            val type = object : TypeToken<List<T>>() {}.type
            return gson.fromJson(body, type) ?: emptyList()
        }
    }

    private fun fetchTextOrNull(url: String): String? {
        return runCatching {
            val req = Request.Builder()
                .url(url)
                .header("User-Agent", "KTP-IPTV-Android/1.0")
                .build()
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) null else resp.body?.string()
            }
        }.getOrNull()
    }

    suspend fun fetchCatalog(): IptvCatalog = withContext(Dispatchers.IO) {
        val streamsDeferred = async { fetchList<ApiStreamDto>("$BASE/streams.json") }
        val channelsDeferred = async { fetchList<ApiChannelDto>("$BASE/channels.json") }
        val feedsDeferred = async { fetchList<ApiFeedDto>("$BASE/feeds.json") }
        val logosDeferred = async { fetchList<ApiLogoDto>("$BASE/logos.json") }
        val countriesDeferred = async { fetchList<ApiCountryDto>("$BASE/countries.json") }
        val categoriesDeferred = async { fetchList<ApiCategoryDto>("$BASE/categories.json") }
        val languagesDeferred = async { fetchList<ApiLanguageDto>("$BASE/languages.json") }
        val afrM3uDeferred = async { fetchTextOrNull(AFR_M3U) }
        val freeTvFrDeferred = async { fetchTextOrNull(FREE_TV_FR_M3U) }
        val freeTvAfrDeferred = FREE_TV_AFR_PLAYLISTS.map { (cc, u) -> cc to async { fetchTextOrNull(u) } }

        val streams = streamsDeferred.await()
        val channelMap = channelsDeferred.await().associateBy { it.id }

        val feeds = feedsDeferred.await()
        val feedMap = HashMap<String, ApiFeedDto>(feeds.size)
        val defaultFeedMap = HashMap<String, ApiFeedDto>()
        for (f in feeds) {
            feedMap["${f.channel}::${f.id}"] = f
            if (f.is_main == true || !defaultFeedMap.containsKey(f.channel)) {
                defaultFeedMap[f.channel] = f
            }
        }

        val logoMap = HashMap<String, String>()
        for (l in logosDeferred.await()) {
            if (!l.in_use || l.url.isBlank()) continue
            val key = if (!l.feed.isNullOrBlank()) "${l.channel}::${l.feed}" else l.channel
            logoMap.putIfAbsent(key, l.url)
            logoMap.putIfAbsent(l.channel, l.url)
        }

        val countryMap = countriesDeferred.await().associateBy { it.code }
        val categoryMap = categoriesDeferred.await().associate { it.id to it.name }
        val languageMap = languagesDeferred.await().associate { it.code to it.name }

        val result = ArrayList<Channel>(streams.size + 600)
        val countryCounts = HashMap<String, Int>()
        val categoryCounts = HashMap<String, Int>()
        val languageCounts = HashMap<String, Int>()
        val seenUrls = HashSet<String>(streams.size + 600)

        var httpCount = 0
        var httpsCount = 0
        var afrCount = 0

        for ((index, stream) in streams.withIndex()) {
            val url = stream.url.trim()
            if (!url.startsWith("http://", true) && !url.startsWith("https://", true)) continue
            if (!seenUrls.add(url)) continue

            val ch = stream.channel?.let { channelMap[it] }
            if (ch?.is_nsfw == true) continue

            val feed = stream.channel?.let { chId ->
                stream.feed?.let { feedMap["$chId::$it"] } ?: defaultFeedMap[chId]
            }

            val countryCode = ch?.country ?: "INT"
            val countryInfo = countryMap[countryCode]
            val countryName = TextSanitizer.decodeHtml(
                countryInfo?.name ?: if (countryCode == "INT") "International" else countryCode
            )
            val countryFlag = countryInfo?.flag ?: "🌐"

            val cats = ch?.categories?.takeIf { it.isNotEmpty() } ?: listOf("general")
            val langCodes = (feed?.languages?.takeIf { it.isNotEmpty() }
                ?: countryInfo?.languages?.take(2)
                ?: emptyList()).distinct()
            val langNames = langCodes.map { languageMap[it] ?: it.uppercase() }

            val labels = stream.labels.orEmpty()
            val isPartTime = labels.any { it.contains("Not 24/7", ignoreCase = true) }
            val isGeoBlocked = labels.any { it.contains("Geo-blocked", ignoreCase = true) }

            val isHttp = url.startsWith("http://", ignoreCase = true)
            if (isHttp) httpCount++ else httpsCount++

            val logo = stream.channel?.let { chId ->
                stream.feed?.let { logoMap["$chId::$it"] } ?: logoMap[chId]
            }

            val rawDisplayName = when {
                ch != null && stream.title.isNotBlank() && stream.title != ch.name ->
                    "${ch.name} (${stream.title})"
                ch != null -> ch.name
                else -> stream.title
            }
            val displayName = TextSanitizer.decodeHtml(rawDisplayName)
            val rawQuality = stream.quality ?: feed?.format
            val resBucket = TextSanitizer.classifyResolution(rawQuality, displayName)
            val isAfr = TextSanitizer.isAfricanChannel(countryCode, displayName)
            if (isAfr) afrCount++

            result.add(
                Channel(
                    id = "iptv-org:$index:${stream.channel ?: "raw"}",
                    name = displayName,
                    url = url,
                    logo = logo,
                    countryCode = countryCode,
                    countryName = countryName,
                    countryFlag = countryFlag,
                    categories = cats,
                    languages = langCodes,
                    languageNames = langNames,
                    type = if (isPartTime) ChannelType.PART_TIME else ChannelType.LIVE_24_7,
                    quality = rawQuality,
                    resolutionBucket = resBucket,
                    network = ch?.network?.let { TextSanitizer.decodeHtml(it) },
                    userAgent = stream.user_agent,
                    referrer = stream.referrer,
                    isHttp = isHttp,
                    isGeoBlocked = isGeoBlocked,
                    isAfrican = isAfr,
                    sourceKind = SourceKind.IPTV_ORG,
                    sourceLabel = "iptv-org"
                )
            )

            countryCounts[countryCode] = (countryCounts[countryCode] ?: 0) + 1
            for (c in cats) categoryCounts[c] = (categoryCounts[c] ?: 0) + 1
            for (l in langCodes) languageCounts[l] = (languageCounts[l] ?: 0) + 1
        }

        // Merge additional African channels from iptv-org regions/afr.m3u
        afrM3uDeferred.await()?.let { rawM3u ->
            val parsedAfr = M3uParser.parse(rawM3u, "iptv-org Afrique", "afr-m3u", skipWebLinks = true)
            for (ch in parsedAfr) {
                if (!seenUrls.add(ch.url)) continue
                val idMatch = Regex("""\.([a-z]{2})@""", RegexOption.IGNORE_CASE).find(ch.id)
                val inferredCode = when {
                    ch.countryCode != "INT" -> ch.countryCode
                    idMatch != null -> idMatch.groupValues[1].uppercase()
                    else -> "AFR"
                }
                val info = countryMap[inferredCode]
                val finalCode = if (info != null) inferredCode else "AFR"
                val finalName = info?.name ?: "Afrique"
                val finalFlag = info?.flag ?: "🌍"
                val langCodes = info?.languages?.take(2) ?: emptyList()
                val langNames = langCodes.map { languageMap[it] ?: it.uppercase() }
                val enriched = ch.copy(
                    countryCode = finalCode,
                    countryName = TextSanitizer.decodeHtml(finalName),
                    countryFlag = finalFlag,
                    languages = ch.languages.ifEmpty { langCodes },
                    languageNames = ch.languageNames.ifEmpty { langNames },
                    isAfrican = true,
                    sourceKind = SourceKind.IPTV_ORG,
                    sourceLabel = "iptv-org Afrique"
                )
                result.add(enriched)
                if (enriched.isHttp) httpCount++ else httpsCount++
                afrCount++
                countryCounts[finalCode] = (countryCounts[finalCode] ?: 0) + 1
                for (c in enriched.categories) categoryCounts[c] = (categoryCounts[c] ?: 0) + 1
            }
        }

        // Merge curated Free-TV France (TF1, France TV, Arte, BFM, TV5Monde, etc.)
        freeTvFrDeferred.await()?.let { rawFr ->
            val frInfo = countryMap["FR"]
            val parsedFr = M3uParser.parse(rawFr, "Free-TV France", "freetv-fr", skipWebLinks = true)
            for (ch in parsedFr) {
                if (!seenUrls.add(ch.url)) continue
                val enriched = ch.copy(
                    countryCode = "FR",
                    countryName = frInfo?.name ?: "France",
                    countryFlag = frInfo?.flag ?: "🇫🇷",
                    languages = listOf("fra"),
                    languageNames = listOf(languageMap["fra"] ?: "French"),
                    isAfrican = false,
                    sourceKind = SourceKind.IPTV_ORG,
                    sourceLabel = "Free-TV France"
                )
                result.add(enriched)
                if (enriched.isHttp) httpCount++ else httpsCount++
                countryCounts["FR"] = (countryCounts["FR"] ?: 0) + 1
                for (c in enriched.categories) categoryCounts[c] = (categoryCounts[c] ?: 0) + 1
                languageCounts["fra"] = (languageCounts["fra"] ?: 0) + 1
            }
        }

        // Merge curated Free-TV Africa playlists
        for ((cc, deferred) in freeTvAfrDeferred) {
            val rawAfr = deferred.await() ?: continue
            val info = countryMap[cc]
            val langCodes = info?.languages?.take(2) ?: emptyList()
            val langNames = langCodes.map { languageMap[it] ?: it.uppercase() }
            val parsed = M3uParser.parse(rawAfr, "Free-TV Afrique", "freetv-$cc", skipWebLinks = true)
            for (ch in parsed) {
                if (!seenUrls.add(ch.url)) continue
                val enriched = ch.copy(
                    countryCode = cc,
                    countryName = info?.name ?: cc,
                    countryFlag = info?.flag ?: "🌍",
                    languages = langCodes,
                    languageNames = langNames,
                    isAfrican = true,
                    sourceKind = SourceKind.IPTV_ORG,
                    sourceLabel = "Free-TV Afrique"
                )
                result.add(enriched)
                if (enriched.isHttp) httpCount++ else httpsCount++
                afrCount++
                countryCounts[cc] = (countryCounts[cc] ?: 0) + 1
                for (c in enriched.categories) categoryCounts[c] = (categoryCounts[c] ?: 0) + 1
            }
        }

        result.sortByDescending { ch ->
            (if (ch.type == ChannelType.LIVE_24_7) 8 else 0) +
                (if (!ch.logo.isNullOrBlank()) 4 else 0) +
                (if (!ch.isGeoBlocked) 2 else 0) +
                (if (ch.countryCode != "INT") 1 else 0)
        }

        val sortedCountries = countryCounts.entries
            .filter { it.key != "AFR" }
            .map { (code, count) ->
                val info = countryMap[code]
                CountryFilterOption(
                    code = code,
                    name = TextSanitizer.decodeHtml(info?.name ?: if (code == "INT") "International" else code),
                    flag = info?.flag ?: "🌐",
                    count = count
                )
            }
            .sortedByDescending { it.count }

        val countries = if (afrCount > 0) {
            listOf(
                CountryFilterOption(
                    code = "AFR",
                    name = "Afrique (Toutes)",
                    flag = "🌍",
                    count = afrCount
                )
            ) + sortedCountries
        } else {
            sortedCountries
        }

        val categories = categoryCounts.entries
            .map { (id, count) ->
                CategoryFilterOption(
                    id = id,
                    name = categoryMap[id] ?: id.replaceFirstChar { it.uppercase() },
                    count = count
                )
            }
            .sortedByDescending { it.count }

        val languages = languageCounts.entries
            .map { (code, count) ->
                LanguageFilterOption(
                    code = code,
                    name = languageMap[code] ?: code.uppercase(),
                    count = count
                )
            }
            .sortedByDescending { it.count }

        IptvCatalog(
            channels = result,
            countries = countries,
            categories = categories,
            languages = languages,
            httpCount = httpCount,
            httpsCount = httpsCount
        )
    }
}
