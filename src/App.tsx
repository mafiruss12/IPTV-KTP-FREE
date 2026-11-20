import { useEffect, useMemo, useState } from 'react';
import {
  Bookmark,
  ChevronDown,
  Code2,
  FolderPlus,
  Globe,
  Layers,
  Play,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
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
} from './types/iptv';
import { ChannelLogo } from './components/ChannelLogo';
import { VideoPlayer } from './components/VideoPlayer';
import { SourcesPanel } from './components/SourcesModal';
import { FavoritesView } from './components/FavoritesView';
import { KotlinProjectView } from './components/KotlinProjectView';

type ActiveTab = 'channels' | 'favorites' | 'sources' | 'kotlin';

const LS_FAVORITES_KEY = 'ktp_iptv_favorites_v1';
const LS_SOURCES_KEY = 'ktp_iptv_sources_v1';
const LS_CUSTOM_CHANNELS_KEY = 'ktp_iptv_custom_channels_v1';
const LS_PROXY_MODE_KEY = 'ktp_iptv_proxy_mode_v1';

const CHANNEL_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'Tous les types' },
  { value: 'live_24_7', label: 'TV Live 24/7' },
  { value: 'part_time', label: 'Événement / Part-time' },
  { value: 'vod', label: 'VOD / Films' },
  { value: 'series', label: 'Séries' },
  { value: 'radio', label: 'Radio' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('channels');
  const [meta, setMeta] = useState<CatalogMetaResponse | null>(null);
  const [remoteChannels, setRemoteChannels] = useState<IptvChannel[]>([]);
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
  const [selectedProtocol, setSelectedProtocol] = useState<'all' | 'http' | 'https'>('all');
  const [sourceScope, setSourceScope] = useState<'all' | 'iptv-org' | 'custom'>('all');
  const [offset, setOffset] = useState(0);

  // Player & Proxy
  const [activeChannel, setActiveChannel] = useState<IptvChannel | null>(null);
  const [proxyMode, setProxyMode] = useState<ProxyMode>(() => {
    const saved = localStorage.getItem(LS_PROXY_MODE_KEY);
    return saved === 'always' || saved === 'direct' ? saved : 'auto';
  });
  const [showProxyModal, setShowProxyModal] = useState(false);

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

  // Cache known channels by ID for Favorites resolution
  const [channelLookup, setChannelLookup] = useState<Map<string, IptvChannel>>(() => new Map());

  useEffect(() => {
    localStorage.setItem(LS_FAVORITES_KEY, JSON.stringify(favoriteLists));
  }, [favoriteLists]);

  useEffect(() => {
    localStorage.setItem(LS_SOURCES_KEY, JSON.stringify(sources));
  }, [sources]);

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

  // Load iptv-org metadata
  useEffect(() => {
    fetch('/api/iptv/meta')
      .then((r) => r.json())
      .then((data: CatalogMetaResponse) => {
        if (data?.countries) setMeta(data);
      })
      .catch(() => {});
  }, []);

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
    selectedProtocol,
    debouncedQuery,
    sourceScope,
  ]);

  // Keep custom channels in lookup map
  useEffect(() => {
    setChannelLookup((prev) => {
      const next = new Map(prev);
      for (const ch of customChannels) next.set(ch.id, ch);
      return next;
    });
  }, [customChannels]);

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
      if (selectedCountry !== 'ALL' && ch.countryCode !== selectedCountry) return false;
      if (selectedCategory !== 'all' && !ch.categories.includes(selectedCategory)) return false;
      if (selectedLanguage !== 'all' && !ch.languages.includes(selectedLanguage)) return false;
      if (selectedType !== 'all' && ch.type !== (selectedType as ChannelType)) return false;
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
    if (channels[0]) setActiveChannel(channels[0]);
  };

  const handleRemoveSource = (sourceId: string) => {
    setSources((prev) => prev.filter((s) => s.id !== sourceId));
    setCustomChannels((prev) => prev.filter((c) => !c.id.startsWith(`${sourceId}:`)));
  };

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedCountry('ALL');
    setSelectedType('all');
    setSelectedCategory('all');
    setSelectedLanguage('all');
    setSelectedProtocol('all');
    setSourceScope('all');
  };

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    selectedCountry !== 'ALL' ||
    selectedType !== 'all' ||
    selectedCategory !== 'all' ||
    selectedLanguage !== 'all' ||
    selectedProtocol !== 'all' ||
    sourceScope !== 'all';

  return (
    <div className="min-h-screen bg-[#0B0D11] text-slate-100 pb-20 md:pb-8">
      {/* 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 h-14 bg-[#0B0D11]/90 backdrop-blur-md border-b border-slate-800/80">
        <div className="max-w-[1440px] mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line brand wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('channels')}
            className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            KTP IPTV
          </button>

          {/* Zone 2: 4 single-line nav links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
            <button
              type="button"
              onClick={() => setActiveTab('channels')}
              className={`whitespace-nowrap shrink-0 transition-colors ${
                activeTab === 'channels' ? 'text-white' : 'hover:text-slate-200'
              }`}
            >
              Chaînes
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('favorites')}
              className={`whitespace-nowrap shrink-0 transition-colors ${
                activeTab === 'favorites' ? 'text-white' : 'hover:text-slate-200'
              }`}
            >
              Favoris ({allFavoriteChannelIds.size})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('sources')}
              className={`whitespace-nowrap shrink-0 transition-colors ${
                activeTab === 'sources' ? 'text-white' : 'hover:text-slate-200'
              }`}
            >
              M3U & Xtream
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('kotlin')}
              className={`whitespace-nowrap shrink-0 transition-colors ${
                activeTab === 'kotlin' ? 'text-white' : 'hover:text-slate-200'
              }`}
            >
              Kotlin & CI/CD
            </button>
          </nav>

          {/* Zone 3: 1 primary CTA */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={() => setShowProxyModal(true)}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              Proxy HTTPS
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1440px] mx-auto px-4 sm:px-6 pt-5">
        {activeTab === 'channels' && (
          <div className="space-y-5">
            {/* Search & 4-Dimension Filter Toolbar */}
            <section className="rounded-2xl bg-[#131720] border border-slate-800/80 p-4 space-y-3">
              <div className="flex flex-col lg:flex-row gap-3">
                {/* Quick Search */}
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

                {/* Source scope tabs */}
                <div className="flex items-center gap-1 p-1 bg-[#0B0D11] rounded-xl border border-slate-800 shrink-0 overflow-x-auto no-scrollbar">
                  {[
                    { id: 'all', label: 'Toutes sources' },
                    { id: 'iptv-org', label: 'iptv-org' },
                    { id: 'custom', label: `M3U / Xtream (${customChannels.length})` },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSourceScope(item.id as 'all' | 'iptv-org' | 'custom')}
                      className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
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

              {/* Country, Type, Category, Language, Protocol */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                <div className="relative">
                  <select
                    aria-label="Filtrer par pays"
                    value={selectedCountry}
                    onChange={(e) => setSelectedCountry(e.target.value)}
                    className="w-full h-11 pl-3 pr-8 rounded-xl bg-[#0B0D11] border border-slate-800 text-xs font-medium text-slate-200 appearance-none focus:outline-none focus:border-blue-500"
                  >
                    <option value="ALL">Pays : Tous ({meta?.countries.length || 250})</option>
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

                <div className="relative col-span-2 sm:col-span-1">
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

              {hasActiveFilters && (
                <div className="flex items-center justify-between pt-1 text-xs text-slate-400">
                  <span className="tabular-nums">
                    {(sourceScope === 'custom'
                      ? filteredCustomChannels.length
                      : totalRemote + filteredCustomChannels.length
                    ).toLocaleString('fr-FR')}{' '}
                    chaînes correspondantes
                  </span>
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="text-blue-400 hover:text-blue-300 font-medium"
                  >
                    Réinitialiser les filtres
                  </button>
                </div>
              )}
            </section>

            {/* Player + Channel Guide Split */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              <div className="lg:col-span-7 xl:col-span-8 lg:sticky lg:top-20">
                <VideoPlayer
                  channel={activeChannel}
                  proxyMode={proxyMode}
                  onChangeProxyMode={setProxyMode}
                  isFavorite={activeChannel ? allFavoriteChannelIds.has(activeChannel.id) : false}
                  onToggleFavorite={handleToggleFavorite}
                  favoriteLists={favoriteLists}
                  onToggleChannelInList={handleToggleChannelInList}
                />
              </div>

              <div className="lg:col-span-5 xl:col-span-4 rounded-2xl bg-[#131720] border border-slate-800/80 overflow-hidden">
                <div className="px-4 py-3.5 border-b border-slate-800/80 flex items-center justify-between">
                  <h2 className="font-display text-sm font-semibold text-white">
                    Guide des chaînes
                  </h2>
                  <span className="font-mono text-xs text-slate-400 tabular-nums">
                    {displayedChannels.length} /{' '}
                    {(sourceScope === 'custom'
                      ? filteredCustomChannels.length
                      : totalRemote + filteredCustomChannels.length
                    ).toLocaleString('fr-FR')}
                  </span>
                </div>

                {loadingCatalog ? (
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
                  <div className="divide-y divide-slate-800/70 max-h-[640px] overflow-y-auto">
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
                            onClick={() => setActiveChannel(ch)}
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
                                {ch.languageNames[0] ? ` · ${ch.languageNames[0]}` : ''}
                                {ch.isHttp ? ' · HTTP→Proxy' : ''}
                              </div>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleToggleFavorite(ch)}
                            aria-label={isFav ? `Retirer ${ch.name} des favoris` : `Ajouter ${ch.name} aux favoris`}
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
            onSelectChannel={(ch) => {
              setActiveChannel(ch);
              setActiveTab('channels');
            }}
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
          { id: 'channels', label: 'Chaînes', icon: Tv },
          { id: 'favorites', label: 'Favoris', icon: Bookmark },
          { id: 'sources', label: 'Sources', icon: Server },
          { id: 'kotlin', label: 'Kotlin', icon: Code2 },
        ].map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id as ActiveTab)}
              className={`min-h-[44px] flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                active ? 'text-blue-400' : 'text-slate-400'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Proxy HTTPS Settings Modal */}
      {showProxyModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-[#131720] border border-slate-800 p-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-blue-400" />
                <h2 className="font-display text-lg font-semibold text-white">
                  Système de Proxy HTTP ↔ HTTPS
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowProxyModal(false)}
                aria-label="Fermer"
                className="min-h-[40px] min-w-[40px] rounded-xl hover:bg-[#1B212E] text-slate-400 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Environ {meta ? meta.stats.httpCount.toLocaleString('fr-FR') : '3 814'} chaînes de la base iptv-org utilisent <span className="font-mono text-slate-300">http://</span> sans chiffrement TLS ou exigent des en-têtes <span className="font-mono text-slate-300">User-Agent</span> / <span className="font-mono text-slate-300">Referer</span>. Le proxy réécrit les manifestes HLS et encapsule les segments en HTTPS.
            </p>

            <div className="mt-4 space-y-2">
              {[
                {
                  mode: 'auto' as ProxyMode,
                  title: 'Automatique (Recommandé)',
                  desc: 'Proxy actif pour tous les flux HTTP ou nécessitant des en-têtes personnalisés ; direct pour HTTPS.',
                },
                {
                  mode: 'always' as ProxyMode,
                  title: 'Proxy HTTPS Forcé',
                  desc: 'Relaye 100 % des flux (HTTP et HTTPS) pour contourner CORS et redirections mixtes.',
                },
                {
                  mode: 'direct' as ProxyMode,
                  title: 'Connexion Directe',
                  desc: 'Lecture directe sans relais (utile uniquement sur lecteur natif ou flux HTTPS CORS-ouvert).',
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

            <div className="mt-5 pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center gap-2 font-mono">
                <Globe className="w-3.5 h-3.5 text-blue-400" />
                <span>Endpoint : /api/proxy/stream</span>
              </div>
              <button
                type="button"
                onClick={() => setShowProxyModal(false)}
                className="min-h-[40px] px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
