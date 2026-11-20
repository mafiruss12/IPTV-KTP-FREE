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

    suspend fun fetchCatalog(): IptvCatalog = withContext(Dispatchers.IO) {
        val streamsDeferred = async { fetchList<ApiStreamDto>("$BASE/streams.json") }
        val channelsDeferred = async { fetchList<ApiChannelDto>("$BASE/channels.json") }
        val feedsDeferred = async { fetchList<ApiFeedDto>("$BASE/feeds.json") }
        val logosDeferred = async { fetchList<ApiLogoDto>("$BASE/logos.json") }
        val countriesDeferred = async { fetchList<ApiCountryDto>("$BASE/countries.json") }
        val categoriesDeferred = async { fetchList<ApiCategoryDto>("$BASE/categories.json") }
        val languagesDeferred = async { fetchList<ApiLanguageDto>("$BASE/languages.json") }

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

        val result = ArrayList<Channel>(streams.size)
        val countryCounts = HashMap<String, Int>()
        val categoryCounts = HashMap<String, Int>()
        val languageCounts = HashMap<String, Int>()
        val seenUrls = HashSet<String>(streams.size)

        var httpCount = 0
        var httpsCount = 0

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
            val countryName = countryInfo?.name ?: if (countryCode == "INT") "International" else countryCode
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

            val displayName = when {
                ch != null && stream.title.isNotBlank() && stream.title != ch.name ->
                    "${ch.name} (${stream.title})"
                ch != null -> ch.name
                else -> stream.title
            }

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
                    quality = stream.quality ?: feed?.format,
                    network = ch?.network,
                    userAgent = stream.user_agent,
                    referrer = stream.referrer,
                    isHttp = isHttp,
                    isGeoBlocked = isGeoBlocked,
                    sourceKind = SourceKind.IPTV_ORG,
                    sourceLabel = "iptv-org"
                )
            )

            countryCounts[countryCode] = (countryCounts[countryCode] ?: 0) + 1
            for (c in cats) categoryCounts[c] = (categoryCounts[c] ?: 0) + 1
            for (l in langCodes) languageCounts[l] = (languageCounts[l] ?: 0) + 1
        }

        val countries = countryCounts.entries
            .map { (code, count) ->
                val info = countryMap[code]
                CountryFilterOption(
                    code = code,
                    name = info?.name ?: if (code == "INT") "International" else code,
                    flag = info?.flag ?: "🌐",
                    count = count
                )
            }
            .sortedByDescending { it.count }

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
