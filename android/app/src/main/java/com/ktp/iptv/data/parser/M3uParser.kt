package com.ktp.iptv.data.parser

import com.ktp.iptv.data.model.Channel
import com.ktp.iptv.data.model.ChannelType
import com.ktp.iptv.data.model.SourceKind

object M3uParser {

    private val ATTR_REGEX = Regex("""([a-zA-Z0-9_-]+)="([^"]*)"""")

    fun parse(
        content: String,
        sourceLabel: String = "Playlist M3U",
        sourceId: String = "m3u"
    ): List<Channel> {
        val channels = mutableListOf<Channel>()
        val lines = content.lineSequence()

        var name = ""
        var tvgId = ""
        var logo = ""
        var group = "general"
        var country = "INT"
        var language = ""
        var userAgent: String? = null
        var referrer: String? = null

        for (rawLine in lines) {
            val line = rawLine.trim()
            if (line.isEmpty()) continue

            if (line.startsWith("#EXTINF:", ignoreCase = true)) {
                val attrs = mutableMapOf<String, String>()
                ATTR_REGEX.findAll(line).forEach { match ->
                    attrs[match.groupValues[1].lowercase()] = match.groupValues[2].trim()
                }
                tvgId = attrs["tvg-id"].orEmpty()
                logo = attrs["tvg-logo"].orEmpty()
                group = attrs["group-title"]?.takeIf { it.isNotBlank() } ?: "general"
                country = attrs["tvg-country"]?.uppercase()?.takeIf { it.isNotBlank() } ?: "INT"
                language = attrs["tvg-language"].orEmpty()

                val commaIdx = line.lastIndexOf(',')
                val title = if (commaIdx != -1) line.substring(commaIdx + 1).trim() else ""
                name = title.ifBlank { attrs["tvg-name"].orEmpty() }
                    .ifBlank { "Chaîne ${channels.size + 1}" }
                continue
            }

            if (line.startsWith("#EXTVLCOPT:", ignoreCase = true)) {
                val opt = line.substringAfter(":")
                when {
                    opt.startsWith("http-user-agent=", ignoreCase = true) ->
                        userAgent = opt.substringAfter("=").trim()
                    opt.startsWith("http-referrer=", ignoreCase = true) ->
                        referrer = opt.substringAfter("=").trim()
                }
                continue
            }

            if (line.startsWith("#")) continue

            if (line.startsWith("http://", ignoreCase = true) ||
                line.startsWith("https://", ignoreCase = true)
            ) {
                val lower = line.lowercase()
                val type = when {
                    lower.contains("/movie/") || lower.endsWith(".mp4") || lower.endsWith(".mkv") ->
                        ChannelType.VOD
                    lower.contains("/series/") ->
                        ChannelType.SERIES
                    group.contains("radio", ignoreCase = true) ->
                        ChannelType.RADIO
                    else ->
                        ChannelType.LIVE_24_7
                }

                val categorySlug = group.lowercase().substringBefore(";").trim().ifBlank { "general" }
                val langList = if (language.isNotBlank()) listOf(language.lowercase()) else emptyList()
                val langNames = if (language.isNotBlank()) listOf(language) else emptyList()

                channels.add(
                    Channel(
                        id = "$sourceId:${tvgId.ifBlank { channels.size.toString() }}:${name.hashCode()}",
                        name = name.ifBlank { "Flux ${channels.size + 1}" },
                        url = line,
                        logo = logo.ifBlank { null },
                        countryCode = country,
                        countryName = if (country == "INT") "International" else country,
                        countryFlag = if (country == "INT") "🌐" else "",
                        categories = listOf(categorySlug),
                        languages = langList,
                        languageNames = langNames,
                        type = type,
                        userAgent = userAgent,
                        referrer = referrer,
                        isHttp = lower.startsWith("http://"),
                        isGeoBlocked = false,
                        sourceKind = SourceKind.M3U,
                        sourceLabel = sourceLabel
                    )
                )

                name = ""
                tvgId = ""
                logo = ""
                group = "general"
                country = "INT"
                language = ""
                userAgent = null
                referrer = null
            }
        }

        return channels
    }
}
