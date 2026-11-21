package com.ktp.iptv.ui.viewmodel

import android.app.Application
import android.content.Context
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.ktp.iptv.KtpIptvApp
import com.ktp.iptv.update.AppUpdateRelease
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
import com.ktp.iptv.data.model.ResolutionFilter
import com.ktp.iptv.data.model.SourceFilter
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
    val featuredChannels: List<Channel> = emptyList(),
    val africanChannels: List<Channel> = emptyList(),
    val frenchChannels: List<Channel> = emptyList(),
    val hdChannels: List<Channel> = emptyList(),
    val vodAndSeriesChannels: List<Channel> = emptyList(),
    val recentChannels: List<Channel> = emptyList(),
    val totalCatalogSize: Int = 0,
    val customChannelsCount: Int = 0,
    val httpStreamsCount: Int = 0,
    val httpsStreamsCount: Int = 0,
    val countries: List<CountryFilterOption> = emptyList(),
    val categories: List<CategoryFilterOption> = emptyList(),
    val languages: List<LanguageFilterOption> = emptyList(),
    val filter: FilterState = FilterState(),
    val activeChannel: Channel? = null,
    val playableUrl: String? = null,
    val proxyMode: ProxyMode = ProxyMode.AUTO_LOCAL,
    val remoteProxyUrl: String = "",
    val availableUpdate: AppUpdateRelease? = null,
    val isCheckingUpdate: Boolean = false,
    val updateDownloadProgress: Float? = null,
    val updateMessage: String? = null,
    val updateDismissed: Boolean = false
)

