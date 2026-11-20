# KTP IPTV — Application Mobile Kotlin & Proxy HTTP/HTTPS

Application IPTV complète composée d'une **application Android native en Kotlin (Jetpack Compose + Media3 ExoPlayer)**, d'un **proxy HTTP ↔ HTTPS hybride** (embarqué localement sur Android + relais Express/Node.js), et d'une **interface Web interactive**.

## Fonctionnalités principales

- **Lecture M3U / M3U8 & Xtream Codes** :
  - Parseur complet `#EXTM3U`, `#EXTINF`, `tvg-id`, `tvg-logo`, `group-title`, `tvg-country`, `tvg-language`, et `#EXTVLCOPT:http-user-agent` / `http-referrer`.
  - Client **Xtream Codes API** (`player_api.php`) prenant en charge **Live TV**, **VOD** et **Séries**.
- **Analyse & Catalogue `iptv-org/iptv`** :
  - Agrégation en direct des API `streams.json`, `channels.json`, `feeds.json`, `logos.json`, `countries.json`, `categories.json` et `languages.json`.
  - Filtrage multi-critères : **Pays**, **Type de chaîne** (`TV Live 24/7`, `Événement / Part-time`, `VOD`, `Séries`, `Radio`), **Catégorie**, **Langue** et **Protocole (HTTP/HTTPS)**.
  - **Recherche rapide** instantanée.
- **Listes de favoris personnalisées** :
  - Stockage persistant Room (`IptvDatabase.kt`) sur Android et `localStorage` sur le Web.
  - Création de collections personnalisées et export `.m3u`.
- **Proxy HTTP ↔ HTTPS (Résolution Mixed Content & En-têtes)** :
  - Sur les ~19 300 flux `iptv-org`, environ 20 % utilisent `http://` sans TLS ou exigent des en-têtes `User-Agent`/`Referer`.
  - **Android (`LocalStreamProxy.kt`)** : serveur local `127.0.0.1` couplé à OkHttp qui suit les redirections HTTP/HTTPS, injecte les en-têtes et réécrit les manifestes `.m3u8` + clés `#EXT-X-KEY` à la volée, complété par `network_security_config.xml`.
  - **Serveur Express (`server.ts`)** : endpoint `/api/proxy/stream` convertissant les flux HTTP et API Xtream HTTP en HTTPS avec réécriture HLS et CORS.

## Structure du projet

- `android/` : Projet Android Studio complet (Kotlin 2.0, Jetpack Compose Material 3, Media3 ExoPlayer, Room, OkHttp, Coil).
- `server.ts` & `src/` : Serveur Proxy HTTP/HTTPS Express + Client Web React/Tailwind/hls.js.
- `.github/workflows/android-ci.yml` : Pipeline CI/CD automatisant les tests unitaires Kotlin (`gradle testDebugUnitTest`), le build APK Debug/Release (`gradle assembleDebug assembleRelease`) et la publication automatique des APK sur **GitHub Releases**.
- `.github/workflows/web-proxy-ci.yml` : Pipeline CI vérifiant le TypeScript et le build du serveur proxy/web.

## Lancer le Proxy HTTPS & Web en local

```bash
npm install
npm run dev
```

## Build Android (CLI)

```bash
cd android
gradle testDebugUnitTest assembleDebug
```
