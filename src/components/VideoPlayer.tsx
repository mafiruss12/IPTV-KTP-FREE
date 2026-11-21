import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  AlertCircle,
  Bookmark,
  Check,
  FolderPlus,
  Lock,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Ratio,
  RefreshCw,
  Settings,
  ShieldCheck,
  SkipBack,
  SkipForward,
  Unlock,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type {
  AspectRatioMode,
  FavoriteList,
  IptvChannel,
  ProxyMode,
  VideoQualityLevel,
} from '../types/iptv';
import { ChannelLogo } from './ChannelLogo';

interface VideoPlayerProps {
  channel: IptvChannel | null;
  proxyMode: ProxyMode;
  onChangeProxyMode: (mode: ProxyMode) => void;
  isFavorite: boolean;
  onToggleFavorite: (channel: IptvChannel) => void;
  favoriteLists: FavoriteList[];
  onToggleChannelInList: (listId: string, channelId: string) => void;
  onPrevChannel?: () => void;
  onNextChannel?: () => void;
}

const ASPECT_MODES: Array<{ id: AspectRatioMode; label: string }> = [
  { id: 'fit', label: 'Adapter' },
  { id: 'fill', label: 'Remplir' },
  { id: 'zoom', label: 'Zoom' },
  { id: '16:9', label: '16:9' },
  { id: '4:3', label: '4:3' },
];

export function resolvePlaybackUrl(channel: IptvChannel, proxyMode: ProxyMode): {
  playUrl: string;
  viaProxy: boolean;
} {
  if (proxyMode === 'direct') {
    return { playUrl: channel.url, viaProxy: false };
  }

  const params = new URLSearchParams();
  params.set('url', channel.url);
  if (channel.userAgent) params.set('ua', channel.userAgent);
  if (channel.referrer) params.set('ref', channel.referrer);
  return { playUrl: `/api/proxy/stream?${params.toString()}`, viaProxy: true };
}

function formatQualityLabel(height: number): string {
  if (height >= 2160) return `${height}p · 4K UHD`;
  if (height >= 1080) return `${height}p · Full HD`;
  if (height >= 720) return `${height}p · HD`;
  if (height >= 480) return `${height}p · SD`;
  return height > 0 ? `${height}p` : 'Flux standard';
}

