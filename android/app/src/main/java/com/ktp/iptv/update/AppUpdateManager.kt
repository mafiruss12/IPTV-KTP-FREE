package com.ktp.iptv.update

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import androidx.core.content.FileProvider
import com.google.gson.Gson
import com.google.gson.annotations.SerializedName
import com.ktp.iptv.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileOutputStream

data class GitHubReleaseDto(
    @SerializedName("tag_name") val tagName: String?,
    val name: String?,
    val body: String?,
    @SerializedName("html_url") val htmlUrl: String?,
    val assets: List<GitHubAssetDto>?
)

data class GitHubAssetDto(
    val name: String?,
    val size: Long?,
    @SerializedName("browser_download_url") val downloadUrl: String?
)

data class AppUpdateRelease(
    val tag: String,
    val title: String,
    val notes: String,
    val apkUrl: String?,
    val apkName: String?,
    val apkSizeBytes: Long,
    val htmlUrl: String,
    val isNewer: Boolean
)

sealed class InstallLaunchResult {
    data object InstallerLaunched : InstallLaunchResult()
    data class PermissionRequired(val apkFile: File) : InstallLaunchResult()
}

class AppUpdateManager(
    private val client: OkHttpClient,
    private val gson: Gson = Gson()
) {
    companion object {
        private const val LATEST_RELEASE_API =
            "https://api.github.com/repos/mafiruss12/IPTV-KTP-FREE/releases/latest"
        private const val LATEST_RELEASE_WEB =
            "https://github.com/mafiruss12/IPTV-KTP-FREE/releases/latest"

        fun isRemoteVersionNewer(
            remoteTag: String,
            localVersionName: String,
            localVersionCode: Int
        ): Boolean {
            val cleanRemote = remoteTag.trim().removePrefix("v").removePrefix("V")
            val cleanLocal = localVersionName.trim().removePrefix("v").removePrefix("V")

            if (cleanRemote.startsWith("build-", ignoreCase = true)) {
                val remoteBuild = cleanRemote.substringAfter("build-").toIntOrNull() ?: return false
                return remoteBuild > localVersionCode
            }

            val remoteParts = cleanRemote.split(".").map { it.takeWhile(Char::isDigit).toIntOrNull() ?: 0 }
            val localParts = cleanLocal.split(".").map { it.takeWhile(Char::isDigit).toIntOrNull() ?: 0 }
            val maxLen = maxOf(remoteParts.size, localParts.size)
            for (i in 0 until maxLen) {
                val r = remoteParts.getOrElse(i) { 0 }
                val l = localParts.getOrElse(i) { 0 }
                if (r > l) return true
                if (r < l) return false
            }
            return false
        }
    }

    suspend fun checkForUpdate(): AppUpdateRelease? = withContext(Dispatchers.IO) {
        val apiResult = runCatching { fetchFromGitHubApi() }.getOrNull()
        if (apiResult != null) return@withContext apiResult
        runCatching { fetchFromGitHubRedirect() }.getOrNull()
    }

    private fun fetchFromGitHubApi(): AppUpdateRelease? {
        val req = Request.Builder()
            .url(LATEST_RELEASE_API)
            .header("Accept", "application/vnd.github+json")
            .header("User-Agent", "KTP-IPTV-Android/${BuildConfig.VERSION_NAME}")
            .build()

        client.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) return null
            val body = resp.body?.string() ?: return null
            val dto = gson.fromJson(body, GitHubReleaseDto::class.java) ?: return null
            val tag = dto.tagName.orEmpty().ifBlank { return null }

            val assets = dto.assets.orEmpty()
            val chosenAsset = assets.find {
                it.name?.startsWith("KTP-IPTV-", ignoreCase = true) == true &&
                    it.name.endsWith(".apk", ignoreCase = true)
            } ?: assets.find {
                it.name?.endsWith("release.apk", ignoreCase = true) == true &&
                    !it.name.contains("unsigned", ignoreCase = true)
            } ?: assets.find {
                it.name?.endsWith("debug.apk", ignoreCase = true) == true
            } ?: assets.find { it.name?.endsWith(".apk", ignoreCase = true) == true }

            return AppUpdateRelease(
                tag = tag,
                title = dto.name ?: tag,
                notes = dto.body.orEmpty(),
                apkUrl = chosenAsset?.downloadUrl
                    ?: "https://github.com/mafiruss12/IPTV-KTP-FREE/releases/download/$tag/KTP-IPTV-$tag.apk",
                apkName = chosenAsset?.name ?: "KTP-IPTV-$tag.apk",
                apkSizeBytes = chosenAsset?.size ?: 0L,
                htmlUrl = dto.htmlUrl ?: "https://github.com/mafiruss12/IPTV-KTP-FREE/releases/tag/$tag",
                isNewer = isRemoteVersionNewer(tag, BuildConfig.VERSION_NAME, BuildConfig.VERSION_CODE)
            )
        }
    }

    private fun fetchFromGitHubRedirect(): AppUpdateRelease? {
        val req = Request.Builder()
            .url(LATEST_RELEASE_WEB)
            .header("User-Agent", "Mozilla/5.0 (Linux; Android 14) KTP-IPTV/${BuildConfig.VERSION_NAME}")
            .build()

        client.newCall(req).execute().use { resp ->
            val finalUrl = resp.request.url.toString()
            val tag = finalUrl.substringAfter("/releases/tag/", "").substringBefore("?").trim()
            if (tag.isBlank()) return null
            val apkName = "KTP-IPTV-$tag.apk"
            return AppUpdateRelease(
                tag = tag,
                title = "KTP IPTV Android $tag",
                notes = "",
                apkUrl = "https://github.com/mafiruss12/IPTV-KTP-FREE/releases/download/$tag/$apkName",
                apkName = apkName,
                apkSizeBytes = 0L,
                htmlUrl = finalUrl,
                isNewer = isRemoteVersionNewer(tag, BuildConfig.VERSION_NAME, BuildConfig.VERSION_CODE)
            )
        }
    }

    suspend fun downloadAndInstallApk(
        context: Context,
        apkUrl: String,
        fileName: String,
        onProgress: (Float) -> Unit
    ): Result<InstallLaunchResult> = withContext(Dispatchers.IO) {
        runCatching {
            val downloadsDir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
                ?: context.cacheDir
            if (!downloadsDir.exists()) downloadsDir.mkdirs()

            val targetFile = File(downloadsDir, fileName.ifBlank { "ktp-iptv-update.apk" })
            val req = Request.Builder()
                .url(apkUrl)
                .header("User-Agent", "KTP-IPTV-Android/${BuildConfig.VERSION_NAME}")
                .build()

            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) {
                    throw IllegalStateException("Téléchargement impossible (HTTP ${resp.code})")
                }
                val body = resp.body ?: throw IllegalStateException("Réponse APK vide")
                val totalBytes = body.contentLength()
                var downloaded = 0L

                body.byteStream().use { input ->
                    FileOutputStream(targetFile).use { output ->
                        val buffer = ByteArray(16 * 1024)
                        while (true) {
                            val read = input.read(buffer)
                            if (read <= 0) break
                            output.write(buffer, 0, read)
                            downloaded += read
                            if (totalBytes > 0) {
                                onProgress((downloaded.toFloat() / totalBytes.toFloat()).coerceIn(0f, 1f))
                            }
                        }
                        output.flush()
                    }
                }
            }

            withContext(Dispatchers.Main) {
                launchApkInstaller(context, targetFile)
            }
        }
    }

    suspend fun launchApkInstaller(context: Context, apkFile: File): InstallLaunchResult =
        withContext(Dispatchers.Main) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
                !context.packageManager.canRequestPackageInstalls()
            ) {
                val permIntent = Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:${context.packageName}")
                ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(permIntent)
                return@withContext InstallLaunchResult.PermissionRequired(apkFile)
            }

            val uri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                apkFile
            )
            val installIntent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            context.startActivity(installIntent)
            InstallLaunchResult.InstallerLaunched
        }
}
