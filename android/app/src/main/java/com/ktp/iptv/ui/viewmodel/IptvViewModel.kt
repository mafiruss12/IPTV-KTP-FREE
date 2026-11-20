package com.ktp.iptv.ui.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.ktp.iptv.KtpIptvApp
import com.ktp.iptv.data.local.FavoriteChannelEntity
import com.ktp.iptv.data.local.FavoriteListEntity
import com.ktp.iptv.data.local.PlaylistSourceEntity
import com.ktp.iptv.data.model.CategoryFilterOption
import com.ktp.iptv.data.model.Channel
import com.ktp.iptv.data.model.ChannelType
import com.ktp.iptv.data.model.CountryFilterOption
import com.ktp.iptv.data.model.FilterState
import com.ktp.iptv.data.model.LanguageFilterOption
import com.ktp.iptv.data.model.ProxyMode
import com.ktp.iptv.data.model.SourceKind
import com.ktp.iptv.data.parser.M3uParser
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.Request

data class IptvUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val filteredChannels: List<Channel> = emptyList(),
    val totalCatalogSize: Int = 0,
    val httpStreamsCount: Int = 0,
    val httpsStreamsCount: Int = 0,
    val countries: List<CountryFilterOption> = emptyList(),
    val categories: List<CategoryFilterOption> = emptyList(),
    val languages: List<LanguageFilterOption> = emptyList(),
    val filter: FilterState = FilterState(),
    val activeChannel: Channel? = null,
    val playableUrl: String? = null,
    val proxyMode: ProxyMode = ProxyMode.AUTO_LOCAL,
    val remoteProxyUrl: String = ""
)

class IptvViewModel(application: Application) : AndroidViewModel(application) {

    private val app = application as KtpIptvApp
    private val dao = app.database.iptvDao()

    private val catalogChannels = MutableStateFlow<List<Channel>>(emptyList())
    private val customChannels = MutableStateFlow<List<Channel>>(emptyList())
    private val countriesFlow = MutableStateFlow<List<CountryFilterOption>>(emptyList())
    private val categoriesFlow = MutableStateFlow<List<CategoryFilterOption>>(emptyList())
    private val languagesFlow = MutableStateFlow<List<LanguageFilterOption>>(emptyList())
    private val streamProtocolCounts = MutableStateFlow(0 to 0)

    private val loadingFlow = MutableStateFlow(true)
    private val errorFlow = MutableStateFlow<String?>(null)
    private val filterFlow = MutableStateFlow(FilterState())
    private val activeChannelFlow = MutableStateFlow<Channel?>(null)
    private val proxyModeFlow = MutableStateFlow(ProxyMode.AUTO_LOCAL)
    private val remoteProxyFlow = MutableStateFlow("")

    val favoriteLists: StateFlow<List<FavoriteListEntity>> = dao.observeFavoriteLists()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val favoriteChannels: StateFlow<List<FavoriteChannelEntity>> = dao.observeFavoriteChannels()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val savedSources: StateFlow<List<PlaylistSourceEntity>> = dao.observeSources()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val uiState: StateFlow<IptvUiState> = combine(
        catalogChannels,
        customChannels,
        countriesFlow,
        categoriesFlow,
        languagesFlow,
        loadingFlow,
        errorFlow,
        filterFlow,
        activeChannelFlow,
        proxyModeFlow,
        remoteProxyFlow,
        streamProtocolCounts
    ) { values ->
        @Suppress("UNCHECKED_CAST")
        val remote = values[0] as List<Channel>
        @Suppress("UNCHECKED_CAST")
        val custom = values[1] as List<Channel>
        @Suppress("UNCHECKED_CAST")
        val countries = values[2] as List<CountryFilterOption>
        @Suppress("UNCHECKED_CAST")
        val categories = values[3] as List<CategoryFilterOption>
        @Suppress("UNCHECKED_CAST")
        val languages = values[4] as List<LanguageFilterOption>
        val loading = values[5] as Boolean
        val error = values[6] as String?
        val filter = values[7] as FilterState
        val active = values[8] as Channel?
        val proxyMode = values[9] as ProxyMode
        val remoteProxy = values[10] as String
        @Suppress("UNCHECKED_CAST")
        val protoCounts = values[11] as Pair<Int, Int>

        val all = custom + remote
        val q = filter.query.trim().lowercase()
        val filtered = all.asSequence().filter { ch ->
            if (filter.countryCode != "ALL" && ch.countryCode != filter.countryCode) return@filter false
            if (filter.channelType != null && ch.type != filter.channelType) return@filter false
            if (filter.categoryId != "all" && !ch.categories.contains(filter.categoryId)) return@filter false
            if (filter.languageCode != "all" && !ch.languages.contains(filter.languageCode)) return@filter false
            if (filter.onlyHttp != null && ch.isHttp != filter.onlyHttp) return@filter false
            if (q.isNotEmpty()) {
                val hay = "${ch.name} ${ch.countryName} ${ch.network.orEmpty()} ${ch.categories.joinToString(" ")}".lowercase()
                if (!hay.contains(q)) return@filter false
            }
            true
        }.take(400).toList()

        val resolvedUrl = active?.let {
            app.localProxy.resolvePlayableUrl(it, proxyMode, remoteProxy)
        }

        IptvUiState(
            isLoading = loading,
            error = error,
            filteredChannels = filtered,
            totalCatalogSize = all.size,
            httpStreamsCount = protoCounts.first,
            httpsStreamsCount = protoCounts.second,
            countries = countries,
            categories = categories,
            languages = languages,
            filter = filter,
            activeChannel = active,
            playableUrl = resolvedUrl,
            proxyMode = proxyMode,
            remoteProxyUrl = remoteProxy
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), IptvUiState())

