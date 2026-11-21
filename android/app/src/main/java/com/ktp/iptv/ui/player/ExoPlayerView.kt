package com.ktp.iptv.ui.player

import android.content.Context
import android.os.BatteryManager
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.annotation.OptIn
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AspectRatio
import androidx.compose.material.icons.filled.Fullscreen
import androidx.compose.material.icons.filled.FullscreenExit
import androidx.compose.material.icons.filled.HighQuality
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.LockOpen
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.Tracks
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import com.ktp.iptv.KtpIptvApp
import com.ktp.iptv.data.model.AspectRatioMode
import com.ktp.iptv.data.model.Channel
import com.ktp.iptv.data.model.VideoQualityTrack
import com.ktp.iptv.ui.theme.CrimsonLive
import com.ktp.iptv.ui.theme.ObsidianSurface
import kotlinx.coroutines.delay
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(UnstableApi::class)
@Composable
fun ExoPlayerView(
    playableUrl: String?,
    channel: Channel?,
    isFullscreen: Boolean = false,
    onToggleFullscreen: () -> Unit = {},
    onPrevChannel: () -> Unit = {},
    onNextChannel: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val app = context.applicationContext as KtpIptvApp

    var errorMessage by remember(playableUrl) { mutableStateOf<String?>(null) }
    var isBuffering by remember(playableUrl) { mutableStateOf(true) }
    var isPlaying by remember { mutableStateOf(true) }
    var showControls by remember { mutableStateOf(true) }
    var isLocked by remember { mutableStateOf(false) }
    var aspectMode by remember { mutableStateOf(AspectRatioMode.FIT) }
    var videoTracks by remember(playableUrl) { mutableStateOf<List<VideoQualityTrack>>(emptyList()) }
    var selectedQualityId by remember(playableUrl) { mutableStateOf("auto") }
    var showQualitySheet by remember { mutableStateOf(false) }
    var currentResolutionLabel by remember(playableUrl) { mutableStateOf(channel?.quality.orEmpty()) }
    var currentClock by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        val formatter = SimpleDateFormat("EEE, HH:mm", Locale.FRENCH)
        while (true) {
            currentClock = formatter.format(Date())
            delay(30_000)
        }
    }

    val batteryPct = remember(showControls) {
        val bm = context.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
        bm?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)?.takeIf { it in 1..100 }
    }

    val exoPlayer = remember {
        val dataSourceFactory = OkHttpDataSource.Factory(app.okHttpClient)
        ExoPlayer.Builder(context)
            .setMediaSourceFactory(DefaultMediaSourceFactory(dataSourceFactory))
            .build()
            .apply {
                playWhenReady = true
            }
    }

    DisposableEffect(exoPlayer) {
        val listener = object : Player.Listener {
            override fun onPlayerError(error: PlaybackException) {
                isBuffering = false
                errorMessage = "Flux indisponible (${error.errorCodeName}). Essayez le Proxy ou la chaîne suivante."
            }

            override fun onIsPlayingChanged(playing: Boolean) {
                isPlaying = playing
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
                isBuffering = playbackState == Player.STATE_BUFFERING
                if (playbackState == Player.STATE_READY) {
                    errorMessage = null
                }
            }

            override fun onTracksChanged(tracks: Tracks) {
                val extracted = mutableListOf<VideoQualityTrack>()
                for ((groupIndex, group) in tracks.groups.withIndex()) {
                    if (group.type != C.TRACK_TYPE_VIDEO) continue
                    for (trackIndex in 0 until group.length) {
                        if (!group.isTrackSupported(trackIndex)) continue
                        val fmt = group.getTrackFormat(trackIndex)
                        val height = fmt.height
                        if (height <= 0) continue
                        val kbps = if (fmt.bitrate > 0) fmt.bitrate / 1000 else 0
                        val badge = when {
                            height >= 2160 -> "4K (${height}p)"
                            height >= 1080 -> "1080p FHD"
                            height >= 720 -> "720p HD"
                            else -> "${height}p SD"
                        }
                        val label = if (kbps > 0) "$badge · ${String.format(Locale.US, "%.1f", kbps / 1000f)} Mbps" else badge
                        extracted.add(
                            VideoQualityTrack(
                                id = "${groupIndex}_$trackIndex",
                                label = label,
                                height = height,
                                width = fmt.width,
                                bitrateKbps = kbps,
                                groupIndex = groupIndex,
                                trackIndex = trackIndex,
                                isSelected = group.isTrackSelected(trackIndex)
                            )
                        )
                    }
                }
                videoTracks = extracted.sortedByDescending { it.height }
                val active = extracted.firstOrNull { it.isSelected }
                if (active != null) {
                    currentResolutionLabel = "${active.height}p"
                }
            }
        }
        exoPlayer.addListener(listener)
        onDispose {
            exoPlayer.removeListener(listener)
            exoPlayer.release()
        }
    }

    LaunchedEffect(playableUrl) {
        if (!playableUrl.isNullOrBlank()) {
            errorMessage = null
            isBuffering = true
            exoPlayer.trackSelectionParameters = exoPlayer.trackSelectionParameters
                .buildUpon()
                .clearOverridesOfType(C.TRACK_TYPE_VIDEO)
                .build()
            exoPlayer.setMediaItem(MediaItem.fromUri(playableUrl))
            exoPlayer.prepare()
            exoPlayer.playWhenReady = true
        } else {
            exoPlayer.stop()
            isBuffering = false
        }
    }

    val resizeMode = when (aspectMode) {
        AspectRatioMode.FIT -> AspectRatioFrameLayout.RESIZE_MODE_FIT
        AspectRatioMode.FILL -> AspectRatioFrameLayout.RESIZE_MODE_FILL
        AspectRatioMode.ZOOM -> AspectRatioFrameLayout.RESIZE_MODE_ZOOM
        AspectRatioMode.RATIO_16_9 -> AspectRatioFrameLayout.RESIZE_MODE_FIXED_WIDTH
        AspectRatioMode.RATIO_4_3 -> AspectRatioFrameLayout.RESIZE_MODE_FIXED_HEIGHT
    }

    val boxModifier = if (isFullscreen) {
        modifier
            .fillMaxSize()
            .background(Color.Black)
    } else {
        modifier
            .fillMaxWidth()
            .aspectRatio(16f / 9f)
            .clip(RoundedCornerShape(16.dp))
            .background(Color.Black)
    }

    Box(
        modifier = boxModifier.clickable { showControls = !showControls },
        contentAlignment = Alignment.Center
    ) {
        if (playableUrl.isNullOrBlank()) {
            Text(
                text = "Sélectionnez une chaîne pour démarrer la lecture",
                style = MaterialTheme.typography.bodyMedium,
                color = Color(0xFF94A3B8),
                modifier = Modifier.padding(16.dp)
            )
        } else {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                update = { view ->
                    view.resizeMode = resizeMode
                },
                factory = { ctx ->
                    PlayerView(ctx).apply {
                        player = exoPlayer
                        useController = false
                        this.resizeMode = resizeMode
                        layoutParams = FrameLayout.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT,
                            ViewGroup.LayoutParams.MATCH_PARENT
                        )
                    }
                }
            )

            if (isBuffering && errorMessage == null) {
                CircularProgressIndicator(
                    color = CrimsonLive,
                    strokeWidth = 3.dp,
                    modifier = Modifier.size(40.dp)
                )
            }

            if (showControls) {
                // Top OTT Broadcast Bar
                Box(
                    modifier = Modifier
                        .align(Alignment.TopCenter)
                        .fillMaxWidth()
                        .background(
                            Brush.verticalGradient(
                                listOf(Color.Black.copy(alpha = 0.85f), Color.Transparent)
                            )
                        )
                        .padding(horizontal = 12.dp, vertical = 10.dp)
                ) {
                    if (!isLocked) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.weight(1f)
                            ) {
                                if (isFullscreen) {
                                    Box(
                                        modifier = Modifier
                                            .size(36.dp)
                                            .clip(CircleShape)
                                            .background(CrimsonLive)
                                            .clickable { onToggleFullscreen() },
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Icon(
                                            Icons.AutoMirrored.Filled.ArrowBack,
                                            contentDescription = "Quitter plein écran",
                                            tint = Color.White,
                                            modifier = Modifier.size(20.dp)
                                        )
                                    }
                                    Spacer(Modifier.width(10.dp))
                                }
                                Text(
                                    text = channel?.name.orEmpty(),
                                    color = Color.White,
                                    fontWeight = FontWeight.SemiBold,
                                    style = MaterialTheme.typography.titleSmall,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }

                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                if (currentResolutionLabel.isNotBlank()) {
                                    Surface(
                                        color = Color.White.copy(alpha = 0.16f),
                                        shape = RoundedCornerShape(6.dp)
                                    ) {
                                        Text(
                                            text = currentResolutionLabel,
                                            color = Color.White,
                                            style = MaterialTheme.typography.labelSmall,
                                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp)
                                        )
                                    }
                                }
                                batteryPct?.let { pct ->
                                    Text(
                                        text = "$pct%",
                                        color = Color(0xFFCBD5E1),
                                        style = MaterialTheme.typography.labelSmall
                                    )
                                }
                                if (currentClock.isNotBlank()) {
                                    Text(
                                        text = currentClock,
                                        color = Color.White,
                                        style = MaterialTheme.typography.labelSmall
                                    )
                                }
                            }
                        }
                    }
                }

                // Center Play/Pause Button
                if (!isLocked && errorMessage == null) {
                    Box(
                        modifier = Modifier
                            .size(54.dp)
                            .clip(CircleShape)
                            .background(Color.White.copy(alpha = 0.9f))
                            .clickable {
                                if (exoPlayer.isPlaying) exoPlayer.pause() else exoPlayer.play()
                            },
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = if (isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                            contentDescription = if (isPlaying) "Pause" else "Lecture",
                            tint = Color.Black,
                            modifier = Modifier.size(28.dp)
                        )
                    }
                }

                // Bottom OTT Player Controls
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .fillMaxWidth()
                        .background(
                            Brush.verticalGradient(
                                listOf(Color.Transparent, Color.Black.copy(alpha = 0.9f))
                            )
                        )
                        .padding(horizontal = 12.dp, vertical = 8.dp)
                ) {
                    if (isLocked) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.Start
                        ) {
                            IconButton(onClick = { isLocked = false }) {
                                Icon(Icons.Filled.LockOpen, contentDescription = "Déverrouiller", tint = CrimsonLive)
                            }
                        }
                    } else {
                        Column(modifier = Modifier.fillMaxWidth()) {
                            channel?.let { ch ->
                                Text(
                                    text = "${ch.countryFlag} ${ch.countryName} · ${ch.categories.firstOrNull().orEmpty()} · ${if (ch.isHttp) "Proxy HTTP→HTTPS" else "HTTPS"}",
                                    color = Color(0xFFF59E0B),
                                    style = MaterialTheme.typography.labelMedium,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                Spacer(Modifier.height(4.dp))
                            }
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    IconButton(onClick = { isLocked = true }) {
                                        Icon(Icons.Filled.Lock, contentDescription = "Verrouiller", tint = Color.White)
                                    }
                                    IconButton(onClick = {
                                        val entries = AspectRatioMode.entries
                                        aspectMode = entries[(entries.indexOf(aspectMode) + 1) % entries.size]
                                    }) {
                                        Icon(Icons.Filled.AspectRatio, contentDescription = aspectMode.label, tint = Color.White)
                                    }
                                    IconButton(onClick = onPrevChannel) {
                                        Icon(Icons.Filled.SkipPrevious, contentDescription = "Précédent", tint = Color.White)
                                    }
                                    IconButton(onClick = onNextChannel) {
                                        Icon(Icons.Filled.SkipNext, contentDescription = "Suivant", tint = Color.White)
                                    }
                                }

                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Surface(
                                        color = Color.White.copy(alpha = 0.14f),
                                        shape = RoundedCornerShape(8.dp),
                                        modifier = Modifier.clickable { showQualitySheet = true }
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp),
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Icon(
                                                Icons.Filled.HighQuality,
                                                contentDescription = "Résolution",
                                                tint = Color.White,
                                                modifier = Modifier.size(16.dp)
                                            )
                                            Spacer(Modifier.width(4.dp))
                                            Text(
                                                text = if (selectedQualityId == "auto") "Auto" else currentResolutionLabel.ifBlank { "Auto" },
                                                color = Color.White,
                                                style = MaterialTheme.typography.labelSmall
                                            )
                                        }
                                    }
                                    Spacer(Modifier.width(4.dp))
                                    IconButton(onClick = { showQualitySheet = true }) {
                                        Icon(Icons.Filled.Tune, contentDescription = "Réglages résolution", tint = Color.White)
                                    }
                                    IconButton(onClick = onToggleFullscreen) {
                                        Icon(
                                            imageVector = if (isFullscreen) Icons.Filled.FullscreenExit else Icons.Filled.Fullscreen,
                                            contentDescription = "Plein écran",
                                            tint = Color.White
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }

            errorMessage?.let { msg ->
                Box(
                    modifier = Modifier
                        .align(Alignment.Center)
                        .padding(16.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(Color.Black.copy(alpha = 0.88f))
                        .padding(14.dp)
                ) {
                    Text(
                        text = msg,
                        color = Color(0xFFFCA5A5),
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
        }
    }

    if (showQualitySheet) {
        ModalBottomSheet(
            onDismissRequest = { showQualitySheet = false },
            containerColor = ObsidianSurface
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 12.dp)
            ) {
                Text(
                    text = "Résolution vidéo & Format d'affichage",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
                Spacer(Modifier.height(10.dp))

                QualityRow(
                    label = "Automatique (Adaptatif)",
                    selected = selectedQualityId == "auto",
                    onClick = {
                        selectedQualityId = "auto"
                        exoPlayer.trackSelectionParameters = exoPlayer.trackSelectionParameters
                            .buildUpon()
                            .clearOverridesOfType(C.TRACK_TYPE_VIDEO)
                            .build()
                        showQualitySheet = false
                    }
                )

                if (videoTracks.isEmpty()) {
                    Text(
                        text = "Ce flux propose une seule qualité fixe (${currentResolutionLabel.ifBlank { "Standard" }}).",
                        style = MaterialTheme.typography.bodySmall,
                        color = Color(0xFF94A3B8),
                        modifier = Modifier.padding(vertical = 10.dp)
                    )
                } else {
                    videoTracks.forEach { track ->
                        QualityRow(
                            label = track.label,
                            selected = selectedQualityId == track.id,
                            onClick = {
                                val groups = exoPlayer.currentTracks.groups
                                val group = groups.getOrNull(track.groupIndex)?.mediaTrackGroup
                                if (group != null) {
                                    exoPlayer.trackSelectionParameters = exoPlayer.trackSelectionParameters
                                        .buildUpon()
                                        .setOverrideForType(TrackSelectionOverride(group, track.trackIndex))
                                        .build()
                                    selectedQualityId = track.id
                                    currentResolutionLabel = "${track.height}p"
                                }
                                showQualitySheet = false
                            }
                        )
                    }
                }

                Spacer(Modifier.height(12.dp))
                Text(
                    text = "Format d'image : ${aspectMode.label}",
                    style = MaterialTheme.typography.labelLarge,
                    color = Color(0xFF94A3B8)
                )
                Spacer(Modifier.height(8.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    AspectRatioMode.entries.forEach { mode ->
                        Surface(
                            color = if (aspectMode == mode) CrimsonLive else Color(0xFF1B212E),
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier
                                .weight(1f)
                                .clickable { aspectMode = mode }
                        ) {
                            Text(
                                text = mode.label,
                                color = Color.White,
                                style = MaterialTheme.typography.labelSmall,
                                maxLines = 1,
                                modifier = Modifier.padding(vertical = 8.dp, horizontal = 4.dp)
                            )
                        }
                    }
                }
                Spacer(Modifier.height(20.dp))
            }
        }
    }
}

@Composable
private fun QualityRow(label: String, selected: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 12.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = label,
            color = if (selected) CrimsonLive else Color.White,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal
        )
        if (selected) {
            Text("Actif", color = CrimsonLive, style = MaterialTheme.typography.labelSmall)
        }
    }
    HorizontalDivider(color = Color(0xFF1E293B))
}
