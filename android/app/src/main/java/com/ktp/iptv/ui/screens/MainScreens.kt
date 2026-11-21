package com.ktp.iptv.ui.screens

import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.BookmarkBorder
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.Radio
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Source
import androidx.compose.material.icons.filled.SystemUpdate
import androidx.compose.material.icons.filled.Tv
import androidx.compose.material.icons.filled.UploadFile
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.ktp.iptv.BuildConfig
import com.ktp.iptv.data.local.FavoriteChannelEntity
import com.ktp.iptv.data.local.FavoriteListEntity
import com.ktp.iptv.data.local.PlaylistSourceEntity
import com.ktp.iptv.data.model.Channel
import com.ktp.iptv.data.model.ChannelType
import com.ktp.iptv.data.model.ProxyMode
import com.ktp.iptv.data.model.ResolutionFilter
import com.ktp.iptv.data.model.SourceFilter
import com.ktp.iptv.ui.player.ExoPlayerView
import com.ktp.iptv.ui.theme.AmberFavorite
import com.ktp.iptv.ui.theme.CobaltLight
import com.ktp.iptv.ui.theme.CrimsonLive
import com.ktp.iptv.ui.theme.ObsidianBg
import com.ktp.iptv.ui.theme.ObsidianSurface
import com.ktp.iptv.ui.theme.ObsidianSurfaceVariant
import com.ktp.iptv.ui.viewmodel.IptvUiState

private enum class ActivePicker { COUNTRY, TYPE, CATEGORY, LANGUAGE, RESOLUTION, SOURCE }
private enum class CatalogFolderMode { RECENT }

@Composable
fun OttDrawerContent(
    state: IptvUiState,
    sourcesCount: Int,
    onRefreshCatalog: () -> Unit,
    onOpenAfrica: () -> Unit,
    onOpenFrance: () -> Unit,
    onOpenRadio: () -> Unit,
    onClearHistory: () -> Unit,
    onOpenSources: () -> Unit,
    onOpenProxyAndUpdate: () -> Unit,
    onCloseDrawer: () -> Unit
) {
    ModalDrawerSheet(
        drawerContainerColor = ObsidianBg,
        modifier = Modifier.width(300.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxHeight()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Surface(
                color = ObsidianSurface,
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(48.dp)
                            .clip(CircleShape)
                            .background(CrimsonLive.copy(alpha = 0.2f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Filled.Tv, contentDescription = null, tint = CrimsonLive)
                    }
                    Spacer(Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text("KTP IPTV", fontWeight = FontWeight.Bold, color = Color.White)
                        Text(
                            text = "${state.totalCatalogSize} flux · $sourcesCount source(s)",
                            style = MaterialTheme.typography.bodySmall,
                            color = Color(0xFF94A3B8)
                        )
                        Text(
                            text = "v${BuildConfig.VERSION_NAME}",
                            style = MaterialTheme.typography.labelSmall,
                            color = CobaltLight
                        )
                    }
                }
            }

            Spacer(Modifier.height(4.dp))
            Text("Actions", style = MaterialTheme.typography.labelLarge, color = Color(0xFF94A3B8))

            DrawerActionRow(Icons.Filled.Refresh, "Actualiser le catalogue", CobaltLight) {
                onRefreshCatalog()
                onCloseDrawer()
            }
            DrawerActionRow(Icons.Filled.Source, "Sources M3U & Xtream", Color(0xFFF59E0B)) {
                onOpenSources()
                onCloseDrawer()
            }
            DrawerActionRow(Icons.Filled.Settings, "Proxy HTTP/HTTPS", Color(0xFF38BDF8)) {
                onOpenProxyAndUpdate()
                onCloseDrawer()
            }
            DrawerActionRow(Icons.Filled.SystemUpdate, "Mise à jour In-App", Color(0xFF34D399)) {
                onOpenProxyAndUpdate()
                onCloseDrawer()
            }

            Spacer(Modifier.height(4.dp))
            Text("Raccourcis", style = MaterialTheme.typography.labelLarge, color = Color(0xFF94A3B8))

            DrawerActionRow(Icons.Filled.Public, "Chaînes Africaines (🌍)", Color(0xFF34D399)) {
                onOpenAfrica()
                onCloseDrawer()
            }
            DrawerActionRow(Icons.Filled.Tv, "France & TNT / Canal+", Color(0xFF60A5FA)) {
                onOpenFrance()
                onCloseDrawer()
            }
            DrawerActionRow(Icons.Filled.Radio, "Chaînes Radio", Color(0xFFE2E8F0)) {
                onOpenRadio()
                onCloseDrawer()
            }
            DrawerActionRow(Icons.Filled.History, "Effacer l'historique récent", CrimsonLive) {
                onClearHistory()
                onCloseDrawer()
            }
        }
    }
}

@Composable
private fun DrawerActionRow(
    icon: ImageVector,
    label: String,
    tint: Color,
    onClick: () -> Unit
) {
    Surface(
        color = ObsidianSurface,
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(12.dp))
            Text(
                text = label,
                color = Color.White,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.weight(1f)
            )
            Icon(
                Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = null,
                tint = Color(0xFF64748B)
            )
        }
    }
}