    init {
        ensureDefaultFavoriteList()
        refreshCatalog()
    }

    private fun ensureDefaultFavoriteList() {
        viewModelScope.launch {
            dao.insertFavoriteList(FavoriteListEntity(id = "default", name = "Favoris généraux"))
        }
    }

    fun refreshCatalog() {
        viewModelScope.launch {
            loadingFlow.value = true
            errorFlow.value = null
            try {
                val catalog = app.iptvOrgRepository.fetchCatalog()
                catalogChannels.value = catalog.channels
                countriesFlow.value = catalog.countries
                categoriesFlow.value = catalog.categories
                languagesFlow.value = catalog.languages
                streamProtocolCounts.value = catalog.httpCount to catalog.httpsCount
                if (activeChannelFlow.value == null) {
                    activeChannelFlow.value = catalog.channels.firstOrNull()
                }
            } catch (e: Exception) {
                errorFlow.value = e.message ?: "Impossible de synchroniser iptv-org"
            } finally {
                loadingFlow.value = false
            }
        }
    }

    fun updateQuery(query: String) {
        filterFlow.value = filterFlow.value.copy(query = query)
    }

    fun selectCountry(code: String) {
        filterFlow.value = filterFlow.value.copy(countryCode = code)
    }

    fun selectChannelType(type: ChannelType?) {
        filterFlow.value = filterFlow.value.copy(channelType = type)
    }

    fun selectCategory(categoryId: String) {
        filterFlow.value = filterFlow.value.copy(categoryId = categoryId)
    }

    fun selectLanguage(langCode: String) {
        filterFlow.value = filterFlow.value.copy(languageCode = langCode)
    }

    fun resetFilters() {
        filterFlow.value = FilterState()
    }

    fun playChannel(channel: Channel) {
        activeChannelFlow.value = channel
    }

    fun setProxyMode(mode: ProxyMode) {
        proxyModeFlow.value = mode
    }

    fun setRemoteProxyUrl(url: String) {
        remoteProxyFlow.value = url.trim()
    }

    fun toggleFavorite(channel: Channel, listId: String = "default") {
        viewModelScope.launch {
            val exists = favoriteChannels.value.any { it.channelId == channel.id && it.listId == listId }
            if (exists) {
                dao.removeFavoriteChannel(listId, channel.id)
            } else {
                dao.insertFavoriteChannel(
                    FavoriteChannelEntity(
                        listId = listId,
                        channelId = channel.id,
                        name = channel.name,
                        url = channel.url,
                        logo = channel.logo,
                        countryCode = channel.countryCode,
                        countryName = channel.countryName,
                        countryFlag = channel.countryFlag,
                        category = channel.categories.firstOrNull() ?: "general",
                        language = channel.languageNames.firstOrNull().orEmpty(),
                        channelType = channel.type.name,
                        userAgent = channel.userAgent,
                        referrer = channel.referrer
                    )
                )
            }
        }
    }

    fun createFavoriteList(name: String) {
        if (name.isBlank()) return
        viewModelScope.launch {
            dao.insertFavoriteList(
                FavoriteListEntity(
                    id = "list-${System.currentTimeMillis()}",
                    name = name.trim()
                )
            )
        }
    }

    fun deleteFavoriteList(listId: String) {
        if (listId == "default") return
        viewModelScope.launch {
            dao.clearListChannels(listId)
            dao.deleteFavoriteList(listId)
        }
    }

    fun importM3uUrl(name: String, url: String, onDone: (Result<Int>) -> Unit) {
        viewModelScope.launch {
            try {
                val content = withContext(Dispatchers.IO) {
                    val req = Request.Builder().url(url.trim()).build()
                    app.okHttpClient.newCall(req).execute().use { resp ->
                        if (!resp.isSuccessful) throw IllegalStateException("HTTP ${resp.code}")
                        resp.body?.string().orEmpty()
                    }
                }
                val sourceId = "m3u-${System.currentTimeMillis()}"
                val label = name.ifBlank { "Playlist M3U" }
                val parsed = M3uParser.parse(content, label, sourceId)
                customChannels.value = parsed + customChannels.value
                dao.insertSource(
                    PlaylistSourceEntity(
                        id = sourceId,
                        name = label,
                        kind = SourceKind.M3U.name,
                        url = url.trim(),
                        channelCount = parsed.size
                    )
                )
                onDone(Result.success(parsed.size))
            } catch (e: Exception) {
                onDone(Result.failure(e))
            }
        }
    }

    fun importXtream(
        name: String,
        host: String,
        username: String,
        password: String,
        onDone: (Result<Int>) -> Unit
    ) {
        viewModelScope.launch {
            try {
                val label = name.ifBlank { host.trim() }
                val channels = app.xtreamRepository.loadXtreamCatalog(host, username, password, label)
                val sourceId = "xtream-${System.currentTimeMillis()}"
                customChannels.value = channels + customChannels.value
                dao.insertSource(
                    PlaylistSourceEntity(
                        id = sourceId,
                        name = label,
                        kind = SourceKind.XTREAM.name,
                        url = host.trim(),
                        username = username,
                        password = password,
                        channelCount = channels.size
                    )
                )
                onDone(Result.success(channels.size))
            } catch (e: Exception) {
                onDone(Result.failure(e))
            }
        }
    }

    fun removeSource(source: PlaylistSourceEntity) {
        viewModelScope.launch {
            dao.deleteSource(source.id)
            customChannels.value = customChannels.value.filterNot { it.sourceLabel == source.name }
        }
    }
}
