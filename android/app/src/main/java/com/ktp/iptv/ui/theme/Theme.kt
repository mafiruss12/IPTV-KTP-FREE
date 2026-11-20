package com.ktp.iptv.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val ObsidianBg = Color(0xFF0B0D11)
val ObsidianSurface = Color(0xFF131720)
val ObsidianSurfaceVariant = Color(0xFF1B212E)
val CobaltAccent = Color(0xFF2563EB)
val CobaltLight = Color(0xFF60A5FA)
val AmberFavorite = Color(0xFFF59E0B)
val CrimsonLive = Color(0xFFF43F5E)

private val KtpDarkColors = darkColorScheme(
    primary = CobaltAccent,
    onPrimary = Color.White,
    secondary = CobaltLight,
    background = ObsidianBg,
    onBackground = Color(0xFFF1F5F9),
    surface = ObsidianSurface,
    onSurface = Color(0xFFF1F5F9),
    surfaceVariant = ObsidianSurfaceVariant,
    onSurfaceVariant = Color(0xFF94A3B8),
    outline = Color(0xFF263042)
)

@Composable
fun KtpIptvTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = KtpDarkColors,
        content = content
    )
}