export function VideoPlayer({
  channel,
  proxyMode,
  onChangeProxyMode,
  isFavorite,
  onToggleFavorite,
  favoriteLists,
  onToggleChannelInList,
  onPrevChannel,
  onNextChannel,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [status, setStatus] = useState<'idle' | 'loading' | 'playing' | 'paused' | 'error'>('idle');
  const [errorText, setErrorText] = useState('');
  const [muted, setMuted] = useState(false);
  const [resolution, setResolution] = useState<string>('');
  const [qualityLevels, setQualityLevels] = useState<VideoQualityLevel[]>([]);
  const [selectedLevel, setSelectedLevel] = useState<number>(-1); // -1 = Auto
  const [aspectMode, setAspectMode] = useState<AspectRatioMode>('fit');
  const [locked, setLocked] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showQualitySheet, setShowQualitySheet] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [retrySeed, setRetrySeed] = useState(0);
  const [showListMenu, setShowListMenu] = useState(false);
  const [clockText, setClockText] = useState(() =>
    new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  );

  const resolved = channel ? resolvePlaybackUrl(channel, proxyMode) : null;

  useEffect(() => {
    const interval = setInterval(() => {
      setClockText(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !channel || !resolved) {
      setStatus('idle');
      return;
    }

    setStatus('loading');
    setErrorText('');
    setResolution('');
    setQualityLevels([]);
    setSelectedLevel(-1);
    setShowQualitySheet(false);

    let hls: Hls | null = null;
    let cancelled = false;
    const { playUrl } = resolved;

    const syncDimensions = () => {
      if (video.videoWidth && video.videoHeight) {
        setResolution(`${video.videoWidth}×${video.videoHeight}`);
      }
    };

    const handleCanPlay = () => {
      if (cancelled) return;
      syncDimensions();
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

    const handlePlay = () => {
      if (!cancelled) setStatus('playing');
    };
    const handlePause = () => {
      if (!cancelled && !video.ended) setStatus('paused');
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
    video.addEventListener('loadedmetadata', syncDimensions);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('error', handleVideoError);

    const isDirectMp4 = /\.(mp4|mkv|webm)(\?|$)/i.test(channel.url);

    if (!isDirectMp4 && Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        manifestLoadingTimeOut: 15000,
        fragLoadingTimeOut: 15000,
      });
      hlsRef.current = hls;
      hls.loadSource(playUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_evt, data) => {
        if (cancelled) return;
        const rawLevels = data.levels || [];
        const uniqueByHeight = new Map<number, VideoQualityLevel>();
        rawLevels.forEach((lvl, idx) => {
          const h = lvl.height || 0;
          const existing = uniqueByHeight.get(h);
          const kbps = Math.round((lvl.bitrate || 0) / 1000);
          if (!existing || kbps > existing.bitrateKbps) {
            uniqueByHeight.set(h, {
              index: idx,
              label: formatQualityLabel(h),
              height: h,
              width: lvl.width || 0,
              bitrateKbps: kbps,
            });
          }
        });
        const sortedLevels = Array.from(uniqueByHeight.values()).sort(
          (a, b) => b.height - a.height || b.bitrateKbps - a.bitrateKbps
        );
        setQualityLevels(sortedLevels);

        const best = rawLevels[rawLevels.length - 1];
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

      hls.on(Hls.Events.LEVEL_SWITCHED, (_evt, data) => {
        if (cancelled || !hls) return;
        const lvl = hls.levels?.[data.level];
        if (lvl?.height) {
          setResolution(`${lvl.width || '?'}×${lvl.height}`);
        }
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
      hlsRef.current = null;
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('loadedmetadata', syncDimensions);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('error', handleVideoError);
      if (hls) {
        hls.destroy();
      }
      video.removeAttribute('src');
      video.load();
    };
  }, [channel?.id, channel?.url, proxyMode, retrySeed]);

  const handleSelectQualityLevel = (index: number) => {
    setSelectedLevel(index);
    if (hlsRef.current) {
      hlsRef.current.currentLevel = index;
    }
    setShowQualitySheet(false);
  };

  const handleCycleAspect = () => {
    const idx = ASPECT_MODES.findIndex((m) => m.id === aspectMode);
    const next = ASPECT_MODES[(idx + 1) % ASPECT_MODES.length];
    setAspectMode(next.id);
  };

  const handleTogglePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  const handleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen().catch(() => {});
    }
  };

  const getVideoStyleClass = () => {
    switch (aspectMode) {
      case 'fill':
        return 'w-full h-full object-fill';
      case 'zoom':
        return 'w-full h-full object-cover';
      case '16:9':
        return 'w-full h-full object-contain aspect-video mx-auto';
      case '4:3':
        return 'h-full aspect-[4/3] object-fill mx-auto';
      default:
        return 'w-full h-full object-contain';
    }
  };

  const activeQualityText =
    selectedLevel === -1
      ? resolution
        ? `Auto (${resolution})`
        : 'Auto'
      : qualityLevels.find((l) => l.index === selectedLevel)?.label.split(' · ')[0] || 'Fixe';

  const activeAspectLabel = ASPECT_MODES.find((m) => m.id === aspectMode)?.label || 'Adapter';

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
          Parcourez les flux iptv-org par pays, catégorie, résolution et langue, ou importez une playlist M3U / Xtream.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-[#131720] border border-slate-800/80 overflow-hidden">
      <div
        ref={containerRef}
        onClick={() => {
          if (status !== 'error') setShowControls((v) => !v);
        }}
        className="relative aspect-video bg-black flex items-center justify-center select-none group"
      >
        <video
          ref={videoRef}
          playsInline
          muted={muted}
          className={`${getVideoStyleClass()} bg-black transition-all`}
        />

        {/* Loading Spinner */}
        {status === 'loading' && (
          <div className="absolute inset-0 bg-[#0B0D11]/85 flex flex-col items-center justify-center gap-2.5 p-4 text-center z-10">
            <RefreshCw className="w-7 h-7 text-rose-500 animate-spin" />
            <span className="text-xs font-medium text-slate-200">
              {resolved?.viaProxy
                ? 'Relais Proxy HTTPS en cours…'
                : 'Connexion directe au flux…'}
            </span>
          </div>
        )}

        {/* Error Overlay */}
        {status === 'error' && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-0 bg-[#0B0D11]/95 flex flex-col items-center justify-center p-5 text-center z-20"
          >
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

        {/* OTT Broadcast HUD Overlay (when playing/paused) */}
        {status !== 'error' && status !== 'idle' && (
          <div
            onClick={(e) => e.stopPropagation()}
            className={`absolute inset-0 z-10 flex flex-col justify-between p-3 sm:p-4 transition-opacity duration-200 pointer-events-none ${
              showControls || showQualitySheet || status === 'paused' ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {/* Top Gradient & Header Bar */}
            {!locked ? (
              <div className="bg-gradient-to-b from-black/80 via-black/40 to-transparent -m-3 sm:-m-4 p-3 sm:p-4 pb-8 flex items-center justify-between gap-3 pointer-events-auto">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                  <span className="text-xs sm:text-sm font-semibold text-white truncate">
                    {channel.name}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0 text-xs text-slate-200 font-mono">
                  <span className="hidden sm:inline">{clockText}</span>
                  <button
                    type="button"
                    onClick={handleFullscreen}
                    aria-label={isFullscreen ? 'Quitter le plein écran' : 'Plein écran'}
                    className="min-h-[36px] min-w-[36px] rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                  >
                    {isFullscreen ? (
                      <Minimize2 className="w-4 h-4" />
                    ) : (
                      <Maximize2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex justify-end pointer-events-auto">
                <button
                  type="button"
                  onClick={() => setLocked(false)}
                  aria-label="Déverrouiller l'écran"
                  className="min-h-[40px] px-3 rounded-xl bg-black/75 border border-white/20 text-white text-xs font-medium inline-flex items-center gap-1.5"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>Déverrouiller</span>
                </button>
              </div>
            )}

            {/* Center Play/Pause Button */}
            {!locked && status !== 'loading' && (
              <div className="flex items-center justify-center pointer-events-auto">
                <button
                  type="button"
                  onClick={handleTogglePlayPause}
                  aria-label={status === 'playing' ? 'Mettre en pause' : 'Lire'}
                  className="w-12 h-12 rounded-full bg-white/90 hover:bg-white text-black flex items-center justify-center shadow-lg transition-transform active:scale-95"
                >
                  {status === 'playing' ? (
                    <Pause className="w-5 h-5 fill-black" />
                  ) : (
                    <Play className="w-5 h-5 fill-black ml-0.5" />
                  )}
                </button>
              </div>
            )}

            {/* Bottom Control Bar */}
            {!locked ? (
              <div className="bg-gradient-to-t from-black/85 via-black/50 to-transparent -m-3 sm:-m-4 p-3 sm:p-4 pt-8 space-y-2 pointer-events-auto">
                {/* Clean single-line metadata replacing duplicated "No Program found" */}
                <div className="flex items-center justify-between gap-2 text-[11px] sm:text-xs text-slate-300">
                  <span className="truncate">
                    {channel.countryFlag} {channel.countryName} · {channel.categories[0] || 'Direct'} ·{' '}
                    {resolved?.viaProxy ? 'Proxy HTTPS' : 'Direct'}
                  </span>
                  <span className="font-mono text-slate-200 shrink-0">{activeQualityText}</span>
                </div>

                {/* Progress/Broadcast Live Accent Line */}
                <div className="h-0.5 w-full bg-white/25 rounded-full overflow-hidden">
                  <div className="h-full w-full bg-rose-500" />
                </div>

                {/* OTT Action Controls Row */}
                <div className="flex items-center justify-between gap-2 pt-0.5">
                  <div className="flex items-center gap-1 sm:gap-1.5">
                    <button
                      type="button"
                      onClick={() => setLocked(true)}
                      aria-label="Verrouiller l'écran"
                      className="min-h-[38px] min-w-[38px] rounded-lg hover:bg-white/15 text-white flex items-center justify-center transition-colors"
                    >
                      <Lock className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={handleCycleAspect}
                      title={`Format d'image : ${activeAspectLabel}`}
                      className="min-h-[38px] px-2 rounded-lg hover:bg-white/15 text-white text-[11px] font-medium inline-flex items-center gap-1 transition-colors whitespace-nowrap"
                    >
                      <Ratio className="w-4 h-4" />
                      <span className="hidden sm:inline">{activeAspectLabel}</span>
                    </button>
                    {onPrevChannel && (
                      <button
                        type="button"
                        onClick={onPrevChannel}
                        aria-label="Chaîne précédente"
                        className="min-h-[38px] min-w-[38px] rounded-lg hover:bg-white/15 text-white flex items-center justify-center transition-colors"
                      >
                        <SkipBack className="w-4 h-4" />
                      </button>
                    )}
                    {onNextChannel && (
                      <button
                        type="button"
                        onClick={onNextChannel}
                        aria-label="Chaîne suivante"
                        className="min-h-[38px] min-w-[38px] rounded-lg hover:bg-white/15 text-white flex items-center justify-center transition-colors"
                      >
                        <SkipForward className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1 sm:gap-1.5 relative">
                    <button
                      type="button"
                      onClick={() => {
                        if (videoRef.current) {
                          videoRef.current.muted = !videoRef.current.muted;
                          setMuted(videoRef.current.muted);
                        }
                      }}
                      aria-label={muted ? 'Activer le son' : 'Couper le son'}
                      className="min-h-[38px] min-w-[38px] rounded-lg hover:bg-white/15 text-white flex items-center justify-center transition-colors"
                    >
                      {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowQualitySheet((v) => !v)}
                      aria-label="Résolution et format vidéo"
                      className={`min-h-[38px] px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                        showQualitySheet
                          ? 'bg-rose-600 text-white'
                          : 'bg-white/15 hover:bg-white/25 text-white'
                      }`}
                    >
                      <Settings className="w-3.5 h-3.5" />
                      <span>
                        {selectedLevel === -1
                          ? 'Qualité'
                          : `${qualityLevels.find((l) => l.index === selectedLevel)?.height || ''}p`}
                      </span>
                    </button>

                    {showQualitySheet && (
                      <div className="absolute right-0 bottom-11 z-30 w-64 rounded-xl bg-[#131720]/95 backdrop-blur-md border border-slate-700 shadow-2xl p-3 space-y-3 text-left">
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                            Résolution vidéo
                          </div>
                          <div className="space-y-1 max-h-40 overflow-y-auto">
                            <button
                              type="button"
                              onClick={() => handleSelectQualityLevel(-1)}
                              className={`w-full px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors ${
                                selectedLevel === -1
                                  ? 'bg-blue-600/25 text-blue-300 font-semibold'
                                  : 'text-slate-200 hover:bg-slate-800'
                              }`}
                            >
                              <span>Auto (Adaptatif)</span>
                              {selectedLevel === -1 && <Check className="w-3.5 h-3.5" />}
                            </button>
                            {qualityLevels.length > 0 ? (
                              qualityLevels.map((lvl) => (
                                <button
                                  key={lvl.index}
                                  type="button"
                                  onClick={() => handleSelectQualityLevel(lvl.index)}
                                  className={`w-full px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors ${
                                    selectedLevel === lvl.index
                                      ? 'bg-blue-600/25 text-blue-300 font-semibold'
                                      : 'text-slate-200 hover:bg-slate-800'
                                  }`}
                                >
                                  <span>{lvl.label}</span>
                                  <span className="font-mono text-[10px] text-slate-400 flex items-center gap-1">
                                    {lvl.bitrateKbps > 0
                                      ? `${(lvl.bitrateKbps / 1000).toFixed(1)} Mbps`
                                      : ''}
                                    {selectedLevel === lvl.index && <Check className="w-3.5 h-3.5" />}
                                  </span>
                                </button>
                              ))
                            ) : (
                              <div className="px-2 py-1 text-[11px] text-slate-400">
                                Flux mono-résolution ({resolution || channel.quality || 'Standard'})
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="border-t border-slate-800 pt-2">
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                            Format d’affichage
                          </div>
                          <div className="grid grid-cols-3 gap-1">
                            {ASPECT_MODES.map((m) => (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => {
                                  setAspectMode(m.id);
                                  setShowQualitySheet(false);
                                }}
                                className={`px-2 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                                  aspectMode === m.id
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-[#0B0D11] text-slate-300 hover:bg-slate-800'
                                }`}
                              >
                                {m.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div />
            )}
          </div>
        )}
      </div>

      {/* Compact Player Metadata & Action Row below video */}
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

        {/* Proxy Mode Selector */}
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