@Composable
fun HomeShowcaseScreen(
    state: IptvUiState,
    favoriteIds: Set<String>,
    onPlayAndOpenLive: (Channel) -> Unit,
    onToggleFavorite: (Channel) -> Unit,
    onFilterResolutionAndOpenLive: (ResolutionFilter) -> Unit,
    onOpenCountryAndLive: (String) -> Unit,
    onOpenCategoryAndLive: (String) -> Unit
) {
    val heroPool = remember(state.featuredChannels, state.filteredChannels) {
        state.featuredChannels.ifEmpty { state.filteredChannels.take(5) }.take(5)
    }
    var heroIdx by remember { mutableIntStateOf(0) }
    val heroChannel = heroPool.getOrNull(heroIdx % heroPool.size.coerceAtLeast(1))

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp)
    ) {
        item {
            if (heroChannel != null) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(310.dp)
                        .padding(horizontal = 12.dp)
                        .clip(RoundedCornerShape(20.dp))
                        .background(
                            Brush.linearGradient(
                                listOf(Color(0xFF172554), ObsidianSurface, Color(0xFF090D16))
                            )
                        )
                ) {
                    if (!heroChannel.logo.isNullOrBlank()) {
                        AsyncImage(
                            model = heroChannel.logo,
                            contentDescription = heroChannel.name,
                            contentScale = ContentScale.Fit,
                            modifier = Modifier
                                .align(Alignment.TopCenter)
                                .padding(top = 36.dp)
                                .size(140.dp)
                        )
                    }

                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(
                                Brush.verticalGradient(
                                    listOf(
                                        Color.Transparent,
                                        Color.Black.copy(alpha = 0.55f),
                                        Color.Black.copy(alpha = 0.92f)
                                    )
                                )
                            )
                    )

                    Column(
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .fillMaxWidth()
                            .padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(
                            text = "${heroChannel.countryCode} | ${heroChannel.name}",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                            color = Color.White,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Spacer(Modifier.height(4.dp))
                        Text(
                            text = "${heroChannel.countryFlag} ${heroChannel.countryName} · ${heroChannel.categories.firstOrNull().orEmpty()} · ${heroChannel.quality ?: "HD"}",
                            style = MaterialTheme.typography.bodySmall,
                            color = Color(0xFFCBD5E1)
                        )
                        Spacer(Modifier.height(14.dp))

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceEvenly,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(
                                horizontalAlignment = Alignment.CenterHorizontally,
                                modifier = Modifier.clickable {
                                    heroIdx = (heroIdx + 1) % heroPool.size.coerceAtLeast(1)
                                }
                            ) {
                                Icon(Icons.Filled.Refresh, contentDescription = "Suivant", tint = Color.White)
                                Text("Suivant", style = MaterialTheme.typography.labelSmall, color = Color(0xFFCBD5E1))
                            }

                            Button(
                                onClick = { onPlayAndOpenLive(heroChannel) },
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = Color.White,
                                    contentColor = Color.Black
                                ),
                                shape = RoundedCornerShape(10.dp),
                                contentPadding = PaddingValues(horizontal = 24.dp, vertical = 10.dp)
                            ) {
                                Icon(Icons.Filled.PlayArrow, contentDescription = null)
                                Spacer(Modifier.width(6.dp))
                                Text("Lire", fontWeight = FontWeight.Bold)
                            }

                            val isFav = favoriteIds.contains(heroChannel.id)
                            Column(
                                horizontalAlignment = Alignment.CenterHorizontally,
                                modifier = Modifier.clickable { onToggleFavorite(heroChannel) }
                            ) {
                                Icon(
                                    imageVector = if (isFav) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                                    contentDescription = "Favoris",
                                    tint = if (isFav) CrimsonLive else Color.White
                                )
                                Text("Favori", style = MaterialTheme.typography.labelSmall, color = Color(0xFFCBD5E1))
                            }
                        }

                        Spacer(Modifier.height(10.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            heroPool.forEachIndexed { idx, _ ->
                                Box(
                                    modifier = Modifier
                                        .size(if (idx == heroIdx) 8.dp else 6.dp)
                                        .clip(CircleShape)
                                        .background(if (idx == heroIdx) CrimsonLive else Color(0xFF64748B))
                                        .clickable { heroIdx = idx }
                                )
                            }
                        }
                    }
                }
            }
        }

        // Quick Resolution Filter Strip
        item {
            Column(Modifier.padding(horizontal = 12.dp)) {
                Text(
                    text = "Explorer par résolution",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
                Spacer(Modifier.height(8.dp))
                Row(
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    ResolutionFilter.entries.forEach { res ->
                        FilterChip(
                            selected = state.filter.resolution == res,
                            onClick = { onFilterResolutionAndOpenLive(res) },
                            label = { Text(res.label) }
                        )
                    }
                }
            }
        }

        // Regional & French Bouquets quick shortcuts
        item {
            Column(Modifier.padding(horizontal = 12.dp)) {
                Text(
                    text = "Bouquets Afrique & France",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
                Spacer(Modifier.height(8.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Surface(
                        color = ObsidianSurface,
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier
                            .weight(1f)
                            .clickable { onOpenCountryAndLive("AFR") }
                    ) {
                        Column(Modifier.padding(14.dp)) {
                            Text("🌍 Afrique complète", fontWeight = FontWeight.Bold, color = Color.White)
                            Spacer(Modifier.height(4.dp))
                            val afrCount = state.countries.find { it.code == "AFR" }?.count ?: state.africanChannels.size
                            Text(
                                text = "$afrCount flux africains",
                                style = MaterialTheme.typography.bodySmall,
                                color = CobaltLight
                            )
                        }
                    }
                    Surface(
                        color = ObsidianSurface,
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier
                            .weight(1f)
                            .clickable { onOpenCountryAndLive("FR") }
                    ) {
                        Column(Modifier.padding(14.dp)) {
                            Text("🇫🇷 France & TNT", fontWeight = FontWeight.Bold, color = Color.White)
                            Spacer(Modifier.height(4.dp))
                            val frCount = state.countries.find { it.code == "FR" }?.count ?: state.frenchChannels.size
                            Text(
                                text = "$frCount chaînes FR / Canal+",
                                style = MaterialTheme.typography.bodySmall,
                                color = CobaltLight
                            )
                        }
                    }
                }
            }
        }

        if (state.recentChannels.isNotEmpty()) {
            item {
                HorizontalChannelCarousel(
                    title = "Récemment regardées",
                    channels = state.recentChannels,
                    onClickChannel = onPlayAndOpenLive
                )
            }
        }

        if (state.africanChannels.isNotEmpty()) {
            item {
                HorizontalChannelCarousel(
                    title = "Chaînes Africaines",
                    channels = state.africanChannels,
                    onClickChannel = onPlayAndOpenLive
                )
            }
        }

        if (state.frenchChannels.isNotEmpty()) {
            item {
                HorizontalChannelCarousel(
                    title = "France & TNT / Canal+",
                    channels = state.frenchChannels,
                    onClickChannel = onPlayAndOpenLive
                )
            }
        }

        if (state.hdChannels.isNotEmpty()) {
            item {
                HorizontalChannelCarousel(
                    title = "Chaînes Haute Définition (1080p / 4K)",
                    channels = state.hdChannels,
                    onClickChannel = onPlayAndOpenLive
                )
            }
        }

        if (state.featuredChannels.isNotEmpty()) {
            item {
                HorizontalChannelCarousel(
                    title = "Chaînes Live recommandées",
                    channels = state.featuredChannels,
                    onClickChannel = onPlayAndOpenLive
                )
            }
        }

        if (state.vodAndSeriesChannels.isNotEmpty()) {
            item {
                HorizontalChannelCarousel(
                    title = "Films & Séries (VOD / Xtream)",
                    channels = state.vodAndSeriesChannels,
                    onClickChannel = onPlayAndOpenLive
                )
            }
        }

        if (state.categories.isNotEmpty()) {
            item {
                Column(Modifier.padding(horizontal = 12.dp)) {
                    Text(
                        text = "Catégories populaires",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                    Spacer(Modifier.height(8.dp))
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        items(state.categories.take(12)) { cat ->
                            Surface(
                                color = ObsidianSurface,
                                shape = RoundedCornerShape(14.dp),
                                modifier = Modifier.clickable { onOpenCategoryAndLive(cat.id) }
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Icon(Icons.Filled.Folder, contentDescription = null, tint = AmberFavorite, modifier = Modifier.size(18.dp))
                                    Spacer(Modifier.width(8.dp))
                                    Text("${cat.name} (${cat.count})", color = Color.White, style = MaterialTheme.typography.labelLarge)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun HorizontalChannelCarousel(
    title: String,
    channels: List<Channel>,
    onClickChannel: (Channel) -> Unit
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            color = Color.White,
            modifier = Modifier.padding(horizontal = 12.dp)
        )
        Spacer(Modifier.height(8.dp))
        LazyRow(
            contentPadding = PaddingValues(horizontal = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            items(channels, key = { "${title}_${it.id}" }) { ch ->
                Surface(
                    color = ObsidianSurface,
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier
                        .width(126.dp)
                        .clickable { onClickChannel(ch) }
                ) {
                    Column(modifier = Modifier.padding(10.dp)) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(86.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(ObsidianSurfaceVariant),
                            contentAlignment = Alignment.Center
                        ) {
                            if (!ch.logo.isNullOrBlank()) {
                                AsyncImage(
                                    model = ch.logo,
                                    contentDescription = ch.name,
                                    modifier = Modifier.size(58.dp)
                                )
                            } else {
                                Text(
                                    text = ch.name.take(2).uppercase(),
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold,
                                    color = CobaltLight
                                )
                            }

                            val resBadge = ch.quality ?: if (ch.resolutionBucket != "unknown") ch.resolutionBucket.uppercase() else ""
                            if (resBadge.isNotBlank()) {
                                Surface(
                                    color = CobaltLight,
                                    shape = RoundedCornerShape(6.dp),
                                    modifier = Modifier
                                        .align(Alignment.TopStart)
                                        .padding(6.dp)
                                ) {
                                    Text(
                                        text = resBadge,
                                        color = Color.Black,
                                        style = MaterialTheme.typography.labelSmall,
                                        fontWeight = FontWeight.Bold,
                                        modifier = Modifier.padding(horizontal = 5.dp, vertical = 2.dp)
                                    )
                                }
                            }
                        }
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text = "${ch.countryCode} | ${ch.name}",
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Medium,
                            color = Color.White,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CatalogScreen(
    state: IptvUiState,
    favoriteIds: Set<String>,
    isFullscreen: Boolean,
    onToggleFullscreen: () -> Unit,
    onQueryChange: (String) -> Unit,
    onSelectCountry: (String) -> Unit,
    onSelectType: (ChannelType?) -> Unit,
    onSelectCategory: (String) -> Unit,
    onSelectLanguage: (String) -> Unit,
    onSelectResolution: (ResolutionFilter) -> Unit,
    onSelectSourceFilter: (SourceFilter) -> Unit,
    onResetFilters: () -> Unit,
    onPlayChannel: (Channel) -> Unit,
    onPrevChannel: () -> Unit,
    onNextChannel: () -> Unit,
    onToggleFavorite: (Channel) -> Unit,
    onOpenFavorites: () -> Unit
) {
    var activePicker by remember { mutableStateOf<ActivePicker?>(null) }
    var showFolderView by remember { mutableStateOf(false) }
    var folderMode by remember { mutableStateOf<CatalogFolderMode?>(null) }

    if (isFullscreen) {
        ExoPlayerView(
            playableUrl = state.playableUrl,
            channel = state.activeChannel,
            isFullscreen = true,
            onToggleFullscreen = onToggleFullscreen,
            onPrevChannel = onPrevChannel,
            onNextChannel = onNextChannel,
            modifier = Modifier.fillMaxSize()
        )
        return
    }

    val displayedChannels = remember(state.filteredChannels, state.recentChannels, folderMode) {
        if (folderMode == CatalogFolderMode.RECENT) state.recentChannels else state.filteredChannels
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 12.dp)
    ) {
        ExoPlayerView(
            playableUrl = state.playableUrl,
            channel = state.activeChannel,
            isFullscreen = false,
            onToggleFullscreen = onToggleFullscreen,
            onPrevChannel = onPrevChannel,
            onNextChannel = onNextChannel
        )

        state.activeChannel?.let { active ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp, bottom = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = active.name,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        text = "${active.countryFlag} ${active.countryName} · ${active.categories.firstOrNull().orEmpty()} · ${active.quality ?: "Auto"} · ${if (active.isHttp) "HTTP→Proxy" else "HTTPS"}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                IconButton(onClick = { onToggleFavorite(active) }) {
                    val isFav = favoriteIds.contains(active.id)
                    Icon(
                        imageVector = if (isFav) Icons.Filled.Bookmark else Icons.Filled.BookmarkBorder,
                        contentDescription = "Favoris",
                        tint = if (isFav) AmberFavorite else Color.White
                    )
                }
            }
        }

        OutlinedTextField(
            value = state.filter.query,
            onValueChange = {
                folderMode = null
                onQueryChange(it)
            },
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 4.dp),
            singleLine = true,
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
            trailingIcon = {
                if (state.filter.query.isNotEmpty()) {
                    IconButton(onClick = { onQueryChange("") }) {
                        Icon(Icons.Filled.Close, contentDescription = "Effacer")
                    }
                }
            },
            placeholder = { Text("Recherche rapide (chaîne, pays, réseau…)") },
            shape = RoundedCornerShape(14.dp)
        )

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            FilterChip(
                selected = showFolderView,
                onClick = { showFolderView = !showFolderView },
                label = { Text(if (showFolderView) "Vue Chaînes" else "Vue Dossiers") }
            )
            if (folderMode == CatalogFolderMode.RECENT) {
                FilterChip(
                    selected = true,
                    onClick = { folderMode = null },
                    label = { Text("Historique récent ×") }
                )
            }
            FilterChip(
                selected = state.filter.sourceFilter != SourceFilter.ALL,
                onClick = { activePicker = ActivePicker.SOURCE },
                label = {
                    val lbl = when (state.filter.sourceFilter) {
                        SourceFilter.ALL -> "Source"
                        SourceFilter.CUSTOM -> "Mes sources (${state.customChannelsCount})"
                        SourceFilter.IPTV_ORG -> "iptv-org"
                    }
                    Text(lbl)
                }
            )
            FilterChip(
                selected = state.filter.resolution != ResolutionFilter.ALL,
                onClick = { activePicker = ActivePicker.RESOLUTION },
                label = { Text(if (state.filter.resolution == ResolutionFilter.ALL) "Résolution" else state.filter.resolution.label) }
            )
            FilterChip(
                selected = state.filter.countryCode != "ALL",
                onClick = { activePicker = ActivePicker.COUNTRY },
                label = {
                    val countryLabel = state.countries.find { it.code == state.filter.countryCode }?.name ?: "Pays"
                    Text(if (state.filter.countryCode == "ALL") "Pays" else countryLabel)
                }
            )
            FilterChip(
                selected = state.filter.channelType != null,
                onClick = { activePicker = ActivePicker.TYPE },
                label = { Text(state.filter.channelType?.label ?: "Type") }
            )
            FilterChip(
                selected = state.filter.categoryId != "all",
                onClick = { activePicker = ActivePicker.CATEGORY },
                label = {
                    val catLabel = state.categories.find { it.id == state.filter.categoryId }?.name ?: "Catégorie"
                    Text(if (state.filter.categoryId == "all") "Catégorie" else catLabel)
                }
            )
            FilterChip(
                selected = state.filter.languageCode != "all",
                onClick = { activePicker = ActivePicker.LANGUAGE },
                label = {
                    val langLabel = state.languages.find { it.code == state.filter.languageCode }?.name ?: "Langue"
                    Text(if (state.filter.languageCode == "all") "Langue" else langLabel)
                }
            )
            if (state.filter.countryCode != "ALL" ||
                state.filter.channelType != null ||
                state.filter.categoryId != "all" ||
                state.filter.languageCode != "all" ||
                state.filter.resolution != ResolutionFilter.ALL ||
                state.filter.sourceFilter != SourceFilter.ALL ||
                folderMode != null
            ) {
                FilterChip(
                    selected = false,
                    onClick = {
                        folderMode = null
                        onResetFilters()
                    },
                    label = { Text("Réinitialiser") }
                )
            }
        }

        Spacer(Modifier.height(6.dp))

        when {
            state.isLoading -> {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            state.error != null -> {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(text = state.error, color = Color(0xFFFCA5A5))
                }
            }
            showFolderView -> {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(bottom = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    item {
                        FolderRow("Toutes les chaînes", state.totalCatalogSize) {
                            folderMode = null
                            onResetFilters()
                            showFolderView = false
                        }
                    }
                    item {
                        FolderRow("🌍 Chaînes Africaines", state.countries.find { it.code == "AFR" }?.count ?: state.africanChannels.size) {
                            folderMode = null
                            onResetFilters()
                            onSelectCountry("AFR")
                            showFolderView = false
                        }
                    }
                    item {
                        FolderRow("🇫🇷 France & TNT / Canal+", state.countries.find { it.code == "FR" }?.count ?: state.frenchChannels.size) {
                            folderMode = null
                            onResetFilters()
                            onSelectCountry("FR")
                            showFolderView = false
                        }
                    }
                    if (state.customChannelsCount > 0) {
                        item {
                            FolderRow("Mes playlists M3U & Xtream", state.customChannelsCount) {
                                folderMode = null
                                onResetFilters()
                                onSelectSourceFilter(SourceFilter.CUSTOM)
                                showFolderView = false
                            }
                        }
                    }
                    item {
                        FolderRow("Récemment regardées", state.recentChannels.size) {
                            folderMode = CatalogFolderMode.RECENT
                            showFolderView = false
                        }
                    }
                    item {
                        FolderRow("Mes favoris", favoriteIds.size) {
                            showFolderView = false
                            onOpenFavorites()
                        }
                    }
                    items(state.categories) { cat ->
                        FolderRow(cat.name, cat.count) {
                            folderMode = null
                            onSelectCategory(cat.id)
                            showFolderView = false
                        }
                    }
                }
            }
            displayedChannels.isEmpty() -> {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(
                            text = if (folderMode == CatalogFolderMode.RECENT)
                                "Aucune chaîne récemment regardée"
                            else
                                "Aucune chaîne ne correspond à ces filtres",
                            color = Color(0xFF94A3B8)
                        )
                        TextButton(onClick = {
                            folderMode = null
                            onResetFilters()
                        }) {
                            Text("Afficher tout le catalogue")
                        }
                    }
                }
            }
            else -> {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(bottom = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(displayedChannels, key = { it.id }) { channel ->
                        val isPlaying = state.activeChannel?.id == channel.id
                        val isFav = favoriteIds.contains(channel.id)
                        Surface(
                            color = if (isPlaying) Color(0xFF1E3A8A).copy(alpha = 0.35f) else ObsidianSurface,
                            shape = RoundedCornerShape(14.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { onPlayChannel(channel) }
                        ) {
                            Row(
                                modifier = Modifier.padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(44.dp)
                                        .clip(RoundedCornerShape(10.dp))
                                        .background(ObsidianSurfaceVariant),
                                    contentAlignment = Alignment.Center
                                ) {
                                    if (!channel.logo.isNullOrBlank()) {
                                        AsyncImage(
                                            model = channel.logo,
                                            contentDescription = channel.name,
                                            modifier = Modifier.size(36.dp)
                                        )
                                    } else {
                                        Text(
                                            text = channel.name.take(2).uppercase(),
                                            style = MaterialTheme.typography.labelMedium,
                                            color = CobaltLight
                                        )
                                    }
                                }
                                Spacer(Modifier.width(12.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = channel.name,
                                        style = MaterialTheme.typography.bodyLarge,
                                        fontWeight = FontWeight.Medium,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                    Text(
                                        text = "${channel.countryFlag} ${channel.countryName} · ${channel.categories.firstOrNull().orEmpty()}${channel.quality?.let { " · $it" } ?: ""} · ${if (channel.isHttp) "HTTP→Proxy" else "HTTPS"}",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                                IconButton(onClick = { onToggleFavorite(channel) }) {
                                    Icon(
                                        imageVector = if (isFav) Icons.Filled.Bookmark else Icons.Filled.BookmarkBorder,
                                        contentDescription = "Favori",
                                        tint = if (isFav) AmberFavorite else Color(0xFF64748B)
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (activePicker != null) {
        ModalBottomSheet(
            onDismissRequest = { activePicker = null },
            containerColor = ObsidianSurface
        ) {
            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                contentPadding = PaddingValues(bottom = 24.dp)
            ) {
                when (activePicker) {
                    ActivePicker.SOURCE -> {
                        items(SourceFilter.entries) { srcFilter ->
                            val countSuffix = if (srcFilter == SourceFilter.CUSTOM) " (${state.customChannelsCount})" else ""
                            ListPickerRow("${srcFilter.label}$countSuffix", state.filter.sourceFilter == srcFilter) {
                                folderMode = null
                                onSelectSourceFilter(srcFilter)
                                activePicker = null
                            }
                        }
                    }
                    ActivePicker.RESOLUTION -> {
                        items(ResolutionFilter.entries) { res ->
                            ListPickerRow(res.label, state.filter.resolution == res) {
                                folderMode = null
                                onSelectResolution(res)
                                activePicker = null
                            }
                        }
                    }
                    ActivePicker.COUNTRY -> {
                        item {
                            ListPickerRow("Tous les pays", state.filter.countryCode == "ALL") {
                                folderMode = null
                                onSelectCountry("ALL")
                                activePicker = null
                            }
                        }
                        items(state.countries) { c ->
                            ListPickerRow("${c.flag} ${c.name} (${c.count})", state.filter.countryCode == c.code) {
                                folderMode = null
                                onSelectCountry(c.code)
                                activePicker = null
                            }
                        }
                    }
                    ActivePicker.TYPE -> {
                        item {
                            ListPickerRow("Tous les types", state.filter.channelType == null) {
                                folderMode = null
                                onSelectType(null)
                                activePicker = null
                            }
                        }
                        items(ChannelType.entries) { type ->
                            ListPickerRow(type.label, state.filter.channelType == type) {
                                folderMode = null
                                onSelectType(type)
                                activePicker = null
                            }
                        }
                    }
                    ActivePicker.CATEGORY -> {
                        item {
                            ListPickerRow("Toutes les catégories", state.filter.categoryId == "all") {
                                folderMode = null
                                onSelectCategory("all")
                                activePicker = null
                            }
                        }
                        items(state.categories) { cat ->
                            ListPickerRow("${cat.name} (${cat.count})", state.filter.categoryId == cat.id) {
                                folderMode = null
                                onSelectCategory(cat.id)
                                activePicker = null
                            }
                        }
                    }
                    ActivePicker.LANGUAGE -> {
                        item {
                            ListPickerRow("Toutes les langues", state.filter.languageCode == "all") {
                                folderMode = null
                                onSelectLanguage("all")
                                activePicker = null
                            }
                        }
                        items(state.languages.take(150)) { lang ->
                            ListPickerRow("${lang.name} (${lang.count})", state.filter.languageCode == lang.code) {
                                folderMode = null
                                onSelectLanguage(lang.code)
                                activePicker = null
                            }
                        }
                    }
                    null -> {}
                }
            }
        }
    }
}

@Composable
private fun FolderRow(title: String, count: Int, onClick: () -> Unit) {
    Surface(
        color = ObsidianSurface,
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Filled.Folder, contentDescription = null, tint = AmberFavorite)
            Spacer(Modifier.width(12.dp))
            Text(
                text = title,
                color = Color.White,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.weight(1f)
            )
            Text(
                text = count.toString(),
                color = Color(0xFF94A3B8),
                style = MaterialTheme.typography.bodyMedium
            )
            Spacer(Modifier.width(6.dp))
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = Color(0xFF94A3B8))
        }
    }
}

@Composable
private fun ListPickerRow(label: String, selected: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 14.dp, horizontal = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = label,
            color = if (selected) CobaltLight else Color.White,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal
        )
    }
    HorizontalDivider(color = Color(0xFF1E293B))
}

@Composable
fun FavoritesScreen(
    lists: List<FavoriteListEntity>,
    favorites: List<FavoriteChannelEntity>,
    onCreateList: (String) -> Unit,
    onDeleteList: (String) -> Unit,
    onPlayFavorite: (FavoriteChannelEntity) -> Unit,
    onRemoveFavorite: (FavoriteChannelEntity) -> Unit
) {
    var selectedListId by remember(lists) { mutableStateOf(lists.firstOrNull()?.id ?: "default") }
    var newListName by remember { mutableStateOf("") }

    val activeItems = remember(favorites, selectedListId) {
        favorites.filter { it.listId == selectedListId }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        Text("Listes de favoris personnalisées", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(10.dp))

        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                value = newListName,
                onValueChange = { newListName = it },
                placeholder = { Text("Nom de liste (ex : Sport FR)") },
                singleLine = true,
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(12.dp)
            )
            Button(onClick = {
                onCreateList(newListName)
                newListName = ""
            }) {
                Text("Créer")
            }
        }

        Spacer(Modifier.height(10.dp))

        Row(
            modifier = Modifier.horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            lists.forEach { list ->
                FilterChip(
                    selected = list.id == selectedListId,
                    onClick = { selectedListId = list.id },
                    label = { Text(list.name) },
                    trailingIcon = if (list.id != "default") {
                        {
                            IconButton(
                                onClick = { onDeleteList(list.id) },
                                modifier = Modifier.size(18.dp)
                            ) {
                                Icon(Icons.Filled.Close, contentDescription = "Supprimer", modifier = Modifier.size(14.dp))
                            }
                        }
                    } else null
                )
            }
        }

        Spacer(Modifier.height(12.dp))

        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(activeItems, key = { "${it.listId}:${it.channelId}" }) { item ->
                Surface(
                    color = ObsidianSurface,
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onPlayFavorite(item) }
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Filled.PlayArrow, contentDescription = null, tint = CobaltLight)
                        Spacer(Modifier.width(10.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(item.name, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text("${item.countryFlag} ${item.countryName} · ${item.category}", style = MaterialTheme.typography.bodySmall, color = Color(0xFF94A3B8))
                        }
                        IconButton(onClick = { onRemoveFavorite(item) }) {
                            Icon(Icons.Filled.Delete, contentDescription = "Retirer", tint = Color(0xFF94A3B8))
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun SourcesScreen(
    sources: List<PlaylistSourceEntity>,
    onImportM3u: (String, String, (Result<Int>) -> Unit) -> Unit,
    onImportM3uFile: (String, String, String, (Result<Int>) -> Unit) -> Unit,
    onImportXtream: (String, String, String, String, (Result<Int>) -> Unit) -> Unit,
    onRemoveSource: (PlaylistSourceEntity) -> Unit,
    onOpenImportedChannels: () -> Unit
) {
    val context = LocalContext.current
    var m3uName by remember { mutableStateOf("") }
    var m3uUrl by remember { mutableStateOf("") }
    var xtreamName by remember { mutableStateOf("") }
    var xtreamHost by remember { mutableStateOf("") }
    var xtreamUser by remember { mutableStateOf("") }
    var xtreamPass by remember { mutableStateOf("") }
    var showPassword by remember { mutableStateOf(false) }

    var isImportingM3u by remember { mutableStateOf(false) }
    var isConnectingXtream by remember { mutableStateOf(false) }
    var statusMsg by remember { mutableStateOf<String?>(null) }
    var statusIsError by remember { mutableStateOf(false) }
    var statusSuccessCount by remember { mutableIntStateOf(0) }

    val filePicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument()
    ) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        isImportingM3u = true
        statusMsg = "Lecture du fichier M3U local…"
        statusIsError = false
        statusSuccessCount = 0
        runCatching {
            val displayName = context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                val idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (idx >= 0 && cursor.moveToFirst()) cursor.getString(idx) else null
            } ?: "Playlist locale"
            val text = context.contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() }.orEmpty()
            val cleanTitle = displayName.substringBeforeLast('.')
            onImportM3uFile(cleanTitle, text, displayName) { res ->
                isImportingM3u = false
                res.fold(
                    onSuccess = { count ->
                        statusIsError = false
                        statusSuccessCount = count
                        statusMsg = "$count chaînes importées depuis $displayName"
                    },
                    onFailure = { err ->
                        statusIsError = true
                        statusSuccessCount = 0
                        statusMsg = "Erreur fichier : ${err.message}"
                    }
                )
            }
        }.onFailure { err ->
            isImportingM3u = false
            statusIsError = true
            statusMsg = "Impossible de lire le fichier : ${err.message}"
        }
    }

    val presets = remember {
        listOf(
            "Afrique complète" to "https://iptv-org.github.io/iptv/regions/afr.m3u",
            "France & TNT" to "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist_france.m3u8",
            "Francophone" to "https://iptv-org.github.io/iptv/languages/fra.m3u",
            "Sports" to "https://iptv-org.github.io/iptv/categories/sports.m3u"
        )
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Text("Sources M3U & Xtream Codes", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(4.dp))
            Text(
                text = "Les chaînes publiques Afrique et France/TNT gratuites sont déjà intégrées. Utilisez Xtream Codes ou M3U pour vos abonnements personnels (Canal+ chiffrés, VOD, etc.).",
                style = MaterialTheme.typography.bodySmall,
                color = Color(0xFF94A3B8)
            )
        }

        statusMsg?.let { msg ->
            item {
                val bg = if (statusIsError) Color(0xFF450A0A) else Color(0xFF064E3B)
                val border = if (statusIsError) Color(0xFFEF4444) else Color(0xFF10B981)
                val accent = if (statusIsError) Color(0xFFFCA5A5) else Color(0xFF6EE7B7)
                Surface(
                    color = bg,
                    shape = RoundedCornerShape(14.dp),
                    border = BorderStroke(1.dp, border.copy(alpha = 0.55f)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Icon(
                            imageVector = if (statusIsError) Icons.Filled.ErrorOutline else Icons.Filled.CheckCircle,
                            contentDescription = null,
                            tint = accent
                        )
                        Text(
                            text = msg,
                            color = Color.White,
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.weight(1f)
                        )
                        if (!statusIsError && statusSuccessCount > 0) {
                            TextButton(onClick = onOpenImportedChannels) {
                                Text("Voir", color = CobaltLight, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }
        }

        item {
            Surface(color = ObsidianSurface, shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Importer une playlist M3U / M3U8", fontWeight = FontWeight.SemiBold)
                    Row(
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        presets.forEach { (label, url) ->
                            FilterChip(
                                selected = m3uUrl == url,
                                onClick = {
                                    m3uName = label
                                    m3uUrl = url
                                },
                                label = { Text(label) }
                            )
                        }
                    }
                    OutlinedTextField(
                        value = m3uName,
                        onValueChange = { m3uName = it },
                        label = { Text("Nom") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = m3uUrl,
                        onValueChange = { m3uUrl = it },
                        label = { Text("URL M3U (HTTP ou HTTPS)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = {
                                if (m3uUrl.isBlank()) {
                                    statusIsError = true
                                    statusMsg = "Veuillez saisir une URL M3U valide"
                                    return@Button
                                }
                                isImportingM3u = true
                                statusIsError = false
                                statusSuccessCount = 0
                                statusMsg = "Téléchargement de la playlist M3U…"
                                onImportM3u(m3uName, m3uUrl) { res ->
                                    isImportingM3u = false
                                    res.fold(
                                        onSuccess = { count ->
                                            statusIsError = false
                                            statusSuccessCount = count
                                            statusMsg = "$count chaînes importées avec succès"
                                        },
                                        onFailure = { err ->
                                            statusIsError = true
                                            statusSuccessCount = 0
                                            statusMsg = "Erreur M3U : ${err.message}"
                                        }
                                    )
                                }
                            },
                            enabled = !isImportingM3u && !isConnectingXtream
                        ) {
                            if (isImportingM3u) {
                                CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp, color = Color.White)
                                Spacer(Modifier.width(8.dp))
                            }
                            Text(if (isImportingM3u) "Import…" else "Ajouter M3U")
                        }
                        OutlinedButton(
                            onClick = { filePicker.launch(arrayOf("*/*")) },
                            enabled = !isImportingM3u && !isConnectingXtream
                        ) {
                            Icon(Icons.Filled.UploadFile, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("Fichier .m3u")
                        }
                    }
                }
            }
        }
        item {
            Surface(color = ObsidianSurface, shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Connecter un serveur Xtream Codes", fontWeight = FontWeight.SemiBold)
                    OutlinedTextField(
                        value = xtreamName,
                        onValueChange = { xtreamName = it },
                        label = { Text("Nom du profil") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = xtreamHost,
                        onValueChange = { xtreamHost = it },
                        label = { Text("Serveur (ex: http://host:8080)") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = xtreamUser,
                        onValueChange = { xtreamUser = it },
                        label = { Text("Utilisateur") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = xtreamPass,
                        onValueChange = { xtreamPass = it },
                        label = { Text("Mot de passe") },
                        singleLine = true,
                        visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                        trailingIcon = {
                            IconButton(onClick = { showPassword = !showPassword }) {
                                Icon(
                                    imageVector = if (showPassword) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                                    contentDescription = if (showPassword) "Masquer" else "Afficher"
                                )
                            }
                        },
                        modifier = Modifier.fillMaxWidth()
                    )
                    Button(
                        onClick = {
                            if (xtreamHost.isBlank() || xtreamUser.isBlank() || xtreamPass.isBlank()) {
                                statusIsError = true
                                statusMsg = "Serveur, utilisateur et mot de passe Xtream requis"
                                return@Button
                            }
                            isConnectingXtream = true
                            statusIsError = false
                            statusSuccessCount = 0
                            statusMsg = "Authentification auprès du serveur Xtream…"
                            onImportXtream(xtreamName, xtreamHost, xtreamUser, xtreamPass) { res ->
                                isConnectingXtream = false
                                res.fold(
                                    onSuccess = { count ->
                                        statusIsError = false
                                        statusSuccessCount = count
                                        statusMsg = "$count flux Xtream chargés (Live, VOD & Séries)"
                                    },
                                    onFailure = { err ->
                                        statusIsError = true
                                        statusSuccessCount = 0
                                        statusMsg = "Erreur : ${err.message}"
                                    }
                                )
                            }
                        },
                        enabled = !isConnectingXtream && !isImportingM3u
                    ) {
                        if (isConnectingXtream) {
                            CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp, color = Color.White)
                            Spacer(Modifier.width(8.dp))
                        }
                        Text(if (isConnectingXtream) "Connexion…" else "Connecter Xtream")
                    }
                }
            }
        }

        items(sources, key = { it.id }) { src ->
            Surface(color = ObsidianSurface, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth()) {
                Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(src.name, fontWeight = FontWeight.Medium)
                        Text(
                            text = "${src.kind} · ${src.channelCount} flux · ${src.url}",
                            style = MaterialTheme.typography.bodySmall,
                            color = Color(0xFF94A3B8),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                    IconButton(onClick = { onRemoveSource(src) }) {
                        Icon(Icons.Filled.Delete, contentDescription = "Supprimer")
                    }
                }
            }
        }
    }
}

@Composable
fun ProxySettingsScreen(
    state: IptvUiState,
    onSelectProxyMode: (ProxyMode) -> Unit,
    onRemoteProxyChange: (String) -> Unit,
    onRefreshCatalog: () -> Unit,
    onCheckUpdate: () -> Unit,
    onInstallUpdate: () -> Unit
) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Text("Proxy HTTP ↔ HTTPS & Mise à jour", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(4.dp))
            Text(
                text = "Catalogue iptv-org : ${state.httpStreamsCount} flux HTTP et ${state.httpsStreamsCount} flux HTTPS.",
                style = MaterialTheme.typography.bodySmall,
                color = Color(0xFF94A3B8)
            )
        }

        item {
            Surface(color = ObsidianSurface, shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Mise à jour In-App", fontWeight = FontWeight.SemiBold)
                    Text(
                        text = "Version installée : v${BuildConfig.VERSION_NAME} (build ${BuildConfig.VERSION_CODE})",
                        style = MaterialTheme.typography.bodySmall,
                        color = Color(0xFF94A3B8)
                    )
                    state.updateMessage?.let { msg ->
                        Text(text = msg, style = MaterialTheme.typography.bodySmall, color = CobaltLight)
                    }
                    state.updateDownloadProgress?.let { progress ->
                        LinearProgressIndicator(
                            progress = { progress },
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(
                            onClick = onCheckUpdate,
                            enabled = !state.isCheckingUpdate && state.updateDownloadProgress == null
                        ) {
                            Text(if (state.isCheckingUpdate) "Vérification…" else "Vérifier")
                        }
                        if (state.availableUpdate?.apkUrl != null) {
                            Button(
                                onClick = onInstallUpdate,
                                enabled = state.updateDownloadProgress == null
                            ) {
                                Text(if (state.availableUpdate.isNewer) "Installer ${state.availableUpdate.tag}" else "Réinstaller APK")
                            }
                        }
                    }
                }
            }
        }

        items(ProxyMode.entries) { mode ->
            Surface(
                color = if (state.proxyMode == mode) Color(0xFF1E3A8A).copy(alpha = 0.4f) else ObsidianSurface,
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onSelectProxyMode(mode) }
            ) {
                Text(
                    text = mode.label,
                    modifier = Modifier.padding(16.dp),
                    fontWeight = if (state.proxyMode == mode) FontWeight.SemiBold else FontWeight.Normal
                )
            }
        }

        item {
            OutlinedTextField(
                value = state.remoteProxyUrl,
                onValueChange = onRemoteProxyChange,
                label = { Text("URL du proxy HTTPS distant (optionnel)") },
                placeholder = { Text("https://votre-proxy-ktp.run.app") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
        }

        item {
            OutlinedButton(onClick = onRefreshCatalog) {
                Text("Resynchroniser iptv-org")
            }
        }
    }
}

@Composable
fun InAppUpdateDialog(
    state: IptvUiState,
    onInstall: () -> Unit,
    onDismiss: () -> Unit
) {
    val release = state.availableUpdate ?: return
    if (!release.isNewer || state.updateDismissed) return

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = ObsidianSurface,
        title = {
            Text("Mise à jour disponible (${release.tag})", fontWeight = FontWeight.Bold)
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = release.title,
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color.White
                )
                if (release.apkSizeBytes > 0) {
                    val mb = release.apkSizeBytes / (1024f * 1024f)
                    Text(
                        text = String.format("Taille APK : %.1f Mo", mb),
                        style = MaterialTheme.typography.bodySmall,
                        color = Color(0xFF94A3B8)
                    )
                }
                state.updateDownloadProgress?.let { progress ->
                    LinearProgressIndicator(
                        progress = { progress },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                state.updateMessage?.let { msg ->
                    Text(text = msg, style = MaterialTheme.typography.bodySmall, color = CobaltLight)
                }
            }
        },
        confirmButton = {
            Button(
                onClick = onInstall,
                enabled = state.updateDownloadProgress == null && release.apkUrl != null
            ) {
                Text("Télécharger & Installer")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Plus tard")
            }
        }
    )
}
