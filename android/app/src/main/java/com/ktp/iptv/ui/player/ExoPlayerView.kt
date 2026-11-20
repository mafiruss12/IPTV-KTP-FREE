package com.ktp.iptv.ui.player

import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.annotation.OptIn
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.PlayerView
import com.ktp.iptv.KtpIptvApp

@OptIn(UnstableApi::class)
@Composable
fun ExoPlayerView(
    playableUrl: String?,
    channelName: String?,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val app = context.applicationContext as KtpIptvApp
    var errorMessage by remember(playableUrl) { mutableStateOf<String?>(null) }

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
                errorMessage = "Erreur flux (${error.errorCodeName}). Vérifiez le mode Proxy."
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
                if (playbackState == Player.STATE_READY) {
                    errorMessage = null
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
            exoPlayer.setMediaItem(MediaItem.fromUri(playableUrl))
            exoPlayer.prepare()
            exoPlayer.playWhenReady = true
        } else {
            exoPlayer.stop()
        }
    }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .aspectRatio(16f / 9f)
            .clip(RoundedCornerShape(16.dp))
            .background(Color.Black),
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
                factory = { ctx ->
                    PlayerView(ctx).apply {
                        player = exoPlayer
                        useController = true
                        layoutParams = FrameLayout.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT,
                            ViewGroup.LayoutParams.MATCH_PARENT
                        )
                    }
                }
            )

            errorMessage?.let { msg ->
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .fillMaxWidth()
                        .background(Color.Black.copy(alpha = 0.78f))
                        .padding(10.dp)
                ) {
                    Text(
                        text = "${channelName.orEmpty()}: $msg",
                        color = Color(0xFFFCA5A5),
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
        }
    }
}
