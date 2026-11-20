import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  AlertCircle,
  Bookmark,
  FolderPlus,
  Maximize2,
  Play,
  RefreshCw,
  ShieldCheck,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { FavoriteList, IptvChannel, ProxyMode } from '../types/iptv';
import { ChannelLogo } from './ChannelLogo';

interface VideoPlayerProps {
  channel: IptvChannel | null;
  proxyMode: ProxyMode;
  onChangeProxyMode: (mode: ProxyMode) => void;
  isFavorite: boolean;
  onToggleFavorite: (channel: IptvChannel) => void;
  favoriteLists: FavoriteList[];
  onToggleChannelInList: (listId: string, channelId: string) => void;
}

export function resolvePlaybackUrl(channel: IptvChannel, proxyMode: ProxyMode): {
  playUrl: string;
  viaProxy: boolean;
} {
  const needsProxy =
    proxyMode === 'always' ||
    (proxyMode === 'auto' &&
      (channel.isHttp || Boolean(channel.userAgent) || Boolean(channel.referrer)));

  if (!needsProxy) {
    return { playUrl: channel.url, viaProxy: false };
  }

  const params = new URLSearchParams();
  params.set('url', channel.url);
  if (channel.userAgent) params.set('ua', channel.userAgent);
  if (channel.referrer) params.set('ref', channel.referrer);
  return { playUrl: `/api/proxy/stream?${params.toString()}`, viaProxy: true };
}

