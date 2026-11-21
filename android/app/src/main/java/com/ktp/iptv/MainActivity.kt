package com.ktp.iptv

import android.content.pm.ActivityInfo
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LiveTv
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Source
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import com.ktp.iptv.data.model.Channel
import com.ktp.iptv.data.model.ChannelType
import com.ktp.iptv.ui.screens.CatalogScreen
import com.ktp.iptv.ui.screens.FavoritesScreen
import com.ktp.iptv.ui.screens.HomeShowcaseScreen
import com.ktp.iptv.ui.screens.InAppUpdateDialog
import com.ktp.iptv.ui.screens.OttDrawerContent
import com.ktp.iptv.ui.screens.ProxySettingsScreen
import com.ktp.iptv.ui.screens.SourcesScreen
import com.ktp.iptv.ui.theme.KtpIptvTheme
import com.ktp.iptv.ui.theme.ObsidianBg
import com.ktp.iptv.ui.theme.ObsidianSurface
import com.ktp.iptv.ui.viewmodel.IptvViewModel
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    private val viewModel: IptvViewModel by viewModels()

    @OptIn(ExperimentalMaterial3Api::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        setContent {
            KtpIptvTheme {
                val context = LocalContext.current
                val state by viewModel.uiState.collectAsState()
                val favLists by viewModel.favoriteLists.collectAsState()
                val favChannels by viewModel.favoriteChannels.collectAsState()
                val sources by viewModel.savedSources.collectAsState()
                var selectedTab by remember { mutableIntStateOf(0) }
                var isFullscreen by remember { mutableStateOf(false) }

                val drawerState = rememberDrawerState(DrawerValue.Closed)
                val scope = rememberCoroutineScope()

                val favoriteIds = remember(favChannels) {
                    favChannels.map { it.channelId }.toSet()
                }

                val toggleFullscreen = {
                    isFullscreen = !isFullscreen
                    requestedOrientation = if (isFullscreen) {
                        ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                    } else {
                        ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
                    }
                }

                ModalNavigationDrawer(
                    drawerState = drawerState,
                    gesturesEnabled = !isFullscreen,
                    drawerContent = {
                        OttDrawerContent(
                            state = state,
                            sourcesCount = sources.size,
                            onRefreshCatalog = viewModel::refreshCatalog,
                            onOpenRadio = {
                                viewModel.selectChannelType(ChannelType.RADIO)
                                selectedTab = 1
                            },
                            onClearHistory = viewModel::clearRecentHistory,
                            onOpenSources = { selectedTab = 3 },
                            onOpenProxyAndUpdate = { selectedTab = 4 },
                            onCloseDrawer = { scope.launch { drawerState.close() } }
                        )
                    }
                ) {
                    Scaffold(
                        containerColor = ObsidianBg,
                        topBar = {
                            if (!isFullscreen) {
                                TopAppBar(
                                    colors = TopAppBarDefaults.topAppBarColors(
                                        containerColor = ObsidianBg,
                                        titleContentColor = Color.White
                                    ),
                                    navigationIcon = {
                                        IconButton(onClick = { scope.launch { drawerState.open() } }) {
                                            Icon(Icons.Filled.Menu, contentDescription = "Menu", tint = Color.White)
                                        }
                                    },
                                    title = {
                                        val title = when (selectedTab) {
                                            0 -> "Accueil"
                                            1 -> "Live TV"
                                            2 -> "Favoris"
                                            3 -> "Sources"
                                            else -> "Proxy & MàJ"
                                        }
                                        Text(title, fontWeight = FontWeight.Bold)
                                    },
                                    actions = {
                                        IconButton(onClick = { selectedTab = 4 }) {
                                            Icon(Icons.Filled.Settings, contentDescription = "Proxy & Mise à jour", tint = Color.White)
                                        }
                                    }
                                )
                            }
                        },
                        bottomBar = {
                            if (!isFullscreen) {
                                NavigationBar(containerColor = ObsidianSurface) {
                                    NavigationBarItem(
                                        selected = selectedTab == 0,
                                        onClick = { selectedTab = 0 },
                                        icon = { Icon(Icons.Filled.Home, contentDescription = null) },
                                        label = { Text("Accueil") }
                                    )
                                    NavigationBarItem(
                                        selected = selectedTab == 1,
                                        onClick = { selectedTab = 1 },
                                        icon = { Icon(Icons.Filled.LiveTv, contentDescription = null) },
                                        label = { Text("Live TV") }
                                    )
                                    NavigationBarItem(
                                        selected = selectedTab == 2,
                                        onClick = { selectedTab = 2 },
                                        icon = { Icon(Icons.Filled.Bookmark, contentDescription = null) },
                                        label = { Text("Favoris") }
                                    )
                                    NavigationBarItem(
                                        selected = selectedTab == 3,
                                        onClick = { selectedTab = 3 },
                                        icon = { Icon(Icons.Filled.Source, contentDescription = null) },
                                        label = { Text("Sources") }
                                    )
                                }
                            }
                        }
                    ) { padding ->
                        Box(modifier = if (isFullscreen) Modifier else Modifier.padding(padding)) {
                            when (selectedTab) {
                                0 -> HomeShowcaseScreen(
                                    state = state,
                                    favoriteIds = favoriteIds,
                                    onPlayAndOpenLive = { ch ->
                                        viewModel.playChannel(ch)
                                        selectedTab = 1
                                    },
                                    onToggleFavorite = { viewModel.toggleFavorite(it) },
                                    onFilterResolutionAndOpenLive = { res ->
                                        viewModel.selectResolution(res)
                                        selectedTab = 1
                                    },
                                    onOpenCategoryAndLive = { catId ->
                                        viewModel.selectCategory(catId)
                                        selectedTab = 1
                                    }
                                )
                                1 -> CatalogScreen(
                                    state = state,
                                    favoriteIds = favoriteIds,
                                    isFullscreen = isFullscreen,
                                    onToggleFullscreen = toggleFullscreen,
                                    onQueryChange = viewModel::updateQuery,
                                    onSelectCountry = viewModel::selectCountry,
                                    onSelectType = viewModel::selectChannelType,
                                    onSelectCategory = viewModel::selectCategory,
                                    onSelectLanguage = viewModel::selectLanguage,
                                    onSelectResolution = viewModel::selectResolution,
                                    onResetFilters = viewModel::resetFilters,
                                    onPlayChannel = viewModel::playChannel,
                                    onPrevChannel = viewModel::playPreviousChannel,
                                    onNextChannel = viewModel::playNextChannel,
                                    onToggleFavorite = { viewModel.toggleFavorite(it) }
                                )
                                2 -> FavoritesScreen(
                                    lists = favLists,
                                    favorites = favChannels,
                                    onCreateList = viewModel::createFavoriteList,
                                    onDeleteList = viewModel::deleteFavoriteList,
                                    onPlayFavorite = { fav ->
                                        viewModel.playChannel(
                                            Channel(
                                                id = fav.channelId,
                                                name = fav.name,
                                                url = fav.url,
                                                logo = fav.logo,
                                                countryCode = fav.countryCode,
                                                countryName = fav.countryName,
                                                countryFlag = fav.countryFlag,
                                                categories = listOf(fav.category),
                                                type = runCatching { ChannelType.valueOf(fav.channelType) }
                                                    .getOrDefault(ChannelType.LIVE_24_7),
                                                userAgent = fav.userAgent,
                                                referrer = fav.referrer,
                                                isHttp = fav.url.startsWith("http://", true)
                                            )
                                        )
                                        selectedTab = 1
                                    },
                                    onRemoveFavorite = { fav ->
                                        viewModel.toggleFavorite(
                                            Channel(id = fav.channelId, name = fav.name, url = fav.url),
                                            fav.listId
                                        )
                                    }
                                )
                                3 -> SourcesScreen(
                                    sources = sources,
                                    onImportM3u = viewModel::importM3uUrl,
                                    onImportXtream = viewModel::importXtream,
                                    onRemoveSource = viewModel::removeSource
                                )
                                else -> ProxySettingsScreen(
                                    state = state,
                                    onSelectProxyMode = viewModel::setProxyMode,
                                    onRemoteProxyChange = viewModel::setRemoteProxyUrl,
                                    onRefreshCatalog = viewModel::refreshCatalog,
                                    onCheckUpdate = { viewModel.checkForUpdate(silent = false) },
                                    onInstallUpdate = { viewModel.downloadAndInstallUpdate(context) }
                                )
                            }
                        }

                        InAppUpdateDialog(
                            state = state,
                            onInstall = { viewModel.downloadAndInstallUpdate(context) },
                            onDismiss = viewModel::dismissUpdatePrompt
                        )
                    }
                }
            }
        }
    }
}