data class UpdateUiState(
    val release: AppUpdateRelease? = null,
    val isChecking: Boolean = false,
    val downloadProgress: Float? = null,
    val message: String? = null,
    val dismissed: Boolean = false
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
    private val recentChannelsFlow = MutableStateFlow<List<Channel>>(emptyList())
    private val proxyModeFlow = MutableStateFlow(ProxyMode.AUTO_LOCAL)
    private val remoteProxyFlow = MutableStateFlow("")
    private val updateUiFlow = MutableStateFlow(UpdateUiState())

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
        streamProtocolCounts,
        updateUiFlow,
        recentChannelsFlow
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
        val updateState = values[12] as UpdateUiState
        @Suppress("UNCHECKED_CAST")
        val recent = values[13] as List<Channel>

        val all = custom + remote
        val scopedPool = when (filter.sourceFilter) {
            SourceFilter.ALL -> all
            SourceFilter.CUSTOM -> custom
            SourceFilter.IPTV_ORG -> remote
        }
        val q = filter.query.trim().lowercase()
        val filtered = scopedPool.asSequence().filter { ch ->
            if (filter.countryCode == "AFR") {
                if (!ch.isAfrican && ch.countryCode != "AFR") return@filter false
            } else if (filter.countryCode != "ALL" && ch.countryCode != filter.countryCode) {
                return@filter false
            }
            if (filter.channelType != null && ch.type != filter.channelType) return@filter false
            if (filter.categoryId != "all" && !ch.categories.contains(filter.categoryId)) return@filter false
            if (filter.languageCode != "all" && !ch.languages.contains(filter.languageCode)) return@filter false
            if (filter.resolution != ResolutionFilter.ALL && ch.resolutionBucket != filter.resolution.key) return@filter false
            if (filter.onlyHttp != null && ch.isHttp != filter.onlyHttp) return@filter false
            if (q.isNotEmpty()) {
                val hay = "${ch.name} ${ch.countryName} ${ch.sourceLabel} ${ch.network.orEmpty()} ${ch.categories.joinToString(" ")}".lowercase()
                if (!hay.includesQuery(q)) return@filter false
            }
            true
        }.take(800).toList()

        val resolvedUrl = active?.let {
            app.localProxy.resolvePlayableUrl(it, proxyMode, remoteProxy)
        }

        IptvUiState(
            isLoading = loading,
            error = error,
            filteredChannels = filtered,
            featuredChannels = all.filter { !it.logo.isNullOrBlank() && it.type == ChannelType.LIVE_24_7 }.take(12),
            africanChannels = all.filter { it.isAfrican && it.type == ChannelType.LIVE_24_7 }.take(24),
            frenchChannels = all.filter { it.countryCode == "FR" && it.type == ChannelType.LIVE_24_7 }.take(24),
            hdChannels = all.filter { it.resolutionBucket == "1080p" || it.resolutionBucket == "4k" }.take(20),
            vodAndSeriesChannels = all.filter { it.type == ChannelType.VOD || it.type == ChannelType.SERIES }.take(24),
            recentChannels = recent,
            totalCatalogSize = all.size,
            customChannelsCount = custom.size,
            httpStreamsCount = protoCounts.first,
            httpsStreamsCount = protoCounts.second,
            countries = countries,
            categories = categories,
            languages = languages,
            filter = filter,
            activeChannel = active,
            playableUrl = resolvedUrl,
            proxyMode = proxyMode,
            remoteProxyUrl = remoteProxy,
            availableUpdate = updateState.release,
            isCheckingUpdate = updateState.isChecking,
            updateDownloadProgress = updateState.downloadProgress,
            updateMessage = updateState.message,
            updateDismissed = updateState.dismissed
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), IptvUiState())

    init {
        ensureDefaultFavoriteList()
        restoreSavedSources()
        refreshCatalog()
        checkForUpdate(silent = true)
    }

    private fun ensureDefaultFavoriteList() {
        viewModelScope.launch {
            dao.insertFavoriteList(FavoriteListEntity(id = "default", name = "Favoris généraux"))
        }
    }

    private fun restoreSavedSources() {
        viewModelScope.launch(Dispatchers.IO) {
            val saved = runCatching { dao.getAllSourcesOnce() }.getOrDefault(emptyList())
            if (saved.isEmpty()) return@launch
            val restored = mutableListOf<Channel>()
            for (src in saved) {
                runCatching {
                    when (src.kind) {
                        SourceKind.XTREAM.name -> {
                            val user = src.username.orEmpty()
                            val pass = src.password.orEmpty()
                            if (src.url.isNotBlank() && user.isNotBlank() && pass.isNotBlank()) {
                                val loaded = app.xtreamRepository.loadXtreamCatalog(src.url, user, pass, src.name)
                                restored.addAll(loaded.map { it.copy(id = "${src.id}:${it.id}") })
                            }
                        }
                        SourceKind.M3U.name -> {
                            if (src.url.startsWith("http://", true) || src.url.startsWith("https://", true)) {
                                val req = Request.Builder()
                                    .url(src.url)
                                    .header("User-Agent", "KTP-IPTV-Android/1.0")
                                    .build()
                                app.okHttpClient.newCall(req).execute().use { resp ->
                                    if (resp.isSuccessful) {
                                        val body = resp.body?.string().orEmpty()
                                        restored.addAll(M3uParser.parse(body, src.name, src.id))
                                    }
                                }
                            }
                        }
                    }
                }
            }
            if (restored.isNotEmpty()) {
                customChannels.value = restored
                if (activeChannelFlow.value == null) {
                    activeChannelFlow.value = restored.firstOrNull()
                }
            }
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

    fun selectResolution(resolution: ResolutionFilter) {
        filterFlow.value = filterFlow.value.copy(resolution = resolution)
    }

    fun selectSourceFilter(sourceFilter: SourceFilter) {
        filterFlow.value = filterFlow.value.copy(sourceFilter = sourceFilter)
    }

    fun resetFilters() {
        filterFlow.value = FilterState()
    }

    fun playChannel(channel: Channel) {
        activeChannelFlow.value = channel
        recentChannelsFlow.value = (listOf(channel) + recentChannelsFlow.value.filterNot { it.id == channel.id }).take(20)
    }

    fun clearRecentHistory() {
        recentChannelsFlow.value = emptyList()
    }

    fun playNextChannel() {
        val list = uiState.value.filteredChannels
        if (list.isEmpty()) return
        val currentIdx = activeChannelFlow.value?.let { cur -> list.indexOfFirst { it.id == cur.id } } ?: -1
        playChannel(list[(currentIdx + 1) % list.size])
    }

    fun playPreviousChannel() {
        val list = uiState.value.filteredChannels
        if (list.isEmpty()) return
        val currentIdx = activeChannelFlow.value?.let { cur -> list.indexOfFirst { it.id == cur.id } } ?: 0
        val prevIdx = if (currentIdx <= 0) list.lastIndex else currentIdx - 1
        playChannel(list[prevIdx])
    }

    private fun String.includesQuery(q: String): Boolean = this.contains(q)

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
                val cleanUrl = url.trim()
                val content = withContext(Dispatchers.IO) {
                    val req = Request.Builder()
                        .url(cleanUrl)
                        .header("User-Agent", "IPTVSmartersPro")
                        .build()
                    app.okHttpClient.newCall(req).execute().use { resp ->
                        if (!resp.isSuccessful) throw IllegalStateException("HTTP ${resp.code}")
                        resp.body?.string().orEmpty()
                    }
                }
                val sourceId = "m3u-${System.currentTimeMillis()}"
                val label = name.trim().ifBlank { "Playlist M3U" }
                val parsed = M3uParser.parse(content, label, sourceId)
                if (parsed.isEmpty()) {
                    throw IllegalStateException("Aucun flux vidéo détecté dans cette playlist M3U")
                }
                customChannels.value = parsed + customChannels.value
                activeChannelFlow.value = parsed.first()
                dao.insertSource(
                    PlaylistSourceEntity(
                        id = sourceId,
                        name = label,
                        kind = SourceKind.M3U.name,
                        url = cleanUrl,
                        channelCount = parsed.size
                    )
                )
                onDone(Result.success(parsed.size))
            } catch (e: Exception) {
                onDone(Result.failure(e))
            }
        }
    }

    fun importM3uContent(
        name: String,
        content: String,
        originLabel: String = "Fichier local",
        onDone: (Result<Int>) -> Unit
    ) {
        viewModelScope.launch {
            try {
                val sourceId = "m3ufile-${System.currentTimeMillis()}"
                val label = name.trim().ifBlank { "Playlist locale" }
                val parsed = withContext(Dispatchers.Default) {
                    M3uParser.parse(content, label, sourceId)
                }
                if (parsed.isEmpty()) {
                    throw IllegalStateException("Aucun flux valide trouvé dans ce fichier .m3u")
                }
                customChannels.value = parsed + customChannels.value
                activeChannelFlow.value = parsed.first()
                dao.insertSource(
                    PlaylistSourceEntity(
                        id = sourceId,
                        name = label,
                        kind = SourceKind.M3U.name,
                        url = originLabel,
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
                val cleanHost = host.trim()
                val cleanUser = username.trim()
                val cleanPass = password.trim()
                val label = name.trim().ifBlank { cleanHost }
                val sourceId = "xtream-${System.currentTimeMillis()}"
                val loaded = app.xtreamRepository.loadXtreamCatalog(cleanHost, cleanUser, cleanPass, label)
                val tagged = loaded.map { it.copy(id = "$sourceId:${it.id}") }
                customChannels.value = tagged + customChannels.value
                tagged.firstOrNull()?.let { activeChannelFlow.value = it }
                dao.insertSource(
                    PlaylistSourceEntity(
                        id = sourceId,
                        name = label,
                        kind = SourceKind.XTREAM.name,
                        url = cleanHost,
                        username = cleanUser,
                        password = cleanPass,
                        channelCount = tagged.size
                    )
                )
                onDone(Result.success(tagged.size))
            } catch (e: Exception) {
                onDone(Result.failure(e))
            }
        }
    }

    fun removeSource(source: PlaylistSourceEntity) {
        viewModelScope.launch {
            dao.deleteSource(source.id)
            customChannels.value = customChannels.value.filterNot {
                it.id.startsWith("${source.id}:") || it.sourceLabel == source.name
            }
        }
    }

    fun checkForUpdate(silent: Boolean = false) {
        viewModelScope.launch {
            updateUiFlow.value = updateUiFlow.value.copy(
                isChecking = true,
                message = if (silent) null else "Vérification des mises à jour…"
            )
            try {
                val release = app.appUpdateManager.checkForUpdate()
                updateUiFlow.value = updateUiFlow.value.copy(
                    release = release,
                    isChecking = false,
                    dismissed = if (silent) false else updateUiFlow.value.dismissed,
                    message = when {
                        release == null -> if (silent) null else "Aucune release publiée trouvée."
                        release.isNewer -> "Nouvelle version disponible : ${release.tag}"
                        silent -> null
                        else -> "Application à jour (${release.tag})"
                    }
                )
            } catch (e: Exception) {
                updateUiFlow.value = updateUiFlow.value.copy(
                    isChecking = false,
                    message = if (silent) null else "Erreur de vérification : ${e.message}"
                )
            }
        }
    }

    fun downloadAndInstallUpdate(context: Context) {
        val release = updateUiFlow.value.release ?: return
        val apkUrl = release.apkUrl ?: run {
            updateUiFlow.value = updateUiFlow.value.copy(message = "Aucun APK attaché à cette release.")
            return
        }
        viewModelScope.launch {
            updateUiFlow.value = updateUiFlow.value.copy(
                downloadProgress = 0f,
                message = "Téléchargement de ${release.apkName ?: "la mise à jour"}…"
            )
            val result = app.appUpdateManager.downloadAndInstallApk(
                context = context,
                apkUrl = apkUrl,
                fileName = release.apkName ?: "ktp-iptv-${release.tag}.apk"
            ) { progress ->
                updateUiFlow.value = updateUiFlow.value.copy(downloadProgress = progress)
            }
            updateUiFlow.value = result.fold(
                onSuccess = {
                    updateUiFlow.value.copy(
                        downloadProgress = null,
                        message = "Installateur lancé."
                    )
                },
                onFailure = { err ->
                    updateUiFlow.value.copy(
                        downloadProgress = null,
                        message = "Échec : ${err.message}"
                    )
                }
            )
        }
    }

    fun dismissUpdatePrompt() {
        updateUiFlow.value = updateUiFlow.value.copy(dismissed = true)
    }
}
