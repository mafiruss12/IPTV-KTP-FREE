package com.ktp.iptv.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.BookmarkBorder
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import com.ktp.iptv.BuildConfig
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.ktp.iptv.data.local.FavoriteChannelEntity
import com.ktp.iptv.data.local.FavoriteListEntity
import com.ktp.iptv.data.local.PlaylistSourceEntity
import com.ktp.iptv.data.model.Channel
import com.ktp.iptv.data.model.ChannelType
import com.ktp.iptv.data.model.ProxyMode
import com.ktp.iptv.ui.player.ExoPlayerView
import com.ktp.iptv.ui.theme.AmberFavorite
import com.ktp.iptv.ui.theme.CobaltLight
import com.ktp.iptv.ui.theme.ObsidianSurface
import com.ktp.iptv.ui.theme.ObsidianSurfaceVariant
import com.ktp.iptv.ui.viewmodel.IptvUiState

private enum class ActivePicker { COUNTRY, TYPE, CATEGORY, LANGUAGE }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CatalogScreen(
    state: IptvUiState,
    favoriteIds: Set<String>,
    onQueryChange: (String) -> Unit,
    onSelectCountry: (String) -> Unit,
    onSelectType: (ChannelType?) -> Unit,
    onSelectCategory: (String) -> Unit,
    onSelectLanguage: (String) -> Unit,
    onResetFilters: () -> Unit,
    onPlayChannel: (Channel) -> Unit,
    onToggleFavorite: (Channel) -> Unit
) {
    var activePicker by remember { mutableStateOf<ActivePicker?>(null) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 12.dp)
    ) {
        ExoPlayerView(
            playableUrl = state.playableUrl,
            channelName = state.activeChannel?.name
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
                        text = "${active.countryFlag} ${active.countryName} · ${active.categories.firstOrNull().orEmpty()} · ${if (active.isHttp) "HTTP→Proxy" else "HTTPS"}",
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
            onValueChange = onQueryChange,
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 6.dp),
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
                state.filter.languageCode != "all"
            ) {
                FilterChip(
                    selected = false,
                    onClick = onResetFilters,
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
            else -> {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(bottom = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(state.filteredChannels, key = { it.id }) { channel ->
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
                                        text = "${channel.countryFlag} ${channel.countryName} · ${channel.categories.firstOrNull().orEmpty()} · ${if (channel.isHttp) "HTTP→Proxy" else "HTTPS"}",
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
                    ActivePicker.COUNTRY -> {
                        item {
                            ListPickerRow("Tous les pays", state.filter.countryCode == "ALL") {
                                onSelectCountry("ALL")
                                activePicker = null
                            }
                        }
                        items(state.countries) { c ->
                            ListPickerRow("${c.flag} ${c.name} (${c.count})", state.filter.countryCode == c.code) {
                                onSelectCountry(c.code)
                                activePicker = null
                            }
                        }
                    }
                    ActivePicker.TYPE -> {
                        item {
                            ListPickerRow("Tous les types", state.filter.channelType == null) {
                                onSelectType(null)
                                activePicker = null
                            }
                        }
                        items(ChannelType.entries) { type ->
                            ListPickerRow(type.label, state.filter.channelType == type) {
                                onSelectType(type)
                                activePicker = null
                            }
                        }
                    }
                    ActivePicker.CATEGORY -> {
                        item {
                            ListPickerRow("Toutes les catégories", state.filter.categoryId == "all") {
                                onSelectCategory("all")
                                activePicker = null
                            }
                        }
                        items(state.categories) { cat ->
                            ListPickerRow("${cat.name} (${cat.count})", state.filter.categoryId == cat.id) {
                                onSelectCategory(cat.id)
                                activePicker = null
                            }
                        }
                    }
                    ActivePicker.LANGUAGE -> {
                        item {
                            ListPickerRow("Toutes les langues", state.filter.languageCode == "all") {
                                onSelectLanguage("all")
                                activePicker = null
                            }
                        }
                        items(state.languages.take(150)) { lang ->
                            ListPickerRow("${lang.name} (${lang.count})", state.filter.languageCode == lang.code) {
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
    onImportXtream: (String, String, String, String, (Result<Int>) -> Unit) -> Unit,
    onRemoveSource: (PlaylistSourceEntity) -> Unit
) {
    var m3uName by remember { mutableStateOf("") }
    var m3uUrl by remember { mutableStateOf("") }
    var xtreamName by remember { mutableStateOf("") }
    var xtreamHost by remember { mutableStateOf("") }
    var xtreamUser by remember { mutableStateOf("") }
    var xtreamPass by remember { mutableStateOf("") }
    var statusMsg by remember { mutableStateOf<String?>(null) }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Text("Sources M3U & Xtream Codes", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        }
        item {
            Surface(color = ObsidianSurface, shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Importer une playlist M3U / M3U8", fontWeight = FontWeight.SemiBold)
                    OutlinedTextField(value = m3uName, onValueChange = { m3uName = it }, label = { Text("Nom") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = m3uUrl, onValueChange = { m3uUrl = it }, label = { Text("URL M3U (HTTP ou HTTPS)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    Button(onClick = {
                        statusMsg = "Chargement M3U…"
                        onImportM3u(m3uName, m3uUrl) { res ->
                            statusMsg = res.fold(
                                onSuccess = { "$it chaînes importées" },
                                onFailure = { "Erreur : ${it.message}" }
                            )
                        }
                    }) { Text("Ajouter M3U") }
                }
            }
        }
        item {
            Surface(color = ObsidianSurface, shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Connecter un serveur Xtream Codes", fontWeight = FontWeight.SemiBold)
                    OutlinedTextField(value = xtreamName, onValueChange = { xtreamName = it }, label = { Text("Nom du profil") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = xtreamHost, onValueChange = { xtreamHost = it }, label = { Text("Serveur (ex: http://host:8080)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = xtreamUser, onValueChange = { xtreamUser = it }, label = { Text("Utilisateur") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = xtreamPass, onValueChange = { xtreamPass = it }, label = { Text("Mot de passe") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    Button(onClick = {
                        statusMsg = "Connexion Xtream…"
                        onImportXtream(xtreamName, xtreamHost, xtreamUser, xtreamPass) { res ->
                            statusMsg = res.fold(
                                onSuccess = { "$it flux Xtream chargés" },
                                onFailure = { "Erreur : ${it.message}" }
                            )
                        }
                    }) { Text("Connecter Xtream") }
                }
            }
        }

        statusMsg?.let { msg ->
            item { Text(msg, color = CobaltLight, style = MaterialTheme.typography.bodySmall) }
        }

        items(sources, key = { it.id }) { src ->
            Surface(color = ObsidianSurface, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth()) {
                Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(src.name, fontWeight = FontWeight.Medium)
                        Text("${src.kind} · ${src.channelCount} flux", style = MaterialTheme.typography.bodySmall, color = Color(0xFF94A3B8))
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
