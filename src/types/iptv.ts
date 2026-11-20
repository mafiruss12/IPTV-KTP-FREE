export type ChannelType = 'live_24_7' | 'part_time' | 'vod' | 'series' | 'radio';

export type SourceKind = 'iptv-org' | 'm3u' | 'xtream';

export type ProxyMode = 'auto' | 'always' | 'direct';

export interface IptvChannel {
  id: string;
  name: string;
  url: string;
  logo?: string;
  countryCode: string;
  countryName: string;
  countryFlag: string;
  categories: string[];
  languages: string[];
  languageNames: string[];
  type: ChannelType;
  quality?: string;
  network?: string;
  userAgent?: string;
  referrer?: string;
  isHttp: boolean;
  isGeoBlocked: boolean;
  sourceKind: SourceKind;
  sourceLabel: string;
}

export interface CountryOption {
  code: string;
  name: string;
  flag: string;
  count: number;
}

export interface CategoryOption {
  id: string;
  name: string;
  count: number;
}

export interface LanguageOption {
  code: string;
  name: string;
  count: number;
}

export interface CatalogStats {
  totalChannels: number;
  totalCountries: number;
  totalCategories: number;
  totalLanguages: number;
  httpCount: number;
  httpsCount: number;
  customHeaderCount: number;
  lastSyncedAt: string;
}

export interface CatalogMetaResponse {
  stats: CatalogStats;
  countries: CountryOption[];
  categories: CategoryOption[];
  languages: LanguageOption[];
}

export interface FavoriteList {
  id: string;
  name: string;
  channelIds: string[];
  createdAt: string;
}

export interface PlaylistSource {
  id: string;
  name: string;
  kind: 'm3u' | 'xtream';
  url: string;
  username?: string;
  password?: string;
  channelCount: number;
  addedAt: string;
  enabled: boolean;
}

export interface KotlinProjectFile {
  path: string;
  category: 'kotlin' | 'gradle' | 'manifest' | 'ci' | 'docs';
  size: number;
}
