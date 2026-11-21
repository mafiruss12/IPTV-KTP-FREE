package com.ktp.iptv.data.model

enum class ChannelType(val label: String) {
    LIVE_24_7("TV Live 24/7"),
    PART_TIME("Événement / Part-time"),
    VOD("VOD / Films"),
    SERIES("Séries"),
    RADIO("Radio")
}

enum class ResolutionFilter(val label: String, val key: String) {
    ALL("Toutes résolutions", "all"),
    UHD_4K("4K / UHD", "4k"),
    FHD_1080("1080p FHD", "1080p"),
    HD_720("720p HD", "720p"),
    SD("480p / SD", "sd")
}

enum class AspectRatioMode(val label: String) {
    FIT("Adapter"),
    FILL("Remplir"),
    ZOOM("Zoom"),
    RATIO_16_9("16:9"),
    RATIO_4_3("4:3")
}

data class VideoQualityTrack(
    val id: String,
    val label: String,
    val height: Int,
    val width: Int,
    val bitrateKbps: Int,
    val groupIndex: Int,
    val trackIndex: Int,
    val isSelected: Boolean = false
)

enum class SourceKind {
    IPTV_ORG,
    M3U,
    XTREAM
}

enum class ProxyMode(val label: String) {
    AUTO_LOCAL("Proxy Local Auto (HTTP ↔ HTTPS)"),
    FORCE_LOCAL("Proxy Local Forcé"),
    REMOTE_HTTPS("Proxy HTTPS Distant"),
    DIRECT("Connexion Directe")
}

data class Channel(
    val id: String,
    val name: String,
    val url: String,
    val logo: String? = null,
    val countryCode: stringOrEmpty = "INT",
    val countryName: String = "International",
    val countryFlag: String = "🌐",
    val categories: List<String> = listOf("general"),
    val languages: List<String> = emptyList(),
    val languageNames: List<String> = emptyList(),
    val type: ChannelType = ChannelType.LIVE_24_7,
    val quality: String? = null,
    val resolutionBucket: String = "unknown",
    val network: String? = null,
    val userAgent: String? = null,
    val referrer: String? = null,
    val isHttp: Boolean = false,
    val isGeoBlocked: Boolean = false,
    val sourceKind: SourceKind = SourceKind.IPTV_ORG,
    val sourceLabel: String = "iptv-org"
)

private typealias stringOrEmpty = String

data class CountryFilterOption(
    val code: String,
    val name: String,
    val flag: String,
    val count: Int
)

data class CategoryFilterOption(
    val id: String,
    val name: String,
    val count: Int
)

data class LanguageFilterOption(
    val code: String,
    val name: String,
    val count: Int
)

data class FilterState(
    val query: String = "",
    val countryCode: String = "ALL",
    val channelType: ChannelType? = null,
    val categoryId: String = "all",
    val languageCode: String = "all",
    val resolution: ResolutionFilter = ResolutionFilter.ALL,
    val onlyHttp: Boolean? = null
)

data class IptvCatalog(
    val channels: List<Channel>,
    val countries: List<CountryFilterOption>,
    val categories: List<CategoryFilterOption>,
    val languages: List<LanguageFilterOption>,
    val httpCount: Int,
    val httpsCount: Int
)

object TextSanitizer {
    private val NUMERIC_ENTITY = Regex("&#(\\d+);")

    fun decodeHtml(input: String): String {
        if (!input.contains('&')) return input
        var out = input
            .replace("&amp;", "&")
            .replace("&quot;", "\"")
            .replace("&#039;", "'")
            .replace("&apos;", "'")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&nbsp;", " ")
        out = NUMERIC_ENTITY.replace(out) { m ->
            val code = m.groupValues[1].toIntOrNull()
            if (code != null && code in 32..65535) code.toChar().toString() else m.value
        }
        return out.trim()
    }

    fun classifyResolution(quality: String?, name: String): String {
        val hay = "${quality.orEmpty()} $name".lowercase()
        return when {
            hay.contains("2160") || hay.contains("4k") || hay.contains("uhd") -> "4k"
            hay.contains("1080") || hay.contains("fhd") -> "1080p"
            hay.contains("720") || Regex("\\bhd\\b").containsMatchIn(hay) -> "720p"
            hay.contains("576") || hay.contains("540") || hay.contains("480") ||
                hay.contains("360") || hay.contains("240") || Regex("\\bsd\\b").containsMatchIn(hay) -> "sd"
            else -> "unknown"
        }
    }
}
