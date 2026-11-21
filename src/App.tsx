import { useEffect, useMemo, useState } from 'react';
import {
  Bookmark,
  ChevronDown,
  ChevronRight,
  Code2,
  Compass,
  Download,
  Folder,
  Globe,
  History,
  Home,
  LayoutList,
  Menu,
  Play,
  Radio,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Tv,
  X,
} from 'lucide-react';
import type {
  CatalogMetaResponse,
  ChannelType,
  FavoriteList,
  IptvChannel,
  PlaylistSource,
  ProxyMode,
  ResolutionBucket,
} from './types/iptv';
import { ChannelLogo } from './components/ChannelLogo';
import { VideoPlayer } from './components/VideoPlayer';
import { SourcesPanel } from './components/SourcesModal';
import { FavoritesView } from './components/FavoritesView';
import { KotlinProjectView } from './components/KotlinProjectView';

type ActiveTab = 'home' | 'channels' | 'favorites' | 'sources' | 'kotlin';

interface AppUpdateInfo {
  tag: string;
  name: string;
  publishedAt: string;
  notes: string;
  htmlUrl: string;
  apkName: string | null;
  apkUrl: string | null;
  apkSize: number;
}

const LS_FAVORITES_KEY = 'ktp_iptv_favorites_v1';
const LS_SOURCES_KEY = 'ktp_iptv_sources_v1';
const LS_CUSTOM_CHANNELS_KEY = 'ktp_iptv_custom_channels_v1';
const LS_PROXY_MODE_KEY = 'ktp_iptv_proxy_mode_v1';
const LS_RECENT_CHANNELS_KEY = 'ktp_iptv_recent_v1';

const CHANNEL_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'Tous les types' },
  { value: 'live_24_7', label: 'TV Live 24/7' },
  { value: 'part_time', label: 'Événement / Part-time' },
  { value: 'vod', label: 'VOD / Films' },
  { value: 'series', label: 'Séries' },
  { value: 'radio', label: 'Radio' },
];

