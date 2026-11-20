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
  SkipForward,
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
  onNextChannel?: () => void;
}

export function resolvePlaybackUrl(channel: IptvChannel, proxyMode: ProxyMode): {
  playUrl: string;
  viaProxy: boolean;
} {
  // In a browser, most HTTPS IPTV broadcasters omit CORS headers, causing hls.js manifestLoadError.
  // Therefore 'auto' and 'always' both route through the Express HTTPS CORS proxy unless 'direct' is chosen.
  if (proxyMode === 'direct') {
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
  onNextChannel,
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
            video
              .play()
              .then(() => {
                if (!cancelled) setStatus('playing');
              })
              .catch(() => {});
          }
        });
    };

    const handleVideoError = () => {
      if (cancelled) return;
      if (proxyMode === 'direct') {
        onChangeProxyMode('auto');
        return;
      }
      setStatus('error');
      setErrorText('Flux temporairement indisponible ou géo-restreint par le diffuseur.');
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
        video
          .play()
          .then(() => {
            if (!cancelled) setStatus('playing');
          })
          .catch(() => {
            video.muted = true;
            setMuted(true);
            video
              .play()
              .then(() => {
                if (!cancelled) setStatus('playing');
              })
              .catch(() => {});
          });
      });
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (cancelled || !data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && proxyMode === 'direct') {
          onChangeProxyMode('auto');
          return;
        }
        setStatus('error');
        setErrorText(
          proxyMode === 'direct'
            ? 'Flux bloqué par CORS/HTTP. Basculez vers le Proxy HTTPS.'
            : `Diffuseur hors ligne ou géo-bloqué (${data.details}).`
        );
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl') || isDirectMp4) {
      video.src = playUrl;
    } else {
      setStatus('error');
      setErrorText('Format vidéo non pris en charge par ce navigateur.');
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
        <h2 className="font-display text-base sm:text-lg font-semibold text-white">
          Sélectionnez une chaîne
        </h2>
        <p className="text-xs sm:text-sm text-slate-400 max-w-md mt-1">
          Parcourez les flux iptv-org par pays, catégorie et langue, ou importez une playlist M3U / Xtream.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-[#131720] border border-slate-800/80 overflow-hidden">
      <div ref={containerRef} className="relative aspect-video bg-black">
        <video
          ref={videoRef}
          controls={status === 'playing'}
          playsInline
          muted={muted}
          className="w-full h-full object-contain bg-black"
        />

        {status === 'loading' && (
          <div className="absolute inset-0 bg-[#0B0D11]/90 flex flex-col items-center justify-center gap-2.5 p-4 text-center">
            <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" />
            <span className="text-xs font-medium text-slate-200">
              {resolved?.viaProxy
                ? 'Relais Proxy HTTPS en cours…'
                : 'Connexion directe au flux…'}
            </span>
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-0 bg-[#0B0D11]/95 flex flex-col items-center justify-center p-5 text-center">
            <AlertCircle className="w-7 h-7 text-rose-400 mb-2" />
            <p className="text-xs sm:text-sm font-medium text-white max-w-sm leading-relaxed">
              {errorText}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2.5 mt-4">
              <button
                type="button"
                onClick={() => setRetrySeed((s) => s + 1)}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Réessayer</span>
              </button>
              {onNextChannel && (
                <button
                  type="button"
                  onClick={onNextChannel}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-[#1B212E] hover:bg-slate-700 text-slate-100 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                  <span>Chaîne suivante</span>
                </button>
              )}
              {proxyMode === 'direct' && (
                <button
                  type="button"
                  onClick={() => onChangeProxyMode('auto')}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-[#1B212E] hover:bg-slate-700 text-blue-300 text-xs font-semibold transition-colors whitespace-nowrap"
                >
                  Activer Proxy HTTPS
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Compact single-screen-friendly Player Metadata & Action Row */}
      <div className="p-3.5 sm:p-4 border-t border-slate-800/80 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <ChannelLogo src={channel.logo} name={channel.name} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                {status === 'playing' && (
                  <span
                    className="w-2 h-2 rounded-full bg-rose-500 shrink-0"
                    aria-label="En direct"
                  />
                )}
                <h2 className="font-display text-sm sm:text-base font-semibold text-white truncate">
                  {channel.name}
                </h2>
              </div>
              <div className="text-xs text-slate-400 truncate mt-0.5">
                {channel.countryFlag} {channel.countryName} · {channel.categories[0] || 'general'}
                {resolution || channel.quality ? ` · ${resolution || channel.quality}` : ''}
                {` · ${resolved?.viaProxy ? 'Proxy HTTPS' : 'Direct'}`}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
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
              className={`min-h-[44px] min-w-[44px] sm:px-3 rounded-xl flex items-center justify-center gap-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                isFavorite
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-[#1B212E] hover:bg-slate-700 text-slate-200'
              }`}
            >
              <Bookmark className={`w-4 h-4 ${isFavorite ? 'fill-amber-400 text-amber-400' : ''}`} />
              <span className="hidden sm:inline">{isFavorite ? 'Favori' : 'Favoris'}</span>
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

        {/* Clean full-width Proxy Mode selector without clipping */}
        <div className="grid grid-cols-3 gap-1 p-1 bg-[#0B0D11] rounded-xl border border-slate-800">
          {(['auto', 'always', 'direct'] as ProxyMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onChangeProxyMode(mode)}
              className={`min-h-[36px] px-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap truncate ${
                proxyMode === mode
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {mode === 'auto' ? 'Proxy Auto' : mode === 'always' ? 'Proxy Forcé' : 'Direct'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
