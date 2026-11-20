package com.ktp.iptv.data.remote

import com.google.gson.Gson
import com.google.gson.annotations.SerializedName
import com.google.gson.reflect.TypeToken
import com.ktp.iptv.data.model.Channel
import com.ktp.iptv.data.model.ChannelType
import com.ktp.iptv.data.model.SourceKind
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.net.URLEncoder

data class XtreamAuthResponse(
    @SerializedName("user_info") val userInfo: XtreamUserInfo?
)

data class XtreamUserInfo(
    val auth: Int?,
    val status: String?
)

data class XtreamCategoryDto(
    @SerializedName("category_id") val categoryId: String?,
    @SerializedName("category_name") val categoryName: String?
)

data class XtreamStreamDto(
    @SerializedName("stream_id") val streamId: Long?,
    @SerializedName("series_id") val seriesId: Long?,
    val name: String?,
    @SerializedName("stream_icon") val streamIcon: String?,
    val cover: String?,
    @SerializedName("category_id") val categoryId: String?,
    @SerializedName("container_extension") val containerExtension: String?
)

class XtreamRepository(
    private val client: OkHttpClient,
    private val gson: Gson = Gson()
) {
    private inline fun <reified T> fetchJson(url: String): T? {
        val req = Request.Builder().url(url).build()
        client.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) return null
            val body = resp.body?.string() ?: return null
            val type = object : TypeToken<T>() {}.type
            return gson.fromJson(body, type)
        }
    }

    suspend fun loadXtreamCatalog(
        host: String,
        username: String,
        password: String,
        sourceLabel: String
    ): List<Channel> = withContext(Dispatchers.IO) {
        val cleanHost = host.trim().trimEnd('/').let {
            if (it.startsWith("http://", true) || it.startsWith("https://", true)) it else "http://$it"
        }
        val encUser = URLEncoder.encode(username, "UTF-8")
        val encPass = URLEncoder.encode(password, "UTF-8")
        val apiBase = "$cleanHost/player_api.php?username=$encUser&password=$encPass"

        val auth = fetchJson<XtreamAuthResponse>(apiBase)
        if (auth?.userInfo == null || auth.userInfo.auth == 0) {
            throw IllegalStateException("Authentification Xtream Codes refusée")
        }

        val liveCatsDef = async { fetchJson<List<XtreamCategoryDto>>("$apiBase&action=get_live_categories").orEmpty() }
        val liveStreamsDef = async { fetchJson<List<XtreamStreamDto>>("$apiBase&action=get_live_streams").orEmpty() }
        val vodCatsDef = async { fetchJson<List<XtreamCategoryDto>>("$apiBase&action=get_vod_categories").orEmpty() }
        val vodStreamsDef = async { fetchJson<List<XtreamStreamDto>>("$apiBase&action=get_vod_streams").orEmpty() }
        val seriesCatsDef = async { fetchJson<List<XtreamCategoryDto>>("$apiBase&action=get_series_categories").orEmpty() }
        val seriesDef = async { fetchJson<List<XtreamStreamDto>>("$apiBase&action=get_series").orEmpty() }

        val catMap = HashMap<String, String>()
        (liveCatsDef.await() + vodCatsDef.await() + seriesCatsDef.await()).forEach { c ->
            if (!c.categoryId.isNullOrBlank()) {
                catMap[c.categoryId] = c.categoryName ?: "General"
            }
        }

        val isHttp = cleanHost.startsWith("http://", ignoreCase = true)
        val out = mutableListOf<Channel>()

        for (item in liveStreamsDef.await().take(2000)) {
            val id = item.streamId ?: continue
            val cat = catMap[item.categoryId] ?: "Live TV"
            out.add(
                Channel(
                    id = "xtream:live:$id",
                    name = item.name ?: "Live #$id",
                    url = "$cleanHost/live/$encUser/$encPass/$id.m3u8",
                    logo = item.streamIcon,
                    countryCode = "INT",
                    countryName = "Xtream Live",
                    countryFlag = "📡",
                    categories = listOf(cat.lowercase()),
                    type = ChannelType.LIVE_24_7,
                    isHttp = isHttp,
                    sourceKind = SourceKind.XTREAM,
                    sourceLabel = sourceLabel
                )
            )
        }

        for (item in vodStreamsDef.await().take(1000)) {
            val id = item.streamId ?: continue
            val ext = item.containerExtension ?: "mp4"
            val cat = catMap[item.categoryId] ?: "VOD"
            out.add(
                Channel(
                    id = "xtream:vod:$id",
                    name = item.name ?: "Film #$id",
                    url = "$cleanHost/movie/$encUser/$encPass/$id.$ext",
                    logo = item.streamIcon,
                    countryCode = "INT",
                    countryName = "Xtream VOD",
                    countryFlag = "🎬",
                    categories = listOf(cat.lowercase()),
                    type = ChannelType.VOD,
                    isHttp = isHttp,
                    sourceKind = SourceKind.XTREAM,
                    sourceLabel = sourceLabel
                )
            )
        }

        for (item in seriesDef.await().take(500)) {
            val id = item.seriesId ?: continue
            val cat = catMap[item.categoryId] ?: "Séries"
            out.add(
                Channel(
                    id = "xtream:series:$id",
                    name = item.name ?: "Série #$id",
                    url = "$cleanHost/series/$encUser/$encPass/$id.m3u8",
                    logo = item.cover ?: item.streamIcon,
                    countryCode = "INT",
                    countryName = "Xtream Séries",
                    countryFlag = "📺",
                    categories = listOf(cat.lowercase()),
                    type = ChannelType.SERIES,
                    isHttp = isHttp,
                    sourceKind = SourceKind.XTREAM,
                    sourceLabel = sourceLabel
                )
            )
        }

        out
    }
}