const RESOLUTION_OPTIONS: Array<{ value: 'all' | ResolutionBucket; label: string; short: string }> = [
  { value: 'all', label: 'Toutes résolutions', short: 'Toutes' },
  { value: '4k', label: '4K Ultra HD (2160p)', short: '4K UHD' },
  { value: '1080p', label: 'Full HD (1080p)', short: '1080p FHD' },
  { value: '720p', label: 'HD (720p)', short: '720p HD' },
  { value: 'sd', label: 'SD (480p / 576p)', short: '480p SD' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [liveViewMode, setLiveViewMode] = useState<'channels' | 'folders'>('channels');

  const [meta, setMeta] = useState<CatalogMetaResponse | null>(null);
  const [remoteChannels, setRemoteChannels] = useState<IptvChannel[]>([]);
  const [showcaseChannels, setShowcaseChannels] = useState<IptvChannel[]>([]);
  const [heroIndex, setHeroIndex] = useState(0);
  const [totalRemote, setTotalRemote] = useState(0);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [catalogError, setCatalogError] = useState('');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('ALL');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedLanguage, setSelectedLanguage] = useState('all');
  const [selectedResolution, setSelectedResolution] = useState<'all' | ResolutionBucket>('all');
  const [selectedProtocol, setSelectedProtocol] = useState<'all' | 'http' | 'https'>('all');
  const [sourceScope, setSourceScope] = useState<'all' | 'iptv-org' | 'custom'>('all');
  const [offset, setOffset] = useState(0);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Player & Proxy
  const [activeChannel, setActiveChannel] = useState<IptvChannel | null>(null);
  const [proxyMode, setProxyMode] = useState<ProxyMode>(() => {
    const saved = localStorage.getItem(LS_PROXY_MODE_KEY);
    return saved === 'always' || saved === 'direct' ? saved : 'auto';
  });
  const [showSystemModal, setShowSystemModal] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  // Recent watch history
  const [recentChannelIds, setRecentChannelIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(LS_RECENT_CHANNELS_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });

  // Favorites & Custom Sources
  const [favoriteLists, setFavoriteLists] = useState<FavoriteList[]>(() => {
    try {
      const raw = localStorage.getItem(LS_FAVORITES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as FavoriteList[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return [
      {
        id: 'default',
        name: 'Favoris généraux',
        channelIds: [],
        createdAt: new Date().toISOString(),
      },
    ];
  });

  const [sources, setSources] = useState<PlaylistSource[]>(() => {
    try {
      const raw = localStorage.getItem(LS_SOURCES_KEY);
      return raw ? (JSON.parse(raw) as PlaylistSource[]) : [];
    } catch {
      return [];
    }
  });

  const [customChannels, setCustomChannels] = useState<IptvChannel[]>(() => {
    try {
      const raw = localStorage.getItem(LS_CUSTOM_CHANNELS_KEY);
      return raw ? (JSON.parse(raw) as IptvChannel[]) : [];
    } catch {
      return [];
    }
  });

  const [channelLookup, setChannelLookup] = useState<Map<string, IptvChannel>>(() => new Map());

  useEffect(() => {
    localStorage.setItem(LS_FAVORITES_KEY, JSON.stringify(favoriteLists));
  }, [favoriteLists]);

  useEffect(() => {
    localStorage.setItem(LS_SOURCES_KEY, JSON.stringify(sources));
  }, [sources]);

  useEffect(() => {
    localStorage.setItem(LS_RECENT_CHANNELS_KEY, JSON.stringify(recentChannelIds.slice(0, 30)));
  }, [recentChannelIds]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_CUSTOM_CHANNELS_KEY, JSON.stringify(customChannels.slice(0, 2000)));
    } catch {
      // quota guard
    }
  }, [customChannels]);

  useEffect(() => {
    localStorage.setItem(LS_PROXY_MODE_KEY, proxyMode);
  }, [proxyMode]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 220);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const [africanShowcase, setAfricanShowcase] = useState<IptvChannel[]>([]);
  const [frenchShowcase, setFrenchShowcase] = useState<IptvChannel[]>([]);

  const loadMetaAndShowcase = async (forceRefresh = false) => {
    try {
      const [metaRes, hdRes, afrRes, frRes] = await Promise.all([
        fetch(`/api/iptv/meta${forceRefresh ? '?refresh=1' : ''}`).then((r) => r.json()),
        fetch('/api/iptv/channels?limit=40&offset=0').then((r) => r.json()),
        fetch('/api/iptv/channels?country=AFR&limit=16&offset=0').then((r) => r.json()),
        fetch('/api/iptv/channels?country=FR&limit=16&offset=0').then((r) => r.json()),
      ]);
      if (metaRes?.countries) setMeta(metaRes as CatalogMetaResponse);
      const collected: IptvChannel[] = [];
      if (Array.isArray(hdRes?.items)) {
        setShowcaseChannels(hdRes.items as IptvChannel[]);
        collected.push(...(hdRes.items as IptvChannel[]));
      }
      if (Array.isArray(afrRes?.items)) {
        setAfricanShowcase(afrRes.items as IptvChannel[]);
        collected.push(...(afrRes.items as IptvChannel[]));
      }
      if (Array.isArray(frRes?.items)) {
        setFrenchShowcase(frRes.items as IptvChannel[]);
        collected.push(...(frRes.items as IptvChannel[]));
      }
      if (collected.length > 0) {
        setChannelLookup((prev) => {
          const next = new Map(prev);
          for (const ch of collected) next.set(ch.id, ch);
          return next;
        });
      }
    } catch {
      // silent fallback
    }
  };

  // Load iptv-org metadata, showcase & check In-App Update release
  useEffect(() => {
    loadMetaAndShowcase(false);

    fetch('/api/app/update')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: AppUpdateInfo | null) => {
        if (data?.tag) setUpdateInfo(data);
      })
      .catch(() => {});
  }, []);

  const refreshUpdateCheck = async () => {
    setCheckingUpdate(true);
    try {
      const res = await fetch('/api/app/update');
      if (res.ok) {
        setUpdateInfo((await res.json()) as AppUpdateInfo);
      }
    } finally {
      setCheckingUpdate(false);
    }
  };

  // Load filtered iptv-org channels
  useEffect(() => {
    if (sourceScope === 'custom') {
      setLoadingCatalog(false);
      return;
    }

    let cancelled = false;
    setLoadingCatalog(true);
    setCatalogError('');
    setOffset(0);

    const params = new URLSearchParams({
      country: selectedCountry,
      category: selectedCategory,
      language: selectedLanguage,
      type: selectedType,
      resolution: selectedResolution,
      protocol: selectedProtocol,
      q: debouncedQuery,
      limit: '80',
      offset: '0',
    });

    fetch(`/api/iptv/channels?${params.toString()}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Erreur serveur');
        return data as { total: number; items: IptvChannel[] };
      })
      .then((data) => {
        if (cancelled) return;
        setRemoteChannels(data.items || []);
        setTotalRemote(data.total || 0);
        setChannelLookup((prev) => {
          const next = new Map(prev);
          for (const ch of data.items || []) next.set(ch.id, ch);
          return next;
        });
        setActiveChannel((curr) => curr || data.items?.[0] || null);
      })
      .catch((err) => {
        if (!cancelled) {
          setCatalogError(err instanceof Error ? err.message : 'Erreur réseau');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingCatalog(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    selectedCountry,
    selectedCategory,
    selectedLanguage,
    selectedType,
    selectedResolution,
    selectedProtocol,
    debouncedQuery,
    sourceScope,
  ]);

  useEffect(() => {
    setChannelLookup((prev) => {
      const next = new Map(prev);
      for (const ch of customChannels) next.set(ch.id, ch);
      return next;
    });
  }, [customChannels]);

  const handleSelectChannel = (ch: IptvChannel, switchToLive = false) => {
    setActiveChannel(ch);
    setChannelLookup((prev) => new Map(prev).set(ch.id, ch));
    setRecentChannelIds((prev) => [ch.id, ...prev.filter((id) => id !== ch.id)].slice(0, 30));
    if (switchToLive) {
      setLiveViewMode('channels');
      setActiveTab('channels');
    }
  };

  const handleLoadMore = async () => {
    if (loadingMore) return;
    const nextOffset = offset + 80;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({
        country: selectedCountry,
        category: selectedCategory,
        language: selectedLanguage,
        type: selectedType,
        resolution: selectedResolution,
        protocol: selectedProtocol,
        q: debouncedQuery,
        limit: '80',
        offset: String(nextOffset),
      });
      const res = await fetch(`/api/iptv/channels?${params.toString()}`);
      const data = (await res.json()) as { items: IptvChannel[] };
      if (data.items?.length) {
        setRemoteChannels((prev) => [...prev, ...data.items]);
        setOffset(nextOffset);
        setChannelLookup((prev) => {
          const next = new Map(prev);
          for (const ch of data.items) next.set(ch.id, ch);
          return next;
        });
      }
    } finally {
      setLoadingMore(false);
    }
  };

  const filteredCustomChannels = useMemo(() => {
    if (sourceScope === 'iptv-org') return [];
    const q = debouncedQuery.toLowerCase();
    return customChannels.filter((ch) => {
      if (selectedCountry === 'AFR') {
        if (!ch.isAfrican && ch.countryCode !== 'AFR') return false;
      } else if (selectedCountry !== 'ALL' && ch.countryCode !== selectedCountry) {
        return false;
      }
      if (selectedCategory !== 'all' && !ch.categories.includes(selectedCategory)) return false;
      if (selectedLanguage !== 'all' && !ch.languages.includes(selectedLanguage)) return false;
      if (selectedType !== 'all' && ch.type !== (selectedType as ChannelType)) return false;
      if (selectedResolution !== 'all' && ch.resolutionBucket !== selectedResolution) return false;
      if (selectedProtocol === 'http' && !ch.isHttp) return false;
      if (selectedProtocol === 'https' && ch.isHttp) return false;
      if (q) {
        const hay = `${ch.name} ${ch.sourceLabel} ${ch.categories.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    customChannels,
    sourceScope,
    selectedCountry,
    selectedCategory,
    selectedLanguage,
    selectedType,
    selectedResolution,
    selectedProtocol,
    debouncedQuery,
  ]);

  const displayedChannels = useMemo(() => {
    if (sourceScope === 'custom') return filteredCustomChannels;
    if (sourceScope === 'iptv-org') return remoteChannels;
    return [...filteredCustomChannels, ...remoteChannels];
  }, [sourceScope, filteredCustomChannels, remoteChannels]);

  const allFavoriteChannelIds = useMemo(() => {
    const set = new Set<string>();
    for (const list of favoriteLists) {
      for (const id of list.channelIds) set.add(id);
    }
    return set;
  }, [favoriteLists]);

  const recentChannels = useMemo(
    () =>
      recentChannelIds
        .map((id) => channelLookup.get(id))
        .filter((c): c is IptvChannel => Boolean(c)),
    [recentChannelIds, channelLookup]
  );

  const heroPool = useMemo(() => {
    const withLogos = showcaseChannels.filter((c) => Boolean(c.logo));
    const base = withLogos.length >= 5 ? withLogos : showcaseChannels;
    return base.slice(0, 5);
  }, [showcaseChannels]);

  const currentHero = heroPool[heroIndex % Math.max(heroPool.length, 1)] || null;

  const hdChannels = useMemo(
    () =>
      showcaseChannels
        .filter(
          (c) =>
            c.resolutionBucket === '4k' ||
            c.resolutionBucket === '1080p' ||
            c.resolutionBucket === '720p'
        )
        .slice(0, 14),
    [showcaseChannels]
  );

  const activeFilterCount =
    (selectedCountry !== 'ALL' ? 1 : 0) +
    (selectedType !== 'all' ? 1 : 0) +
    (selectedCategory !== 'all' ? 1 : 0) +
    (selectedLanguage !== 'all' ? 1 : 0) +
    (selectedResolution !== 'all' ? 1 : 0) +
    (selectedProtocol !== 'all' ? 1 : 0);

  const handleToggleFavorite = (channel: IptvChannel) => {
    setChannelLookup((prev) => new Map(prev).set(channel.id, channel));
    setFavoriteLists((prev) => {
      const existsInDefault = prev[0]?.channelIds.includes(channel.id);
      if (existsInDefault) {
        return prev.map((l) => ({
          ...l,
          channelIds: l.channelIds.filter((id) => id !== channel.id),
        }));
      }
      return prev.map((l, idx) =>
        idx === 0 ? { ...l, channelIds: [channel.id, ...l.channelIds] } : l
      );
    });
  };

  const handleToggleChannelInList = (listId: string, channelId: string) => {
    setFavoriteLists((prev) =>
      prev.map((l) => {
        if (l.id !== listId) return l;
        const exists = l.channelIds.includes(channelId);
        return {
          ...l,
          channelIds: exists
            ? l.channelIds.filter((id) => id !== channelId)
            : [channelId, ...l.channelIds],
        };
      })
    );
  };

  const handleCreateFavoriteList = (name: string) => {
    setFavoriteLists((prev) => [
      ...prev,
      {
        id: `list-${Date.now()}`,
        name,
        channelIds: [],
        createdAt: new Date().toISOString(),
      },
    ]);
  };

  const handleDeleteFavoriteList = (listId: string) => {
    setFavoriteLists((prev) => prev.filter((l) => l.id !== listId));
  };

  const handleAddSource = (source: PlaylistSource, channels: IptvChannel[]) => {
    setSources((prev) => [source, ...prev]);
    setCustomChannels((prev) => [...channels, ...prev]);
    if (channels[0]) handleSelectChannel(channels[0], true);
  };

  const handleRemoveSource = (sourceId: string) => {
    setSources((prev) => prev.filter((s) => s.id !== sourceId));
    setCustomChannels((prev) => prev.filter((c) => !c.id.startsWith(`${sourceId}:`)));
  };

  const handleNextChannel = () => {
    if (displayedChannels.length === 0) return;
    const idx = activeChannel
      ? displayedChannels.findIndex((c) => c.id === activeChannel.id)
      : -1;
    const next = displayedChannels[(idx + 1) % displayedChannels.length];
    if (next) handleSelectChannel(next);
  };

  const handlePrevChannel = () => {
    if (displayedChannels.length === 0) return;
    const idx = activeChannel
      ? displayedChannels.findIndex((c) => c.id === activeChannel.id)
      : 0;
    const prevIdx = idx <= 0 ? displayedChannels.length - 1 : idx - 1;
    const prev = displayedChannels[prevIdx];
    if (prev) handleSelectChannel(prev);
  };

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedCountry('ALL');
    setSelectedType('all');
    setSelectedCategory('all');
    setSelectedLanguage('all');
    setSelectedResolution('all');
    setSelectedProtocol('all');
    setSourceScope('all');
  };

  const openCategoryFolder = (categoryId: string) => {
    setSelectedCategory(categoryId);
    setLiveViewMode('channels');
    setActiveTab('channels');
  };

  const openResolutionFilter = (resBucket: 'all' | ResolutionBucket) => {
    setSelectedResolution(resBucket);
    setLiveViewMode('channels');
    setActiveTab('channels');
  };

  const openCountryExplorer = (countryCode: string) => {
    resetFilters();
    setSelectedCountry(countryCode);
    setLiveViewMode('channels');
    setActiveTab('channels');
  };

  const renderFilterSelects = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2.5">
      <div className="relative">
        <select
          aria-label="Filtrer par pays"
          value={selectedCountry}
          onChange={(e) => setSelectedCountry(e.target.value)}
          className="w-full h-11 pl-3 pr-8 rounded-xl bg-[#0B0D11] border border-slate-800 text-xs font-medium text-slate-200 appearance-none focus:outline-none focus:border-blue-500"
        >
          <option value="ALL">Pays : Tous ({meta?.countries.length || 182})</option>
          {meta?.countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.flag} {c.name} ({c.count})
            </option>
          ))}
        </select>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>

      <div className="relative">
        <select
          aria-label="Filtrer par type de chaîne"
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          className="w-full h-11 pl-3 pr-8 rounded-xl bg-[#0B0D11] border border-slate-800 text-xs font-medium text-slate-200 appearance-none focus:outline-none focus:border-blue-500"
        >
          {CHANNEL_TYPE_OPTIONS.map((t) => (
            <option key={t.value} value={t.value}>
              Type : {t.label}
            </option>
          ))}
        </select>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>

      <div className="relative">
        <select
          aria-label="Filtrer par catégorie"
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="w-full h-11 pl-3 pr-8 rounded-xl bg-[#0B0D11] border border-slate-800 text-xs font-medium text-slate-200 appearance-none focus:outline-none focus:border-blue-500"
        >
          <option value="all">Catégorie : Toutes</option>
          {meta?.categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name} ({cat.count})
            </option>
          ))}
        </select>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>

      <div className="relative">
        <select
          aria-label="Filtrer par langue"
          value={selectedLanguage}
          onChange={(e) => setSelectedLanguage(e.target.value)}
          className="w-full h-11 pl-3 pr-8 rounded-xl bg-[#0B0D11] border border-slate-800 text-xs font-medium text-slate-200 appearance-none focus:outline-none focus:border-blue-500"
        >
          <option value="all">Langue : Toutes</option>
          {meta?.languages.slice(0, 120).map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.name} ({lang.count})
            </option>
          ))}
        </select>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>

      <div className="relative">
        <select
          aria-label="Filtrer par résolution vidéo"
          value={selectedResolution}
          onChange={(e) => setSelectedResolution(e.target.value as 'all' | ResolutionBucket)}
          className="w-full h-11 pl-3 pr-8 rounded-xl bg-[#0B0D11] border border-slate-800 text-xs font-medium text-slate-200 appearance-none focus:outline-none focus:border-blue-500"
        >
          {RESOLUTION_OPTIONS.map((resOpt) => {
            const count =
              resOpt.value === 'all'
                ? undefined
                : meta?.resolutions?.find((r) => r.id === resOpt.value)?.count;
            return (
              <option key={resOpt.value} value={resOpt.value}>
                Résolution : {resOpt.short}
                {typeof count === 'number' && count > 0 ? ` (${count})` : ''}
              </option>
            );
          })}
        </select>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>

      <div className="relative">
        <select
          aria-label="Filtrer par protocole HTTP/HTTPS"
          value={selectedProtocol}
          onChange={(e) => setSelectedProtocol(e.target.value as 'all' | 'http' | 'https')}
          className="w-full h-11 pl-3 pr-8 rounded-xl bg-[#0B0D11] border border-slate-800 text-xs font-medium text-slate-200 appearance-none focus:outline-none focus:border-blue-500"
        >
          <option value="all">Protocole : HTTP & HTTPS</option>
          <option value="https">HTTPS natif ({meta?.stats.httpsCount || 0})</option>
          <option value="http">HTTP via Proxy ({meta?.stats.httpCount || 0})</option>
        </select>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0B0D11] text-slate-100 pb-20 md:pb-8">
      {/* 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 h-14 bg-[#0B0D11]/95 backdrop-blur-md border-b border-slate-800/80">
        <div className="max-w-[1440px] mx-auto h-full px-3 sm:px-6 flex items-center justify-between gap-4 sm:gap-8">
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Ouvrir le menu latéral"
              className="min-h-[44px] min-w-[44px] rounded-xl hover:bg-[#1B212E] text-slate-200 flex items-center justify-center transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('home')}
              className="font-display text-base sm:text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
            >
              KTP IPTV
            </button>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
            {[
              { id: 'home', label: 'Accueil' },
              { id: 'channels', label: 'Live TV' },
              { id: 'favorites', label: `Favoris (${allFavoriteChannelIds.size})` },
              { id: 'sources', label: 'M3U & Xtream' },
              { id: 'kotlin', label: 'Kotlin & CI/CD' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id as ActiveTab)}
                className={`whitespace-nowrap shrink-0 transition-colors ${
                  activeTab === item.id ? 'text-white' : 'hover:text-slate-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={() => setShowSystemModal(true)}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              Proxy & MàJ
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1440px] mx-auto px-3 sm:px-6 pt-3 sm:pt-5">
        {/* OTT HOME SHOWCASE SCREEN */}
        {activeTab === 'home' && (
          <div className="space-y-6">
            {/* Hero Featured Showcase Banner */}
            <section className="relative rounded-2xl overflow-hidden bg-[#131720] border border-slate-800/80 min-h-[260px] sm:min-h-[320px] flex flex-col justify-end p-5 sm:p-8">
              <div className="absolute inset-0 bg-gradient-to-br from-rose-950/35 via-[#131720] to-blue-950/35 pointer-events-none" />
              {currentHero?.logo && (
                <img
                  src={currentHero.logo}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="absolute right-6 top-6 w-28 h-28 sm:w-44 sm:h-44 object-contain opacity-25 pointer-events-none select-none"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#0B0D11] via-[#0B0D11]/60 to-transparent pointer-events-none" />

              <div className="relative z-10 max-w-2xl space-y-3">
                <div className="text-xs font-medium text-rose-400">
                  À la une · {meta ? `${meta.stats.totalChannels.toLocaleString('fr-FR')} flux indexés` : 'Catalogue iptv-org'}
                </div>
                <h1 className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-white">
                  {currentHero ? currentHero.name : 'KTP IPTV Broadcast'}
                </h1>
                <p className="text-xs sm:text-sm text-slate-300">
                  {currentHero
                    ? `${currentHero.countryFlag} ${currentHero.countryName} · ${currentHero.categories[0] || 'Général'} · ${currentHero.quality || 'Adaptatif'} · ${currentHero.isHttp ? 'Relais Proxy HTTPS' : 'HTTPS'}`
                    : 'Diffusez vos flux M3U, Xtream Codes et iptv-org avec sélecteur de résolution adaptatif et proxy HTTP↔HTTPS.'}
                </p>

                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  {currentHero && (
                    <button
                      type="button"
                      onClick={() => handleSelectChannel(currentHero, true)}
                      className="min-h-[44px] px-5 rounded-xl bg-white hover:bg-slate-200 text-black text-xs sm:text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap"
                    >
                      <Play className="w-4 h-4 fill-black" />
                      <span>Regarder</span>
                    </button>
                  )}
                  {currentHero && (
                    <button
                      type="button"
                      onClick={() => handleToggleFavorite(currentHero)}
                      className="min-h-[44px] px-4 rounded-xl bg-[#1B212E]/90 hover:bg-slate-700 text-white text-xs sm:text-sm font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap"
                    >
                      <Bookmark
                        className={`w-4 h-4 ${
                          allFavoriteChannelIds.has(currentHero.id)
                            ? 'fill-amber-400 text-amber-400'
                            : ''
                        }`}
                      />
                      <span>
                        {allFavoriteChannelIds.has(currentHero.id) ? 'Dans les favoris' : 'Favori'}
                      </span>
                    </button>
                  )}
                  {heroPool.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setHeroIndex((i) => (i + 1) % heroPool.length)}
                      className="min-h-[44px] px-4 rounded-xl bg-[#1B212E]/80 hover:bg-slate-700 text-slate-200 text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                    >
                      <span>Suivant</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {heroPool.length > 1 && (
                  <div className="flex items-center gap-2 pt-2">
                    {heroPool.map((item, idx) => (
                      <button
                        key={item.id}
                        type="button"
                        aria-label={`Afficher ${item.name}`}
                        onClick={() => setHeroIndex(idx)}
                        className={`h-2 rounded-full transition-all ${
                          idx === heroIndex % heroPool.length
                            ? 'w-6 bg-rose-500'
                            : 'w-2 bg-slate-600 hover:bg-slate-400'
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* Quick Resolution Type Selector Strip */}
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-base sm:text-lg font-semibold text-white">
                  Explorer par résolution vidéo
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedResolution('all');
                    setActiveTab('channels');
                  }}
                  className="text-xs font-medium text-blue-400 hover:text-blue-300 whitespace-nowrap"
                >
                  Tout parcourir
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {RESOLUTION_OPTIONS.map((resOpt) => {
                  const count =
                    resOpt.value === 'all'
                      ? meta?.stats.totalChannels
                      : meta?.resolutions?.find((r) => r.id === resOpt.value)?.count;
                  return (
                    <button
                      key={resOpt.value}
                      type="button"
                      onClick={() => openResolutionFilter(resOpt.value)}
                      className="min-h-[68px] p-3.5 rounded-2xl bg-[#131720] hover:bg-[#1B212E] border border-slate-800/80 text-left transition-colors flex flex-col justify-between"
                    >
                      <div className="text-sm font-semibold text-white">{resOpt.short}</div>
                      <div className="font-mono text-xs text-slate-400 tabular-nums mt-1">
                        {typeof count === 'number'
                          ? `${count.toLocaleString('fr-FR')} flux`
                          : 'Tous formats'}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Quick Bouquets: Afrique & France */}
            <section className="space-y-3">
              <h2 className="font-display text-base sm:text-lg font-semibold text-white">
                Bouquets Afrique & France
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => openCountryExplorer('AFR')}
                  className="min-h-[76px] p-4 rounded-2xl bg-[#131720] hover:bg-[#1B212E] border border-slate-800/80 flex items-center justify-between gap-4 text-left transition-colors"
                >
                  <div>
                    <div className="text-sm font-semibold text-white">🌍 Afrique complète</div>
                    <div className="text-xs text-slate-400 mt-1">
                      CI, SN, CM, CD, BJ, TG, BF, ML, MA, DZ, TN, NG, KE, ZA…
                    </div>
                  </div>
                  <span className="font-mono text-xs font-semibold text-emerald-400 shrink-0">
                    {(meta?.countries.find((c) => c.code === 'AFR')?.count || africanShowcase.length).toLocaleString('fr-FR')} flux
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => openCountryExplorer('FR')}
                  className="min-h-[76px] p-4 rounded-2xl bg-[#131720] hover:bg-[#1B212E] border border-slate-800/80 flex items-center justify-between gap-4 text-left transition-colors"
                >
                  <div>
                    <div className="text-sm font-semibold text-white">🇫🇷 France & TNT / Canal+</div>
                    <div className="text-xs text-slate-400 mt-1">
                      CNews, C Star, Canal J, TF1, France TV, Arte, BFM TV, L’Équipe…
                    </div>
                  </div>
                  <span className="font-mono text-xs font-semibold text-blue-400 shrink-0">
                    {(meta?.countries.find((c) => c.code === 'FR')?.count || frenchShowcase.length).toLocaleString('fr-FR')} flux
                  </span>
                </button>
              </div>
            </section>

            {/* African Channels Carousel */}
            {africanShowcase.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display text-base sm:text-lg font-semibold text-white">
                    Chaînes Africaines
                  </h2>
                  <button
                    type="button"
                    onClick={() => openCountryExplorer('AFR')}
                    className="text-xs font-medium text-blue-400 hover:text-blue-300 whitespace-nowrap"
                  >
                    Tout voir
                  </button>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {africanShowcase.slice(0, 12).map((ch) => (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => handleSelectChannel(ch, true)}
                      className="w-44 shrink-0 rounded-2xl bg-[#131720] hover:bg-[#1B212E] border border-slate-800/80 p-3 text-left transition-colors space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <ChannelLogo src={ch.logo} name={ch.name} size="md" />
                        {ch.quality && (
                          <span className="font-mono text-[11px] font-semibold text-blue-400">
                            {ch.quality}
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-medium text-white truncate">{ch.name}</div>
                      <div className="text-xs text-slate-400 truncate">
                        {ch.countryFlag} {ch.countryName}
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* French Channels Carousel */}
            {frenchShowcase.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display text-base sm:text-lg font-semibold text-white">
                    France & TNT / Canal+
                  </h2>
                  <button
                    type="button"
                    onClick={() => openCountryExplorer('FR')}
                    className="text-xs font-medium text-blue-400 hover:text-blue-300 whitespace-nowrap"
                  >
                    Tout voir
                  </button>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {frenchShowcase.slice(0, 12).map((ch) => (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => handleSelectChannel(ch, true)}
                      className="w-44 shrink-0 rounded-2xl bg-[#131720] hover:bg-[#1B212E] border border-slate-800/80 p-3 text-left transition-colors space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <ChannelLogo src={ch.logo} name={ch.name} size="md" />
                        {ch.quality && (
                          <span className="font-mono text-[11px] font-semibold text-blue-400">
                            {ch.quality}
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-medium text-white truncate">{ch.name}</div>
                      <div className="text-xs text-slate-400 truncate">
                        {ch.countryFlag} {ch.categories[0] || 'France'}
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Recent Watch Carousel */}
            {recentChannels.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display text-base sm:text-lg font-semibold text-white">
                    Récemment regardées
                  </h2>
                  <button
                    type="button"
                    onClick={() => setRecentChannelIds([])}
                    className="text-xs text-slate-400 hover:text-slate-200 whitespace-nowrap"
                  >
                    Effacer
                  </button>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {recentChannels.map((ch) => (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => handleSelectChannel(ch, true)}
                      className="w-44 shrink-0 rounded-2xl bg-[#131720] hover:bg-[#1B212E] border border-slate-800/80 p-3 text-left transition-colors space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <ChannelLogo src={ch.logo} name={ch.name} size="md" />
                        <Play className="w-4 h-4 text-blue-400 shrink-0" />
                      </div>
                      <div className="text-sm font-medium text-white truncate">{ch.name}</div>
                      <div className="text-xs text-slate-400 truncate">
                        {ch.countryFlag} {ch.categories[0] || 'Live'}
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* High Definition & Broadcast Channels Carousel */}
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-base sm:text-lg font-semibold text-white">
                  Haute Définition & Chaînes recommandées
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setLiveViewMode('channels');
                    setActiveTab('channels');
                  }}
                  className="text-xs font-medium text-blue-400 hover:text-blue-300 whitespace-nowrap"
                >
                  Ouvrir Live TV
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {(hdChannels.length > 0 ? hdChannels : showcaseChannels).slice(0, 12).map((ch) => (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => handleSelectChannel(ch, true)}
                    className="rounded-2xl bg-[#131720] hover:bg-[#1B212E] border border-slate-800/80 p-3.5 text-left transition-colors flex flex-col justify-between gap-3 min-h-[124px]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <ChannelLogo src={ch.logo} name={ch.name} size="md" />
                      {ch.quality && (
                        <span className="font-mono text-[11px] font-semibold text-blue-400">
                          {ch.quality}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-white truncate">{ch.name}</div>
                      <div className="text-xs text-slate-400 truncate mt-0.5">
                        {ch.countryFlag} {ch.countryName} · {ch.categories[0] || 'general'}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            {/* Categories Quick Folders */}
            {meta?.categories && meta.categories.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display text-base sm:text-lg font-semibold text-white">
                    Catégories populaires
                  </h2>
                  <button
                    type="button"
                    onClick={() => {
                      setLiveViewMode('folders');
                      setActiveTab('channels');
                    }}
                    className="text-xs font-medium text-blue-400 hover:text-blue-300 whitespace-nowrap"
                  >
                    Vue dossiers
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {meta.categories.slice(0, 10).map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => openCategoryFolder(cat.id)}
                      className="min-h-[56px] px-4 py-3 rounded-2xl bg-[#131720] hover:bg-[#1B212E] border border-slate-800/80 flex items-center justify-between gap-3 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Folder className="w-4 h-4 text-amber-400 shrink-0" />
                        <span className="text-sm font-medium text-white truncate">{cat.name}</span>
                      </div>
                      <span className="font-mono text-xs text-slate-400 tabular-nums shrink-0">
                        {cat.count}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {/* LIVE TV & MULTI-RESOLUTION GUIDE SCREEN */}
        {activeTab === 'channels' && (
          <div className="space-y-4">
            {/* Desktop Filter Toolbar */}
            <section className="hidden lg:block rounded-2xl bg-[#131720] border border-slate-800/80 p-4 space-y-3">
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Recherche rapide : chaîne, réseau, pays, catégorie…"
                    className="w-full h-11 pl-10 pr-4 rounded-xl bg-[#0B0D11] border border-slate-800 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex items-center gap-1 p-1 bg-[#0B0D11] rounded-xl border border-slate-800 shrink-0">
                  {[
                    { id: 'all', label: 'Toutes sources' },
                    { id: 'iptv-org', label: 'iptv-org' },
                    { id: 'custom', label: `M3U / Xtream (${customChannels.length})` },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSourceScope(item.id as 'all' | 'iptv-org' | 'custom')}
                      className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                        sourceScope === item.id
                          ? 'bg-[#1B212E] text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              {renderFilterSelects()}
            </section>

            {/* Player + Guide Split (Player FIRST on mobile) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 items-start">
              <div className="lg:col-span-7 xl:col-span-8 lg:sticky lg:top-20 space-y-3">
                <VideoPlayer
                  channel={activeChannel}
                  proxyMode={proxyMode}
                  onChangeProxyMode={setProxyMode}
                  isFavorite={activeChannel ? allFavoriteChannelIds.has(activeChannel.id) : false}
                  onToggleFavorite={handleToggleFavorite}
                  favoriteLists={favoriteLists}
                  onToggleChannelInList={handleToggleChannelInList}
                  onPrevChannel={handlePrevChannel}
                  onNextChannel={handleNextChannel}
                />

                {/* Mobile Compact Search + Filter Drawer Trigger right below Player */}
                <div className="lg:hidden flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Rechercher une chaîne…"
                      className="w-full h-11 pl-9 pr-3 rounded-xl bg-[#131720] border border-slate-800 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowMobileFilters(true)}
                    className={`min-h-[44px] px-3.5 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                      activeFilterCount > 0
                        ? 'bg-blue-600/20 border-blue-500/50 text-blue-300'
                        : 'bg-[#131720] border-slate-800 text-slate-200'
                    }`}
                  >
                    <SlidersHorizontal className="w-4 h-4" />
                    <span>Filtres{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</span>
                  </button>
                </div>
              </div>

              <div className="lg:col-span-5 xl:col-span-4 rounded-2xl bg-[#131720] border border-slate-800/80 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-800/80 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-sm font-semibold text-white">
                      {liveViewMode === 'folders' ? 'Dossiers Live TV' : 'Guide des chaînes'}
                    </h2>
                    <div className="flex items-center p-0.5 rounded-lg bg-[#0B0D11] border border-slate-800">
                      <button
                        type="button"
                        onClick={() => setLiveViewMode('channels')}
                        aria-label="Vue chaînes"
                        className={`p-1.5 rounded-md transition-colors ${
                          liveViewMode === 'channels'
                            ? 'bg-[#1B212E] text-white'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <LayoutList className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setLiveViewMode('folders')}
                        aria-label="Vue dossiers"
                        className={`p-1.5 rounded-md transition-colors ${
                          liveViewMode === 'folders'
                            ? 'bg-[#1B212E] text-white'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <Folder className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {(activeFilterCount > 0 || searchQuery.trim() !== '') && (
                      <button
                        type="button"
                        onClick={resetFilters}
                        className="text-xs text-blue-400 hover:text-blue-300 font-medium whitespace-nowrap"
                      >
                        Réinitialiser
                      </button>
                    )}
                    <span className="font-mono text-xs text-slate-400 tabular-nums">
                      {displayedChannels.length} /{' '}
                      {(sourceScope === 'custom'
                        ? filteredCustomChannels.length
                        : totalRemote + filteredCustomChannels.length
                      ).toLocaleString('fr-FR')}
                    </span>
                  </div>
                </div>

                {liveViewMode === 'folders' ? (
                  <div className="divide-y divide-slate-800/70 max-h-[540px] lg:max-h-[640px] overflow-y-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCategory('all');
                        setLiveViewMode('channels');
                      }}
                      className="w-full px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-[#1B212E]/70 transition-colors min-h-[52px]"
                    >
                      <div className="flex items-center gap-3">
                        <Folder className="w-4 h-4 text-amber-400 shrink-0" />
                        <span className="text-sm font-medium text-white">Toutes les chaînes</span>
                      </div>
                      <div className="flex items-center gap-2 font-mono text-xs text-slate-400">
                        <span>{(meta?.stats.totalChannels || totalRemote).toLocaleString('fr-FR')}</span>
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab('home')}
                      className="w-full px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-[#1B212E]/70 transition-colors min-h-[52px]"
                    >
                      <div className="flex items-center gap-3">
                        <History className="w-4 h-4 text-blue-400 shrink-0" />
                        <span className="text-sm font-medium text-white">Récemment regardées</span>
                      </div>
                      <div className="flex items-center gap-2 font-mono text-xs text-slate-400">
                        <span>{recentChannels.length}</span>
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab('favorites')}
                      className="w-full px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-[#1B212E]/70 transition-colors min-h-[52px]"
                    >
                      <div className="flex items-center gap-3">
                        <Bookmark className="w-4 h-4 text-amber-400 shrink-0" />
                        <span className="text-sm font-medium text-white">Favoris</span>
                      </div>
                      <div className="flex items-center gap-2 font-mono text-xs text-slate-400">
                        <span>{allFavoriteChannelIds.size}</span>
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </button>

                    {meta?.categories.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => openCategoryFolder(cat.id)}
                        className="w-full px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-[#1B212E]/70 transition-colors min-h-[52px]"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Folder className="w-4 h-4 text-amber-400 shrink-0" />
                          <span className="text-sm font-medium text-white truncate">{cat.name}</span>
                        </div>
                        <div className="flex items-center gap-2 font-mono text-xs text-slate-400 shrink-0">
                          <span>{cat.count.toLocaleString('fr-FR')}</span>
                          <ChevronRight className="w-4 h-4" />
                        </div>
                      </button>
                    ))}
                  </div>
                ) : loadingCatalog ? (
                  <div className="p-8 flex flex-col items-center justify-center gap-2 text-xs text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin text-blue-400" />
                    <span>Indexation des flux iptv-org…</span>
                  </div>
                ) : catalogError ? (
                  <div className="p-6 text-center text-xs text-rose-400">{catalogError}</div>
                ) : displayedChannels.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    Aucune chaîne ne correspond à ces critères.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800/70 max-h-[540px] lg:max-h-[640px] overflow-y-auto">
                    {displayedChannels.map((ch) => {
                      const isPlaying = activeChannel?.id === ch.id;
                      const isFav = allFavoriteChannelIds.has(ch.id);
                      return (
                        <div
                          key={ch.id}
                          className={`px-3.5 py-2.5 flex items-center gap-3 transition-colors ${
                            isPlaying ? 'bg-blue-600/15' : 'hover:bg-[#1B212E]/70'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => handleSelectChannel(ch)}
                            className="flex items-center gap-3 flex-1 min-w-0 text-left min-h-[48px]"
                          >
                            <ChannelLogo src={ch.logo} name={ch.name} size="md" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-sm font-medium text-white truncate">
                                  {ch.name}
                                </span>
                                {isPlaying && (
                                  <Play className="w-3 h-3 text-blue-400 fill-blue-400 shrink-0" />
                                )}
                              </div>
                              <div className="text-xs text-slate-400 truncate mt-0.5">
                                {ch.countryFlag} {ch.countryName} · {ch.categories[0] || 'general'}
                                {ch.quality ? ` · ${ch.quality}` : ''}
                                {ch.languageNames[0] ? ` · ${ch.languageNames[0]}` : ''}
                                {ch.isHttp ? ' · HTTP→Proxy' : ''}
                              </div>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleToggleFavorite(ch)}
                            aria-label={
                              isFav
                                ? `Retirer ${ch.name} des favoris`
                                : `Ajouter ${ch.name} aux favoris`
                            }
                            className="min-h-[44px] min-w-[44px] rounded-xl hover:bg-[#1B212E] flex items-center justify-center shrink-0 transition-colors"
                          >
                            <Bookmark
                              className={`w-4 h-4 ${
                                isFav ? 'fill-amber-400 text-amber-400' : 'text-slate-500'
                              }`}
                            />
                          </button>
                        </div>
                      );
                    })}

                    {sourceScope !== 'custom' && remoteChannels.length < totalRemote && (
                      <div className="p-3">
                        <button
                          type="button"
                          onClick={handleLoadMore}
                          disabled={loadingMore}
                          className="w-full min-h-[44px] rounded-xl bg-[#1B212E] hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors"
                        >
                          {loadingMore ? 'Chargement…' : 'Charger plus de chaînes'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'favorites' && (
          <FavoritesView
            favoriteLists={favoriteLists}
            allKnownChannels={channelLookup}
            activeChannelId={activeChannel?.id}
            onSelectChannel={(ch) => handleSelectChannel(ch, true)}
            onCreateList={handleCreateFavoriteList}
            onDeleteList={handleDeleteFavoriteList}
            onRemoveFromList={handleToggleChannelInList}
          />
        )}

        {activeTab === 'sources' && (
          <SourcesPanel
            sources={sources}
            onAddSource={handleAddSource}
            onRemoveSource={handleRemoveSource}
          />
        )}

        {activeTab === 'kotlin' && <KotlinProjectView stats={meta?.stats || null} />}
      </main>

      {/* Mobile Thumb-Zone Bottom Bar (<= 15% mobile height) */}
      <nav
        aria-label="Navigation mobile"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-[#0B0D11]/95 backdrop-blur-md border-t border-slate-800/80 grid grid-cols-4 items-center"
      >
        {[
          { id: 'home', label: 'Accueil', icon: Home },
          { id: 'channels', label: 'Live TV', icon: Tv },
          { id: 'favorites', label: 'Favoris', icon: Bookmark },
          { id: 'sources', label: 'Sources', icon: Server },
        ].map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id as ActiveTab)}
              className={`min-h-[44px] flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                active ? 'text-rose-400' : 'text-slate-400'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* OTT Slide-out Side Drawer (100% clean French) */}
      {drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex"
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            className="w-80 max-w-[85vw] h-full bg-[#131720] border-r border-slate-800 p-5 flex flex-col gap-5 overflow-y-auto"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-rose-600/20 border border-rose-500/30 flex items-center justify-center">
                  <Tv className="w-5 h-5 text-rose-400" />
                </div>
                <div>
                  <div className="font-display text-base font-bold text-white">KTP IPTV</div>
                  <div className="text-xs text-slate-400">
                    {proxyMode === 'direct' ? 'Lecture Directe' : 'Proxy HTTPS Actif'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Fermer le menu"
                className="min-h-[40px] min-w-[40px] rounded-xl hover:bg-[#1B212E] text-slate-400 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <div className="px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Actions
              </div>
              <button
                type="button"
                onClick={() => {
                  loadMetaAndShowcase(true);
                  setDrawerOpen(false);
                }}
                className="w-full min-h-[44px] px-3 rounded-xl bg-[#0B0D11] hover:bg-[#1B212E] text-sm font-medium text-slate-200 flex items-center justify-between transition-colors"
              >
                <span className="flex items-center gap-2.5">
                  <RefreshCw className="w-4 h-4 text-blue-400" />
                  <span>Actualiser le catalogue</span>
                </span>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('sources');
                  setDrawerOpen(false);
                }}
                className="w-full min-h-[44px] px-3 rounded-xl bg-[#0B0D11] hover:bg-[#1B212E] text-sm font-medium text-slate-200 flex items-center justify-between transition-colors"
              >
                <span className="flex items-center gap-2.5">
                  <Server className="w-4 h-4 text-emerald-400" />
                  <span>Sources M3U & Xtream</span>
                </span>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('kotlin');
                  setDrawerOpen(false);
                }}
                className="w-full min-h-[44px] px-3 rounded-xl bg-[#0B0D11] hover:bg-[#1B212E] text-sm font-medium text-slate-200 flex items-center justify-between transition-colors"
              >
                <span className="flex items-center gap-2.5">
                  <Code2 className="w-4 h-4 text-violet-400" />
                  <span>Kotlin & CI/CD</span>
                </span>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            <div className="space-y-1.5">
              <div className="px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Raccourcis
              </div>
              <button
                type="button"
                onClick={() => {
                  openCountryExplorer('AFR');
                  setDrawerOpen(false);
                }}
                className="w-full min-h-[44px] px-3 rounded-xl bg-[#0B0D11] hover:bg-[#1B212E] text-sm font-medium text-slate-200 flex items-center justify-between transition-colors"
              >
                <span className="flex items-center gap-2.5">
                  <Globe className="w-4 h-4 text-emerald-400" />
                  <span>Chaînes Africaines</span>
                </span>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </button>
              <button
                type="button"
                onClick={() => {
                  openCountryExplorer('FR');
                  setDrawerOpen(false);
                }}
                className="w-full min-h-[44px] px-3 rounded-xl bg-[#0B0D11] hover:bg-[#1B212E] text-sm font-medium text-slate-200 flex items-center justify-between transition-colors"
              >
                <span className="flex items-center gap-2.5">
                  <Tv className="w-4 h-4 text-blue-400" />
                  <span>France & TNT / Canal+</span>
                </span>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedType('radio');
                  setLiveViewMode('channels');
                  setActiveTab('channels');
                  setDrawerOpen(false);
                }}
                className="w-full min-h-[44px] px-3 rounded-xl bg-[#0B0D11] hover:bg-[#1B212E] text-sm font-medium text-slate-200 flex items-center justify-between transition-colors"
              >
                <span className="flex items-center gap-2.5">
                  <Radio className="w-4 h-4 text-amber-400" />
                  <span>Chaînes Radio</span>
                </span>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedResolution('1080p');
                  setLiveViewMode('channels');
                  setActiveTab('channels');
                  setDrawerOpen(false);
                }}
                className="w-full min-h-[44px] px-3 rounded-xl bg-[#0B0D11] hover:bg-[#1B212E] text-sm font-medium text-slate-200 flex items-center justify-between transition-colors"
              >
                <span className="flex items-center gap-2.5">
                  <Sparkles className="w-4 h-4 text-sky-400" />
                  <span>Flux Full HD (1080p)</span>
                </span>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedResolution('4k');
                  setLiveViewMode('channels');
                  setActiveTab('channels');
                  setDrawerOpen(false);
                }}
                className="w-full min-h-[44px] px-3 rounded-xl bg-[#0B0D11] hover:bg-[#1B212E] text-sm font-medium text-slate-200 flex items-center justify-between transition-colors"
              >
                <span className="flex items-center gap-2.5">
                  <Compass className="w-4 h-4 text-rose-400" />
                  <span>Flux 4K Ultra HD</span>
                </span>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setRecentChannelIds([]);
                  setDrawerOpen(false);
                }}
                className="w-full min-h-[44px] px-3 rounded-xl bg-[#0B0D11] hover:bg-[#1B212E] text-sm font-medium text-slate-200 flex items-center justify-between transition-colors"
              >
                <span className="flex items-center gap-2.5">
                  <Trash2 className="w-4 h-4 text-rose-400" />
                  <span>Effacer l’historique</span>
                </span>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSystemModal(true);
                  setDrawerOpen(false);
                }}
                className="w-full min-h-[44px] px-3 rounded-xl bg-[#0B0D11] hover:bg-[#1B212E] text-sm font-medium text-slate-200 flex items-center justify-between transition-colors"
              >
                <span className="flex items-center gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-blue-400" />
                  <span>Proxy & Mise à jour APK</span>
                </span>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Mobile Filter Bottom Sheet */}
      {showMobileFilters && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-end">
          <div className="w-full rounded-t-3xl bg-[#131720] border-t border-slate-800 p-5 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="w-10 h-1.5 bg-slate-700 rounded-full mx-auto" />
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-white">
                Filtrer les chaînes
              </h2>
              <button
                type="button"
                onClick={() => setShowMobileFilters(false)}
                aria-label="Fermer"
                className="min-h-[40px] min-w-[40px] rounded-xl hover:bg-[#1B212E] text-slate-400 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1 p-1 bg-[#0B0D11] rounded-xl border border-slate-800">
              {[
                { id: 'all', label: 'Toutes' },
                { id: 'iptv-org', label: 'iptv-org' },
                { id: 'custom', label: `M3U (${customChannels.length})` },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSourceScope(item.id as 'all' | 'iptv-org' | 'custom')}
                  className={`min-h-[38px] px-2 rounded-lg text-xs font-medium transition-colors ${
                    sourceScope === item.id ? 'bg-[#1B212E] text-white' : 'text-slate-400'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {renderFilterSelects()}

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={resetFilters}
                className="flex-1 min-h-[44px] rounded-xl bg-[#1B212E] text-slate-200 text-xs font-semibold"
              >
                Réinitialiser
              </button>
              <button
                type="button"
                onClick={() => setShowMobileFilters(false)}
                className="flex-1 min-h-[44px] rounded-xl bg-blue-600 text-white text-xs font-semibold"
              >
                Appliquer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Proxy HTTPS & In-App Update Modal */}
      {showSystemModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-[#131720] border border-slate-800 p-5 sm:p-6 max-h-[90vh] overflow-y-auto space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-blue-400" />
                <h2 className="font-display text-lg font-semibold text-white">
                  Proxy HTTP ↔ HTTPS & Mise à jour
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowSystemModal(false)}
                aria-label="Fermer"
                className="min-h-[40px] min-w-[40px] rounded-xl hover:bg-[#1B212E] text-slate-400 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* In-App Update Section */}
            <div className="rounded-xl bg-[#0B0D11] border border-slate-800 p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-blue-400">
                  Mise à jour In-App Android (GitHub Releases)
                </span>
                <button
                  type="button"
                  onClick={refreshUpdateCheck}
                  disabled={checkingUpdate}
                  className="text-xs text-slate-400 hover:text-white inline-flex items-center gap-1"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${checkingUpdate ? 'animate-spin' : ''}`} />
                  <span>Vérifier</span>
                </button>
              </div>
              {updateInfo ? (
                <>
                  <div className="text-sm font-semibold text-white">
                    {updateInfo.name}{' '}
                    <span className="font-mono text-xs text-slate-400">({updateInfo.tag})</span>
                  </div>
                  <div className="text-xs text-slate-400">
                    {updateInfo.apkName
                      ? `APK signé prêt : ${updateInfo.apkName} (${(
                          updateInfo.apkSize /
                          (1024 * 1024)
                        ).toFixed(1)} Mo)`
                      : 'Publication CI/CD disponible sur GitHub'}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {updateInfo.apkUrl && (
                      <a
                        href={updateInfo.apkUrl}
                        download
                        className="min-h-[40px] px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Télécharger l’APK</span>
                      </a>
                    )}
                    <a
                      href={updateInfo.htmlUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#1B212E] hover:bg-slate-700 text-slate-200 text-xs font-medium inline-flex items-center"
                    >
                      Notes de version
                    </a>
                  </div>
                </>
              ) : (
                <div className="text-xs text-slate-400">
                  Vérification de la dernière version Android en cours…
                </div>
              )}
            </div>

            {/* Proxy Mode Options */}
            <div className="space-y-2">
              <div className="text-xs font-medium text-slate-300">
                Mode de routage HTTP ↔ HTTPS ({meta ? meta.stats.httpCount.toLocaleString('fr-FR') : '3 814'} flux HTTP détectés)
              </div>
              {[
                {
                  mode: 'auto' as ProxyMode,
                  title: 'Proxy Auto (Recommandé)',
                  desc: 'Relaye les flux via /api/proxy/stream en HTTPS pour contourner HTTP en clair et CORS.',
                },
                {
                  mode: 'always' as ProxyMode,
                  title: 'Proxy Forcé',
                  desc: 'Encapsule 100 % des flux et segments HLS via le relais HTTPS.',
                },
                {
                  mode: 'direct' as ProxyMode,
                  title: 'Direct',
                  desc: 'Lecture directe sans relais (réservé aux flux HTTPS compatibles CORS).',
                },
              ].map((opt) => (
                <button
                  key={opt.mode}
                  type="button"
                  onClick={() => setProxyMode(opt.mode)}
                  className={`w-full text-left p-3.5 rounded-xl border transition-colors ${
                    proxyMode === opt.mode
                      ? 'bg-blue-600/15 border-blue-500/50 text-white'
                      : 'bg-[#0B0D11] border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="text-sm font-semibold">{opt.title}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
