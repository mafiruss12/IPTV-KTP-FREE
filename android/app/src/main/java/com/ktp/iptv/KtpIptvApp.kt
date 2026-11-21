package com.ktp.iptv

import android.app.Application
import com.ktp.iptv.data.local.IptvDatabase
import com.ktp.iptv.data.remote.IptvOrgRepository
import com.ktp.iptv.data.remote.XtreamRepository
import com.ktp.iptv.proxy.LocalStreamProxy
import com.ktp.iptv.update.AppUpdateManager
import okhttp3.ConnectionSpec
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

class KtpIptvApp : Application() {

    lateinit var okHttpClient: OkHttpClient
        private set
    lateinit var localProxy: LocalStreamProxy
        private set
    lateinit var database: IptvDatabase
        private set
    lateinit var iptvOrgRepository: IptvOrgRepository
        private set
    lateinit var xtreamRepository: XtreamRepository
        private set
    lateinit var appUpdateManager: AppUpdateManager
        private set

    override fun onCreate() {
        super.onCreate()
        okHttpClient = OkHttpClient.Builder()
            .followRedirects(true)
            .followSslRedirects(true)
            .retryOnConnectionFailure(true)
            .connectionSpecs(
                listOf(
                    ConnectionSpec.MODERN_TLS,
                    ConnectionSpec.COMPATIBLE_TLS,
                    ConnectionSpec.CLEARTEXT
                )
            )
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(45, TimeUnit.SECONDS)
            .build()

        localProxy = LocalStreamProxy(okHttpClient).apply { start() }
        database = IptvDatabase.getInstance(this)
        iptvOrgRepository = IptvOrgRepository(okHttpClient)
        xtreamRepository = XtreamRepository(okHttpClient)
        appUpdateManager = AppUpdateManager(okHttpClient)
    }

    override fun onTerminate() {
        localProxy.stop()
        super.onTerminate()
    }
}