export function VideoPlayer({
  channel,
  proxyMode,
  onChangeProxyMode,
  isFavorite,
  onToggleFavorite,
  favoriteLists,
  onToggleChannelInList,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'playing' | 'error'>('idle');
  const [errorText, setErrorText] = useState('');
  const [muted, setMuted] = useState(false);
  const [resolution, setResolution] = useState<string>('');
  const [retrySeed, setRetrySeed] = useState(0);
  const [showListMenu, setShowListMenu] = useState(false);

  const resolved = channel ? resolvePlaybackUrl(channel, proxyMode) : null;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !channel || !resolved) {
      setStatus('idle');
      return;
    }

    setStatus('loading');
    setErrorText('');
    setResolution('');

    let hls: Hls | null = null;
    let cancelled = false;
    const { playUrl } = resolved;

    const handleCanPlay = () => {
      if (cancelled) return;
      if (video.videoWidth && video.videoHeight) {
        setResolution(`${video.videoWidth}×${video.videoHeight}`);
      }
      video
        .play()
        .then(() => {
          if (!cancelled) setStatus('playing');
        })
        .catch(() => {
          if (!cancelled) {
            video.muted = true;
            setMuted(true);
            video.play().then(() => {
              if (!cancelled) setStatus('playing');
            }).catch(() => {});
          }
        });
    };

    const handleVideoError = () => {
      if (cancelled) return;
      setStatus('error');
      setErrorText(
        proxyMode === 'direct'
          ? 'Flux bloqué ou incompatible HTTP/CORS. Essayez le mode Proxy HTTPS.'
          : 'Flux temporairement hors ligne ou géo-restreint par le diffuseur.'
      );
    };

    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('error', handleVideoError);

    const isDirectMp4 = /\.(mp4|mkv|webm)(\?|$)/i.test(channel.url);

    if (!isDirectMp4 && Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        manifestLoadingTimeOut: 15000,
        fragLoadingTimeOut: 15000,
      });
      hls.loadSource(playUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, (_evt, data) => {
        if (cancelled) return;
        const best = data.levels?.[data.levels.length - 1];
        if (best?.height) setResolution(`${best.width || '?'}×${best.height}`);
        video.play().then(() => {
          if (!cancelled) setStatus('playing');
        }).catch(() => {
          video.muted = true;
          setMuted(true);
          video.play().catch(() => {});
        });
      });
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (cancelled || !data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && proxyMode === 'direct') {
          onChangeProxyMode('always');
          return;
        }
        setStatus('error');
        setErrorText(
          `Erreur réseau HLS (${data.details}). ${
            !resolved.viaProxy ? 'Activez le Proxy HTTPS pour contourner HTTP/CORS.' : 'Source indisponible.'
          }`
        );
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl') || isDirectMp4) {
      video.src = playUrl;
    } else {
      setStatus('error');
      setErrorText('Format vidéo non pris en charge par ce navigateur (utilisez Android ExoPlayer).');
    }

    return () => {
      cancelled = true;
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('error', handleVideoError);
      if (hls) {
        hls.destroy();
      }
      video.removeAttribute('src');
      video.load();
    };
  }, [channel?.id, channel?.url, proxyMode, retrySeed]);

  const handleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen().catch(() => {});
    }
  };

  if (!channel) {
    return (
      <div className="rounded-2xl bg-[#131720] border border-slate-800/80 aspect-video flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-[#1B212E] flex items-center justify-center mb-3">
          <Play className="w-5 h-5 text-blue-400" />
        </div>
        <h2 className="font-display text-lg font-semibold text-white">Sélectionnez une chaîne</h2>
        <p className="text-sm text-slate-400 max-w-md mt-1">
          Parcourez les flux iptv-org par pays, catégorie et langue, ou importez votre playlist M3U / Xtream Codes.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-[#131720] border border-slate-800/80 overflow-hidden">
      <div ref={containerRef} className="relative aspect-video bg-black group">
        <video
          ref={videoRef}
          controls
          playsInline
          muted={muted}
          className="w-full h-full object-contain bg-black"
        />

        {status === 'loading' && (
          <div className="absolute inset-0 bg-black/70 backdrop-blur-xs flex flex-col items-center justify-center gap-2 pointer-events-none">
            <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" />
            <span className="text-xs font-medium text-slate-200">
              {resolved?.viaProxy ? 'Connexion via proxy HTTP → HTTPS…' : 'Chargement du flux direct…'}
            </span>
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center p-6 text-center">
            <AlertCircle className="w-8 h-8 text-rose-400 mb-2" />
            <p className="text-sm font-medium text-white max-w-md">{errorText}</p>
            <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
              <button
                type="button"
                onClick={() => setRetrySeed((s) => s + 1)}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors whitespace-nowrap"
              >
                Réessayer
              </button>
              {proxyMode !== 'always' && (
                <button
                  type="button"
                  onClick={() => onChangeProxyMode('always')}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-[#1B212E] hover:bg-slate-700 text-slate-100 text-xs font-semibold transition-colors whitespace-nowrap"
                >
                  Forcer Proxy HTTPS
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Player Meta & Controls Bar */}
      <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-slate-800/80">
        <div className="flex items-center gap-3 min-w-0">
          <ChannelLogo src={channel.logo} name={channel.name} size="md" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              {status === 'playing' && (
                <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" aria-label="Lecture en direct" />
              )}
              <h2 className="font-display text-base font-semibold text-white truncate">
                {channel.name}
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400 mt-0.5">
              <span>{channel.countryFlag} {channel.countryName}</span>
              <span aria-hidden="true">·</span>
              <span className="capitalize">{channel.categories.slice(0, 2).join(', ')}</span>
              {channel.languageNames.length > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{channel.languageNames.slice(0, 2).join(', ')}</span>
                </>
              )}
              {(resolution || channel.quality) && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono text-slate-300">{resolution || channel.quality}</span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span className="font-mono text-blue-400">
                {resolved?.viaProxy ? (channel.isHttp ? 'HTTP → HTTPS Proxy' : 'HTTPS Proxied') : 'HTTPS Direct'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <div className="flex items-center bg-[#0B0D11] p-1 rounded-xl border border-slate-800">
            {(['auto', 'always', 'direct'] as ProxyMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onChangeProxyMode(mode)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  proxyMode === mode
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {mode === 'auto' ? 'Proxy Auto' : mode === 'always' ? 'Proxy Forcé' : 'Direct'}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              if (videoRef.current) {
                videoRef.current.muted = !videoRef.current.muted;
                setMuted(videoRef.current.muted);
              }
            }}
            aria-label={muted ? 'Activer le son' : 'Couper le son'}
            className="min-h-[44px] min-w-[44px] rounded-xl bg-[#1B212E] hover:bg-slate-700 text-slate-200 flex items-center justify-center transition-colors"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={() => onToggleFavorite(channel)}
            aria-label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            className={`min-h-[44px] px-3 rounded-xl flex items-center gap-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              isFavorite
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'bg-[#1B212E] hover:bg-slate-700 text-slate-200'
            }`}
          >
            <Bookmark className={`w-4 h-4 ${isFavorite ? 'fill-amber-400 text-amber-400' : ''}`} />
            <span>{isFavorite ? 'Favori' : 'Favoris'}</span>
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowListMenu((v) => !v)}
              aria-label="Classer dans une liste personnalisée"
              className="min-h-[44px] min-w-[44px] rounded-xl bg-[#1B212E] hover:bg-slate-700 text-slate-200 flex items-center justify-center transition-colors"
            >
              <FolderPlus className="w-4 h-4" />
            </button>
            {showListMenu && (
              <div className="absolute right-0 bottom-12 z-30 w-56 rounded-xl bg-[#181E29] border border-slate-700 shadow-xl p-2">
                <div className="px-2 py-1 text-xs font-semibold text-slate-300 border-b border-slate-700/70 mb-1">
                  Listes personnalisées
                </div>
                {favoriteLists.map((list) => {
                  const checked = list.channelIds.includes(channel.id);
                  return (
                    <button
                      key={list.id}
                      type="button"
                      onClick={() => onToggleChannelInList(list.id, channel.id)}
                      className="w-full text-left px-2.5 py-2 rounded-lg text-xs hover:bg-slate-800 flex items-center justify-between text-slate-200"
                    >
                      <span className="truncate">{list.name}</span>
                      {checked && <ShieldCheck className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleFullscreen}
            aria-label="Plein écran"
            className="min-h-[44px] min-w-[44px] rounded-xl bg-[#1B212E] hover:bg-slate-700 text-slate-200 flex items-center justify-center transition-colors"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
