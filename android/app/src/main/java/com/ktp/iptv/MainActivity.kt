package com.ktp.iptv

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.LiveTv
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Source
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.ktp.iptv.data.model.Channel
import com.ktp.iptv.data.model.ChannelType
import com.ktp.iptv.ui.screens.CatalogScreen
import com.ktp.iptv.ui.screens.FavoritesScreen
import com.ktp.iptv.ui.screens.ProxySettingsScreen
import com.ktp.iptv.ui.screens.SourcesScreen
import com.ktp.iptv.ui.theme.KtpIptvTheme
import com.ktp.iptv.ui.theme.ObsidianBg
import com.ktp.iptv.ui.theme.ObsidianSurface
import com.ktp.iptv.ui.viewmodel.IptvViewModel

class MainActivity : ComponentActivity() {

    private val viewModel: IptvViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        setContent {
            KtpIptvTheme {
                val state by viewModel.uiState.collectAsState()
                val favLists by viewModel.favoriteLists.collectAsState()
                val favChannels by viewModel.favoriteChannels.collectAsState()
                val sources by viewModel.savedSources.collectAsState()
                var selectedTab by remember { mutableIntStateOf(0) }

                val favoriteIds = remember(favChannels) {
                    favChannels.map { it.channelId }.toSet()
                }

                Scaffold(
                    containerColor = ObsidianBg,
                    bottomBar = {
                        NavigationBar(containerColor = ObsidianSurface) {
                            NavigationBarItem(
                                selected = selectedTab == 0,
                                onClick = { selectedTab = 0 },
                                icon = { Icon(Icons.Filled.LiveTv, contentDescription = null) },
                                label = { Text("Chaînes") }
                            )
                            NavigationBarItem(
                                selected = selectedTab == 1,
                                onClick = { selectedTab = 1 },
                                icon = { Icon(Icons.Filled.Bookmark, contentDescription = null) },
                                label = { Text("Favoris") }
                            )
                            NavigationBarItem(
                                selected = selectedTab == 2,
                                onClick = { selectedTab = 2 },
                                icon = { Icon(Icons.Filled.Source, contentDescription = null) },
                                label = { Text("Sources") }
                            )
                            NavigationBarItem(
                                selected = selectedTab == 3,
                                onClick = { selectedTab = 3 },
                                icon = { Icon(Icons.Filled.Settings, contentDescription = null) },
                                label = { Text("Proxy") }
                            )
                        }
                    }
                ) { padding ->
                    Box(modifier = Modifier.padding(padding)) {
                        when (selectedTab) {
                            0 -> CatalogScreen(
                                state = state,
                                favoriteIds = favoriteIds,
                                onQueryChange = viewModel::updateQuery,
                                onSelectCountry = viewModel::selectCountry,
                                onSelectType = viewModel::selectChannelType,
                                onSelectCategory = viewModel::selectCategory,
                                onSelectLanguage = viewModel::selectLanguage,
                                onResetFilters = viewModel::resetFilters,
                                onPlayChannel = viewModel::playChannel,
                                onToggleFavorite = { viewModel.toggleFavorite(it) }
                            )
                            1 -> FavoritesScreen(
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
                                    selectedTab = 0
                                },
                                onRemoveFavorite = { fav ->
                                    viewModel.toggleFavorite(
                                        Channel(id = fav.channelId, name = fav.name, url = fav.url),
                                        fav.listId
                                    )
                                }
                            )
                            2 -> SourcesScreen(
                                sources = sources,
                                onImportM3u = viewModel::importM3uUrl,
                                onImportXtream = viewModel::importXtream,
                                onRemoveSource = viewModel::removeSource
                            )
                            else -> ProxySettingsScreen(
                                state = state,
                                onSelectProxyMode = viewModel::setProxyMode,
                                onRemoteProxyChange = viewModel::setRemoteProxyUrl,
                                onRefreshCatalog = viewModel::refreshCatalog
                            )
                        }
                    }
                }
            }
        }
    }
}
