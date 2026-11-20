package com.ktp.iptv.data.model

enum class ChannelType(val label: String) {
    LIVE_24_7("TV Live 24/7"),
    PART_TIME("Événement / Part-time"),
    VOD("VOD / Films"),
    SERIES("Séries"),
    RADIO("Radio")
}

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
    val countryCode: String = "INT",
    val countryName: String = "International",
    val countryFlag: String = "🌐",
    val categories: List<String> = listOf("general"),
    val languages: List<String> = emptyList(),
    val languageNames: List<String> = emptyList(),
    val type: ChannelType = ChannelType.LIVE_24_7,
    val quality: String? = null,
    val network: String? = null,
    val userAgent: String? = null,
    val referrer: String? = null,
    val isHttp: Boolean = false,
    val isGeoBlocked: Boolean = false,
    val sourceKind: SourceKind = SourceKind.IPTV_ORG,
    val sourceLabel: String = "iptv-org"
)

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
