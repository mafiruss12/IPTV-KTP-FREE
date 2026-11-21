import express, { type Request, type Response } from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

interface RawChannel {
  id: string;
  name: string;
  network?: string | null;
  country: string;
  categories: string[];
  is_nsfw: boolean;
}

interface RawStream {
  channel: string | null;
  feed: string | null;
  title: string;
  url: string;
  quality?: string | null;
  labels?: string[];
  user_agent?: string | null;
  referrer?: string | null;
}

interface RawFeed {
  channel: string;
  id: string;
  is_main?: boolean;
  languages?: string[];
  format?: string | null;
}

interface RawLogo {
  channel: string;
  feed: string | null;
  in_use: boolean;
  url: string;
}

interface RawCountry {
  code: string;
  name: string;
  flag: string;
  languages: string[];
}

interface RawCategory {
  id: string;
  name: string;
}

interface RawLanguage {
  code: string;
  name: string;
}

type ResolutionBucket = '4k' | '1080p' | '720p' | 'sd' | 'unknown';

interface IndexedChannel {
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
  type: 'live_24_7' | 'part_time' | 'vod' | 'series' | 'radio';
  quality?: string;
  resolutionBucket: ResolutionBucket;
  network?: string;
  userAgent?: string;
  referrer?: string;
  isHttp: boolean;
  isGeoBlocked: boolean;
  isAfrican: boolean;
  sourceKind: 'iptv-org';
  sourceLabel: string;
}

interface CachedCatalog {
  channels: IndexedChannel[];
  countries: Array<{ code: string; name: string; flag: string; count: number }>;
  categories: Array<{ id: string; name: string; count: number }>;
  languages: Array<{ code: string; name: string; count: number }>;
  resolutions: Array<{ id: ResolutionBucket; label: string; count: number }>;
  stats: {
    totalChannels: number;
    totalCountries: number;
    totalCategories: number;
    totalLanguages: number;
    httpCount: number;
    httpsCount: number;
    customHeaderCount: number;
    lastSyncedAt: string;
  };
  fetchedAt: number;
}

function decodeHtml(input?: string | null): string {
  if (!input) return '';
  return input
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .trim();
}

function classifyResolution(quality?: string | null, name?: string | null): ResolutionBucket {
  const combined = `${quality || ''} ${name || ''}`.toLowerCase();
  if (/(\b4k\b|\buhd\b|2160p|3840x2160)/.test(combined)) return '4k';
  if (/(1080p|1080i|\bfhd\b|full\s?hd|1920x1080)/.test(combined)) return '1080p';
  if (/(720p|\bhd\b|1280x720)/.test(combined)) return '720p';
  if (/(576p|540p|480p|360p|240p|\bsd\b)/.test(combined)) return 'sd';
  return 'unknown';
}

const AFRICAN_COUNTRY_CODES = new Set([
  'AO', 'BF', 'BI', 'BJ', 'BW', 'CD', 'CF', 'CG', 'CI', 'CM', 'CV', 'DJ', 'DZ', 'EG',
  'EH', 'ER', 'ET', 'GA', 'GH', 'GM', 'GN', 'GQ', 'GW', 'KE', 'KM', 'LR', 'LS', 'LY',
  'MA', 'MG', 'ML', 'MR', 'MU', 'MW', 'MZ', 'NA', 'NE', 'NG', 'RE', 'RW', 'SC', 'SD',
  'SH', 'SL', 'SN', 'SO', 'SS', 'ST', 'SZ', 'TD', 'TF', 'TG', 'TN', 'TZ', 'UG', 'YT',
  'ZA', 'ZM', 'ZW',
]);

function isAfricanChannel(countryCode: string, name: string): boolean {
  if (AFRICAN_COUNTRY_CODES.has(countryCode.toUpperCase())) return true;
  const lower = name.toLowerCase();
  return (
    lower.includes('africa') ||
    lower.includes('afrique') ||
    lower.includes('nollywood') ||
    lower.includes('rti ') ||
    lower.includes('rts ') ||
    lower.includes('crtv') ||
    lower.includes('rtnc') ||
    lower.includes('ortm') ||
    lower.includes('2m ')
  );
}

const CACHE_TTL_MS = 15 * 60 * 1000;
let catalogCache: CachedCatalog | null = null;
let pendingCatalogFetch: Promise<CachedCatalog> | null = null;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'KTP-IPTV-Proxy/1.0' },
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) {
    throw new Error(`Upstream ${url} returned ${res.status}`);
  }
  return (await res.json()) as T;
}

async function fetchTextOrNull(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'KTP-IPTV-Proxy/1.0' },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function loadIptvOrgCatalog(force = false): Promise<CachedCatalog> {
  if (!force && catalogCache && Date.now() - catalogCache.fetchedAt < CACHE_TTL_MS) {
    return catalogCache;
  }
  if (pendingCatalogFetch) {
    return pendingCatalogFetch;
  }

  pendingCatalogFetch = (async () => {
    try {
      const [streams, channels, feeds, logos, countries, categories, languages, afrM3u, freeTvFr, freeTvTd, freeTvNg, freeTvKe, freeTvEg] =
        await Promise.all([
          fetchJson<RawStream[]>('https://iptv-org.github.io/api/streams.json'),
          fetchJson<RawChannel[]>('https://iptv-org.github.io/api/channels.json'),
          fetchJson<RawFeed[]>('https://iptv-org.github.io/api/feeds.json'),
          fetchJson<RawLogo[]>('https://iptv-org.github.io/api/logos.json'),
          fetchJson<RawCountry[]>('https://iptv-org.github.io/api/countries.json'),
          fetchJson<RawCategory[]>('https://iptv-org.github.io/api/categories.json'),
          fetchJson<RawLanguage[]>('https://iptv-org.github.io/api/languages.json'),
          fetchTextOrNull('https://iptv-org.github.io/iptv/regions/afr.m3u'),
          fetchTextOrNull('https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist_france.m3u8'),
          fetchTextOrNull('https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist_chad.m3u8'),
          fetchTextOrNull('https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist_nigeria.m3u8'),
          fetchTextOrNull('https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist_kenya.m3u8'),
          fetchTextOrNull('https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist_egypt.m3u8'),
        ]);

      const channelMap = new Map<string, RawChannel>();
      for (const ch of channels) {
        channelMap.set(ch.id, ch);
      }

      const feedMap = new Map<string, RawFeed>();
      const channelDefaultFeed = new Map<string, RawFeed>();
      for (const f of feeds) {
        feedMap.set(`${f.channel}::${f.id}`, f);
        if (f.is_main || !channelDefaultFeed.has(f.channel)) {
          channelDefaultFeed.set(f.channel, f);
        }
      }

      const logoMap = new Map<string, string>();
      for (const l of logos) {
        if (!l.in_use || !l.url) continue;
        const key = l.feed ? `${l.channel}::${l.feed}` : l.channel;
        if (!logoMap.has(key)) {
          logoMap.set(key, l.url);
        }
        if (!logoMap.has(l.channel)) {
          logoMap.set(l.channel, l.url);
        }
      }

      const countryMap = new Map<string, RawCountry>();
      for (const c of countries) {
        countryMap.set(c.code, c);
      }

      const categoryMap = new Map<string, string>();
      for (const cat of categories) {
        categoryMap.set(cat.id, cat.name);
      }

      const languageMap = new Map<string, string>();
      for (const lang of languages) {
        languageMap.set(lang.code, lang.name);
      }

      const indexed: IndexedChannel[] = [];
      const countryCounts = new Map<string, number>();
      const categoryCounts = new Map<string, number>();
      const languageCounts = new Map<string, number>();
      const resolutionCounts = new Map<ResolutionBucket, number>();

      let httpCount = 0;
      let httpsCount = 0;
      let customHeaderCount = 0;
      let afrCount = 0;
      const seenUrls = new Set<string>();

      for (let i = 0; i < streams.length; i++) {
        const s = streams[i];
        if (!s.url || !/^https?:\/\//i.test(s.url)) continue;
        if (seenUrls.has(s.url)) continue;
        seenUrls.add(s.url);

        const ch = s.channel ? channelMap.get(s.channel) : undefined;
        if (ch?.is_nsfw) continue;

        const feed = s.channel
          ? (s.feed ? feedMap.get(`${s.channel}::${s.feed}`) : undefined) || channelDefaultFeed.get(s.channel)
          : undefined;

        const countryCode = ch?.country || 'INT';
        const countryInfo = countryMap.get(countryCode);
        const countryName = countryInfo?.name || (countryCode === 'INT' ? 'International' : countryCode);
        const countryFlag = countryInfo?.flag || '🌐';

        const chCategories = ch?.categories?.length ? ch.categories : ['general'];
        const rawLangs = feed?.languages?.length
          ? feed.languages
          : countryInfo?.languages?.slice(0, 2) || [];
        const langCodes = [...new Set(rawLangs)];
        const langNames = langCodes.map((code) => languageMap.get(code) || code.toUpperCase());

        const labels = s.labels || [];
        const isPartTime = labels.some((l) => l.toLowerCase().includes('not 24/7'));
        const isGeoBlocked = labels.some((l) => l.toLowerCase().includes('geo-blocked'));

        const isHttp = s.url.toLowerCase().startsWith('http://');
        if (isHttp) httpCount++;
        else httpsCount++;
        if (s.user_agent || s.referrer) customHeaderCount++;

        const logo =
          (s.channel && s.feed ? logoMap.get(`${s.channel}::${s.feed}`) : undefined) ||
          (s.channel ? logoMap.get(s.channel) : undefined);

        const cleanName = decodeHtml(
          ch?.name ? (s.title && s.title !== ch.name ? `${ch.name} (${s.title})` : ch.name) : s.title
        );
        const rawQuality = s.quality || feed?.format || undefined;
        const resolutionBucket = classifyResolution(rawQuality, cleanName);
        const african = isAfricanChannel(countryCode, cleanName);
        if (african) afrCount++;

        indexed.push({
          id: `iptv-org:${i}:${s.channel || 'raw'}`,
          name: cleanName,
          url: s.url,
          logo,
          countryCode,
          countryName: decodeHtml(countryName),
          countryFlag,
          categories: chCategories,
          languages: langCodes,
          languageNames: langNames,
          type: isPartTime ? 'part_time' : 'live_24_7',
          quality: rawQuality,
          resolutionBucket,
          network: ch?.network ? decodeHtml(ch.network) : undefined,
          userAgent: s.user_agent || undefined,
          referrer: s.referrer || undefined,
          isHttp,
          isGeoBlocked,
          isAfrican: african,
          sourceKind: 'iptv-org',
          sourceLabel: 'iptv-org',
        });

        countryCounts.set(countryCode, (countryCounts.get(countryCode) || 0) + 1);
        resolutionCounts.set(resolutionBucket, (resolutionCounts.get(resolutionBucket) || 0) + 1);
        for (const c of chCategories) {
          categoryCounts.set(c, (categoryCounts.get(c) || 0) + 1);
        }
        for (const l of langCodes) {
          languageCounts.set(l, (languageCounts.get(l) || 0) + 1);
        }
      }

      // Merge additional African channels from iptv-org regions/afr.m3u
      if (afrM3u) {
        const parsedAfr = parseServerM3u(afrM3u, 'iptv-org Afrique', true);
        for (const item of parsedAfr) {
          if (seenUrls.has(item.url)) continue;
          seenUrls.add(item.url);
          const inferredCode = item.countryCode !== 'INT' ? item.countryCode : 'AFR';
          const info = countryMap.get(inferredCode);
          const finalCode = info ? inferredCode : 'AFR';
          const langCodes = item.languages.length ? item.languages : info?.languages?.slice(0, 2) || [];
          const langNames = langCodes.map((c) => languageMap.get(c) || c.toUpperCase());
          indexed.push({
            ...item,
            id: `afr:${indexed.length}`,
            countryCode: finalCode,
            countryName: decodeHtml(info?.name || 'Afrique'),
            countryFlag: info?.flag || '🌍',
            languages: langCodes,
            languageNames: langNames,
            isAfrican: true,
          });
          if (item.isHttp) httpCount++;
          else httpsCount++;
          afrCount++;
          countryCounts.set(finalCode, (countryCounts.get(finalCode) || 0) + 1);
          resolutionCounts.set(item.resolutionBucket, (resolutionCounts.get(item.resolutionBucket) || 0) + 1);
          for (const c of item.categories) {
            categoryCounts.set(c, (categoryCounts.get(c) || 0) + 1);
          }
        }
      }

      // Merge Free-TV France (TF1, France TV, Arte, BFM, TV5Monde, etc.)
      if (freeTvFr) {
        const frInfo = countryMap.get('FR');
        const parsedFr = parseServerM3u(freeTvFr, 'Free-TV France', true);
        for (const item of parsedFr) {
          if (seenUrls.has(item.url)) continue;
          seenUrls.add(item.url);
          indexed.push({
            ...item,
            id: `freetv-fr:${indexed.length}`,
            countryCode: 'FR',
            countryName: frInfo?.name || 'France',
            countryFlag: frInfo?.flag || '🇫🇷',
            languages: ['fra'],
            languageNames: [languageMap.get('fra') || 'French'],
            isAfrican: false,
          });
          if (item.isHttp) httpCount++;
          else httpsCount++;
          countryCounts.set('FR', (countryCounts.get('FR') || 0) + 1);
          resolutionCounts.set(item.resolutionBucket, (resolutionCounts.get(item.resolutionBucket) || 0) + 1);
          for (const c of item.categories) {
            categoryCounts.set(c, (categoryCounts.get(c) || 0) + 1);
          }
          languageCounts.set('fra', (languageCounts.get('fra') || 0) + 1);
        }
      }

      // Merge curated Free-TV Africa country playlists
      for (const [cc, rawText] of [
        ['TD', freeTvTd],
        ['NG', freeTvNg],
        ['KE', freeTvKe],
        ['EG', freeTvEg],
      ] as Array<[string, string | null]>) {
        if (!rawText) continue;
        const info = countryMap.get(cc);
        const langCodes = info?.languages?.slice(0, 2) || [];
        const langNames = langCodes.map((c) => languageMap.get(c) || c.toUpperCase());
        const parsed = parseServerM3u(rawText, 'Free-TV Afrique', true);
        for (const item of parsed) {
          if (seenUrls.has(item.url)) continue;
          seenUrls.add(item.url);
          indexed.push({
            ...item,
            id: `freetv-${cc}:${indexed.length}`,
            countryCode: cc,
            countryName: info?.name || cc,
            countryFlag: info?.flag || '🌍',
            languages: langCodes,
            languageNames: langNames,
            isAfrican: true,
          });
          if (item.isHttp) httpCount++;
          else httpsCount++;
          afrCount++;
          countryCounts.set(cc, (countryCounts.get(cc) || 0) + 1);
          resolutionCounts.set(item.resolutionBucket, (resolutionCounts.get(item.resolutionBucket) || 0) + 1);
          for (const c of item.categories) {
            categoryCounts.set(c, (categoryCounts.get(c) || 0) + 1);
          }
        }
      }

      indexed.sort((a, b) => {
        const score = (c: IndexedChannel) =>
          (c.type === 'live_24_7' ? 8 : 0) +
          (c.logo ? 4 : 0) +
          (!c.isGeoBlocked ? 2 : 0) +
          (c.countryCode !== 'INT' ? 1 : 0);
        return score(b) - score(a);
      });

      const sortedCountries = Array.from(countryCounts.entries())
        .filter(([code]) => code !== 'AFR')
        .map(([code, count]) => {
          const info = countryMap.get(code);
          return {
            code,
            name: decodeHtml(info?.name || (code === 'INT' ? 'International' : code)),
            flag: info?.flag || '🌐',
            count,
          };
        })
        .sort((a, b) => b.count - a.count);

      const countryList =
        afrCount > 0
          ? [{ code: 'AFR', name: 'Afrique (Toutes)', flag: '🌍', count: afrCount }, ...sortedCountries]
          : sortedCountries;

      const categoryList = Array.from(categoryCounts.entries())
        .map(([id, count]) => ({
          id,
          name: categoryMap.get(id) || id.charAt(0).toUpperCase() + id.slice(1),
          count,
        }))
        .sort((a, b) => b.count - a.count);

      const languageList = Array.from(languageCounts.entries())
        .map(([code, count]) => ({
          code,
          name: languageMap.get(code) || code.toUpperCase(),
          count,
        }))
        .sort((a, b) => b.count - a.count);

      const resolutionMeta: Array<{ id: ResolutionBucket; label: string; count: number }> = [
        { id: '4k', label: '4K Ultra HD (2160p)', count: resolutionCounts.get('4k') || 0 },
        { id: '1080p', label: 'Full HD (1080p)', count: resolutionCounts.get('1080p') || 0 },
        { id: '720p', label: 'HD (720p)', count: resolutionCounts.get('720p') || 0 },
        { id: 'sd', label: 'SD (480p / 576p)', count: resolutionCounts.get('sd') || 0 },
      ];

      catalogCache = {
        channels: indexed,
        countries: countryList,
        categories: categoryList,
        languages: languageList,
        resolutions: resolutionMeta,
        stats: {
          totalChannels: indexed.length,
          totalCountries: countryList.length,
          totalCategories: categoryList.length,
          totalLanguages: languageList.length,
          httpCount,
          httpsCount,
          customHeaderCount,
          lastSyncedAt: new Date().toISOString(),
        },
        fetchedAt: Date.now(),
      };
      return catalogCache;
    } finally {
      pendingCatalogFetch = null;
    }
  })();

  return pendingCatalogFetch;
}

function buildProxyUrl(targetUrl: string, ua?: string, ref?: string): string {
  const params = new URLSearchParams();
  params.set('url', targetUrl);
  if (ua) params.set('ua', ua);
  if (ref) params.set('ref', ref);
  return `/api/proxy/stream?${params.toString()}`;
}

function rewriteM3u8Manifest(
  manifestText: string,
  baseUrl: string,
  ua?: string,
  ref?: string
): string {
  const lines = manifestText.split(/\r?\n/);
  const rewritten = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    // Rewrite URI="..." attributes in tags (#EXT-X-KEY, #EXT-X-MAP, #EXT-X-MEDIA, etc.)
    if (trimmed.startsWith('#')) {
      return line.replace(/URI="([^"]+)"/gi, (_match, rawUri: string) => {
        try {
          const resolved = new URL(rawUri, baseUrl).toString();
          return `URI="${buildProxyUrl(resolved, ua, ref)}"`;
        } catch {
          return `URI="${rawUri}"`;
        }
      });
    }

    // Rewrite media segment or variant playlist URI line
    try {
      const resolved = new URL(trimmed, baseUrl).toString();
      return buildProxyUrl(resolved, ua, ref);
    } catch {
      return line;
    }
  });

  return rewritten.join('\n');
}

function extractM3uAttr(line: string, attr: string): string {
  const match = line.match(new RegExp(`${attr}="([^"]*)"`, 'i'));
  return match ? match[1].trim() : '';
}

function parseServerM3u(content: string, sourceLabel: string, skipWebLinks = false): IndexedChannel[] {
  const lines = content.split(/\r?\n/);
  const out: IndexedChannel[] = [];
  let name = '';
  let logo = '';
  let group = 'General';
  let country = 'INT';
  let lang = '';
  let ua = '';
  let ref = '';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF:')) {
      logo = extractM3uAttr(line, 'tvg-logo');
      group = decodeHtml(extractM3uAttr(line, 'group-title') || 'General');
      country = extractM3uAttr(line, 'tvg-country').toUpperCase() || 'INT';
      if (country === 'INT') {
        const tvgId = extractM3uAttr(line, 'tvg-id');
        const idMatch = tvgId.match(/\.([a-z]{2})@/i);
        if (idMatch) country = idMatch[1].toUpperCase();
      }
      lang = decodeHtml(extractM3uAttr(line, 'tvg-language'));
      const tvgName = extractM3uAttr(line, 'tvg-name');
      const comma = line.lastIndexOf(',');
      name = decodeHtml((comma !== -1 ? line.slice(comma + 1).trim() : '') || tvgName || `Chaîne ${out.length + 1}`);
      continue;
    }

    if (line.startsWith('#EXTVLCOPT:')) {
      const opt = line.slice('#EXTVLCOPT:'.length);
      if (opt.toLowerCase().startsWith('http-user-agent=')) ua = opt.slice(16).trim();
      if (opt.toLowerCase().startsWith('http-referrer=')) ref = opt.slice(14).trim();
      continue;
    }

    if (line.startsWith('#')) continue;

    if (/^https?:\/\//i.test(line)) {
      const lower = line.toLowerCase();
      if (
        skipWebLinks &&
        (lower.includes('youtube.com/') || lower.includes('youtu.be/') || lower.includes('dailymotion.com/'))
      ) {
        name = '';
        logo = '';
        group = 'General';
        country = 'INT';
        lang = '';
        ua = '';
        ref = '';
        continue;
      }

      const resBucket = classifyResolution(undefined, name);
      out.push({
        id: `m3u:${out.length}:${encodeURIComponent(name).slice(0, 20)}`,
        name,
        url: line,
        logo: logo || undefined,
        countryCode: country,
        countryName: country === 'INT' ? 'International' : country,
        countryFlag: country === 'INT' ? '🌐' : '',
        categories: [group.toLowerCase()],
        languages: lang ? [lang.toLowerCase()] : [],
        languageNames: lang ? [lang] : [],
        type: 'live_24_7',
        quality: resBucket !== 'unknown' ? resBucket.toUpperCase() : undefined,
        resolutionBucket: resBucket,
        userAgent: ua || undefined,
        referrer: ref || undefined,
        isHttp: lower.startsWith('http://'),
        isGeoBlocked: false,
        isAfrican: isAfricanChannel(country, `${group} ${name}`),
        sourceKind: 'iptv-org',
        sourceLabel,
      });
      name = '';
      logo = '';
      group = 'General';
      country = 'INT';
      lang = '';
      ua = '';
      ref = '';
    }
  }
  return out;
}

function walkDir(dir: string, rootDir: string, acc: Array<{ path: string; size: number }> = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'build' || entry.name === '.gradle' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(full, rootDir, acc);
    } else {
      const stat = fs.statSync(full);
      acc.push({
        path: path.relative(rootDir, full).replace(/\\/g, '/'),
        size: stat.size,
      });
    }
  }
  return acc;
}

async function startServer() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'ktp-iptv-proxy', timestamp: new Date().toISOString() });
  });

  // Catalog metadata (countries, categories, languages, HTTP/HTTPS stats)
  app.get('/api/iptv/meta', async (req: Request, res: Response) => {
    try {
      const force = req.query.refresh === '1';
      const catalog = await loadIptvOrgCatalog(force);
      res.json({
        stats: catalog.stats,
        countries: catalog.countries,
        categories: catalog.categories,
        languages: catalog.languages,
        resolutions: catalog.resolutions,
      });
    } catch (error) {
      res.status(502).json({
        error: 'Impossible de synchroniser le catalogue iptv-org',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Paginated & filtered channels from iptv-org
  app.get('/api/iptv/channels', async (req: Request, res: Response) => {
    try {
      const catalog = await loadIptvOrgCatalog();
      const country = String(req.query.country || '').trim().toUpperCase();
      const category = String(req.query.category || '').trim().toLowerCase();
      const language = String(req.query.language || '').trim().toLowerCase();
      const type = String(req.query.type || '').trim();
      const resolution = String(req.query.resolution || '').trim().toLowerCase();
      const protocol = String(req.query.protocol || '').trim().toLowerCase();
      const q = String(req.query.q || '').trim().toLowerCase();
      const limit = Math.min(Math.max(Number(req.query.limit || 120), 1), 500);
      const offset = Math.max(Number(req.query.offset || 0), 0);

      const filtered = catalog.channels.filter((ch) => {
        if (country === 'AFR') {
          if (!ch.isAfrican && ch.countryCode !== 'AFR') return false;
        } else if (country && country !== 'ALL' && ch.countryCode !== country) {
          return false;
        }
        if (category && category !== 'all' && !ch.categories.includes(category)) return false;
        if (language && language !== 'all' && !ch.languages.includes(language)) return false;
        if (type && type !== 'all' && ch.type !== type) return false;
        if (resolution && resolution !== 'all' && ch.resolutionBucket !== resolution) return false;
        if (protocol === 'http' && !ch.isHttp) return false;
        if (protocol === 'https' && ch.isHttp) return false;
        if (q) {
          const hay = `${ch.name} ${ch.countryName} ${ch.network || ''} ${ch.categories.join(' ')} ${ch.languageNames.join(' ')}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });

      res.json({
        total: filtered.length,
        offset,
        limit,
        items: filtered.slice(offset, offset + limit),
      });
    } catch (error) {
      res.status(502).json({
        error: 'Erreur de chargement des chaînes',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // HTTP/HTTPS Streaming Proxy for HLS (.m3u8) & TS/MP4 streams
  app.get('/api/proxy/stream', async (req: Request, res: Response) => {
    const rawUrl = String(req.query.url || '').trim();
    const ua = req.query.ua ? String(req.query.ua) : undefined;
    const ref = req.query.ref ? String(req.query.ref) : undefined;

    if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) {
      res.status(400).json({ error: 'URL de flux invalide' });
      return;
    }

    try {
      const headers: Record<string, string> = {
        'User-Agent':
          ua ||
          'Mozilla/5.0 (Linux; Android 14; KTP-IPTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
        Accept: '*/*',
      };
      if (ref) headers['Referer'] = ref;
      if (req.headers.range) headers['Range'] = String(req.headers.range);

      const upstream = await fetch(rawUrl, {
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(20000),
      });

      if (!upstream.ok && upstream.status !== 206) {
        res.status(upstream.status).json({
          error: `Le serveur distant a répondu ${upstream.status}`,
          upstreamUrl: rawUrl,
        });
        return;
      }

      const finalUrl = upstream.url || rawUrl;
      const contentType = upstream.headers.get('content-type') || '';
      const isPlaylist =
        contentType.includes('mpegurl') ||
        contentType.includes('x-mpegurl') ||
        finalUrl.toLowerCase().includes('.m3u8') ||
        finalUrl.toLowerCase().includes('.m3u');

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.setHeader('Cache-Control', 'no-cache');

      if (isPlaylist) {
        const text = await upstream.text();
        if (text.trimStart().startsWith('#EXTM3U')) {
          const rewritten = rewriteM3u8Manifest(text, finalUrl, ua, ref);
          res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
          res.status(200).send(rewritten);
          return;
        }
        res.setHeader('Content-Type', contentType || 'text/plain; charset=utf-8');
        res.status(200).send(text);
        return;
      }

      res.status(upstream.status);
      if (contentType) res.setHeader('Content-Type', contentType);
      const contentLength = upstream.headers.get('content-length');
      if (contentLength) res.setHeader('Content-Length', contentLength);
      const acceptRanges = upstream.headers.get('accept-ranges');
      if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);

      if (!upstream.body) {
        res.end();
        return;
      }

      const nodeStream = Readable.fromWeb(upstream.body as unknown as Parameters<typeof Readable.fromWeb>[0]);
      nodeStream.on('error', () => {
        if (!res.headersSent) res.status(502);
        res.end();
      });
      res.on('close', () => {
        nodeStream.destroy();
      });
      nodeStream.pipe(res);
    } catch (error) {
      if (!res.headersSent) {
        res.status(502).json({
          error: 'Échec du relais proxy HTTP/HTTPS',
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }
  });

  // Remote M3U playlist fetcher & parser (bypasses HTTP mixed content & CORS)
  app.get('/api/proxy/m3u', async (req: Request, res: Response) => {
    const rawUrl = String(req.query.url || '').trim();
    const label = String(req.query.label || 'Playlist M3U').trim();
    if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) {
      res.status(400).json({ error: 'URL M3U invalide' });
      return;
    }

    try {
      const upstream = await fetch(rawUrl, {
        headers: { 'User-Agent': 'KTP-IPTV-M3U/1.0' },
        redirect: 'follow',
        signal: AbortSignal.timeout(25000),
      });
      if (!upstream.ok) {
        res.status(upstream.status).json({ error: `Erreur HTTP ${upstream.status}` });
        return;
      }
      const text = await upstream.text();
      const channels = parseServerM3u(text, label);
      res.json({
        count: channels.length,
        channels: channels.map((c) => ({ ...c, sourceKind: 'm3u' })),
      });
    } catch (error) {
      res.status(502).json({
        error: 'Impossible de récupérer la playlist M3U',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Xtream Codes API proxy (solves HTTP/HTTPS, CORS, UA blocking, redirects & get.php fallback)
  app.post('/api/xtream/connect', async (req: Request, res: Response) => {
    const body = req.body as {
      host?: string;
      username?: string;
      password?: string;
      label?: string;
    };

    let hostInput = String(body.host || '').trim();
    let cleanUser = String(body.username || '').trim();
    let cleanPass = String(body.password || '').trim();

    if (hostInput && !/^https?:\/\//i.test(hostInput)) {
      hostInput = `http://${hostInput}`;
    }

    let normalizedHost = hostInput.replace(/\/+$/, '');
    try {
      const parsed = new URL(hostInput);
      if (!cleanUser) cleanUser = (parsed.searchParams.get('username') || '').trim();
      if (!cleanPass) cleanPass = (parsed.searchParams.get('password') || '').trim();
      const cleanedPath = parsed.pathname
        .replace(/\/(player_api\.php|panel_api\.php|get\.php|xmltv\.php).*$/i, '')
        .replace(/\/c\/?$/i, '')
        .replace(/\/+$/, '');
      normalizedHost = `${parsed.origin}${cleanedPath}`;
    } catch {
      normalizedHost = hostInput
        .split('?')[0]
        .replace(/\/(player_api\.php|panel_api\.php|get\.php).*$/i, '')
        .replace(/\/+$/, '');
    }

    if (!normalizedHost || !cleanUser || !cleanPass) {
      res.status(400).json({ error: 'Hôte, identifiant et mot de passe Xtream requis' });
      return;
    }

    const encUser = encodeURIComponent(cleanUser);
    const encPass = encodeURIComponent(cleanPass);
    const apiUrl = `${normalizedHost}/player_api.php?username=${encUser}&password=${encPass}`;

    const userAgents = [
      'IPTVSmartersPro',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      'Lavf/58.76.100',
    ];

    try {
      let activeUa = userAgents[0];
      let authRes: globalThis.Response | null = null;
      let authText = '';

      for (const ua of userAgents) {
        try {
          const attempt = await fetch(apiUrl, {
            headers: {
              'User-Agent': ua,
              Accept: 'application/json, text/plain, */*',
            },
            redirect: 'follow',
            signal: AbortSignal.timeout(15000),
          });
          authRes = attempt;
          activeUa = ua;
          authText = await attempt.text();
          if (attempt.ok && authText.trim().length > 0) break;
          if (attempt.status !== 403 && attempt.status !== 406 && attempt.status !== 429) break;
        } catch {
          // continue trying next UA
        }
      }

      if (!authRes) {
        res.status(502).json({ error: `Serveur Xtream injoignable (${normalizedHost})` });
        return;
      }

      const tryGetPhpFallback = async (baseOrigin: string) => {
        const candidates = [
          `${baseOrigin}/get.php?username=${encUser}&password=${encPass}&type=m3u_plus&output=m3u8`,
          `${baseOrigin}/get.php?username=${encUser}&password=${encPass}&type=m3u_plus&output=ts`,
        ];
        for (const m3uUrl of candidates) {
          try {
            const mRes = await fetch(m3uUrl, {
              headers: { 'User-Agent': activeUa },
              redirect: 'follow',
              signal: AbortSignal.timeout(20000),
            });
            if (!mRes.ok) continue;
            const txt = await mRes.text();
            if (txt.includes('#EXTINF')) {
              const parsed = parseServerM3u(txt, decodeHtml(body.label) || new URL(baseOrigin).hostname);
              if (parsed.length > 0) {
                return parsed.map((c) => ({ ...c, sourceKind: 'xtream' as const, userAgent: c.userAgent || activeUa }));
              }
            }
          } catch {
            // ignore candidate error
          }
        }
        return null;
      };

      let authData: {
        user_info?: {
          auth?: number | string | boolean;
          status?: string;
          exp_date?: string;
          allowed_output_formats?: string[];
        };
      } | null = null;
      if (authRes.ok && authText.trimStart().startsWith('{')) {
        try {
          authData = JSON.parse(authText);
        } catch {
          authData = null;
        }
      }

      if (!authData?.user_info) {
        if (authRes.status === 401 || authRes.status === 403) {
          res.status(authRes.status).json({ error: `Accès refusé par le serveur Xtream (HTTP ${authRes.status})` });
          return;
        }
        const m3uFallback = await tryGetPhpFallback(normalizedHost);
        if (m3uFallback) {
          res.json({ userInfo: { auth: 1, status: 'Active' }, channels: m3uFallback });
          return;
        }
        res.status(502).json({ error: `Réponse Xtream invalide (HTTP ${authRes.status}). Vérifiez l'URL du serveur.` });
        return;
      }

      const rawAuth = authData.user_info.auth;
      const statusStr = String(authData.user_info.status || '');
      const isZeroAuth = rawAuth === 0 || rawAuth === '0' || rawAuth === false || String(rawAuth).toLowerCase() === 'false';
      const isTruthyAuth =
        rawAuth === 1 || rawAuth === '1' || rawAuth === true || String(rawAuth).toLowerCase() === 'true';
      const authValid = isTruthyAuth || (!isZeroAuth && statusStr.toLowerCase() === 'active');

      if (!authValid) {
        if (statusStr && statusStr.toLowerCase() !== 'active') {
          res.status(401).json({ error: `Compte Xtream ${statusStr} (abonnement expiré ou désactivé)` });
          return;
        }
        res.status(401).json({ error: 'Identifiant ou mot de passe refusé par le serveur Xtream (auth=0)' });
        return;
      }

      let effectiveBase = normalizedHost;
      try {
        if (authRes.url) effectiveBase = new URL(authRes.url).origin;
      } catch {
        // keep normalizedHost
      }

      const apiBase = `${effectiveBase}/player_api.php?username=${encUser}&password=${encPass}`;
      const allowedFormats = Array.isArray(authData.user_info.allowed_output_formats)
        ? authData.user_info.allowed_output_formats.map((f) => String(f).toLowerCase())
        : [];
      const liveExt = allowedFormats.includes('m3u8')
        ? 'm3u8'
        : allowedFormats.includes('ts')
          ? 'ts'
          : 'm3u8';

      const fetchXtreamArr = async (action: string) => {
        try {
          const r = await fetch(`${apiBase}&action=${action}`, {
            headers: { 'User-Agent': activeUa },
            signal: AbortSignal.timeout(20000),
          });
          if (!r.ok) return [];
          const json = await r.json();
          return Array.isArray(json) ? json : [];
        } catch {
          return [];
        }
      };

      const [liveCats, liveStreams, vodCats, vodStreams, seriesCats, seriesList] = await Promise.all([
        fetchXtreamArr('get_live_categories'),
        fetchXtreamArr('get_live_streams'),
        fetchXtreamArr('get_vod_categories'),
        fetchXtreamArr('get_vod_streams'),
        fetchXtreamArr('get_series_categories'),
        fetchXtreamArr('get_series'),
      ]);

      const catNames = new Map<string, string>();
      for (const c of [...liveCats, ...vodCats, ...seriesCats]) {
        if (c?.category_id) catNames.set(String(c.category_id), decodeHtml(String(c.category_name || 'General')));
      }

      const channels: Array<Record<string, unknown>> = [];
      const sourceLabel = decodeHtml(body.label) || new URL(effectiveBase).hostname;
      const isHttp = effectiveBase.startsWith('http://');

      for (const s of liveStreams.slice(0, 2500)) {
        const cat = catNames.get(String(s.category_id || '')) || 'Live TV';
        const name = decodeHtml(s.name) || `Live #${s.stream_id}`;
        const resolutionBucket = classifyResolution(undefined, name);
        const url = `${effectiveBase}/live/${encUser}/${encPass}/${s.stream_id}.${liveExt}`;
        channels.push({
          id: `xtream:live:${s.stream_id}`,
          name,
          url,
          logo: s.stream_icon || undefined,
          countryCode: 'INT',
          countryName: 'Xtream Server',
          countryFlag: '📡',
          categories: [cat.toLowerCase()],
          languages: [],
          languageNames: [],
          type: 'live_24_7',
          quality: resolutionBucket !== 'unknown' ? resolutionBucket.toUpperCase() : undefined,
          resolutionBucket,
          userAgent: activeUa,
          isHttp,
          isGeoBlocked: false,
          isAfrican: isAfricanChannel('INT', `${cat} ${name}`),
          sourceKind: 'xtream',
          sourceLabel,
        });
      }

      for (const v of vodStreams.slice(0, 1000)) {
        const cat = catNames.get(String(v.category_id || '')) || 'VOD';
        const name = decodeHtml(v.name) || `Film #${v.stream_id}`;
        const resolutionBucket = classifyResolution(undefined, name);
        const ext = v.container_extension || 'mp4';
        const url = `${effectiveBase}/movie/${encUser}/${encPass}/${v.stream_id}.${ext}`;
        channels.push({
          id: `xtream:vod:${v.stream_id}`,
          name,
          url,
          logo: v.stream_icon || undefined,
          countryCode: 'INT',
          countryName: 'Xtream VOD',
          countryFlag: '🎬',
          categories: [cat.toLowerCase()],
          languages: [],
          languageNames: [],
          type: 'vod',
          quality: resolutionBucket !== 'unknown' ? resolutionBucket.toUpperCase() : undefined,
          resolutionBucket,
          userAgent: activeUa,
          isHttp,
          isGeoBlocked: false,
          isAfrican: false,
          sourceKind: 'xtream',
          sourceLabel,
        });
      }

      for (const sr of seriesList.slice(0, 500)) {
        const cat = catNames.get(String(sr.category_id || '')) || 'Séries';
        const name = decodeHtml(sr.name) || `Série #${sr.series_id}`;
        const resolutionBucket = classifyResolution(undefined, name);
        channels.push({
          id: `xtream:series:${sr.series_id}`,
          name,
          url: `${effectiveBase}/series/${encUser}/${encPass}/${sr.series_id}.${liveExt}`,
          logo: sr.cover || undefined,
          countryCode: 'INT',
          countryName: 'Xtream Séries',
          countryFlag: '📺',
          categories: [cat.toLowerCase()],
          languages: [],
          languageNames: [],
          type: 'series',
          quality: resolutionBucket !== 'unknown' ? resolutionBucket.toUpperCase() : undefined,
          resolutionBucket,
          userAgent: activeUa,
          isHttp,
          isGeoBlocked: false,
          isAfrican: false,
          sourceKind: 'xtream',
          sourceLabel,
        });
      }

      if (channels.length === 0) {
        const m3uFallback = await tryGetPhpFallback(effectiveBase);
        if (m3uFallback) {
          res.json({ userInfo: authData.user_info, channels: m3uFallback });
          return;
        }
      }

      res.json({
        userInfo: authData.user_info,
        channels,
      });
    } catch (error) {
      res.status(502).json({
        error: 'Connexion au serveur Xtream Codes impossible',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Expose Kotlin Android + GitHub CI/CD project tree for inspection
  app.get('/api/kotlin/tree', (_req: Request, res: Response) => {
    const androidFiles = walkDir(path.join(__dirname, 'android'), __dirname);
    const workflowFiles = walkDir(path.join(__dirname, '.github'), __dirname);
    const all = [...androidFiles, ...workflowFiles].map((f) => {
      let category: 'kotlin' | 'gradle' | 'manifest' | 'ci' | 'docs' = 'docs';
      if (f.path.endsWith('.kt')) category = 'kotlin';
      else if (f.path.endsWith('.kts') || f.path.endsWith('.properties')) category = 'gradle';
      else if (f.path.endsWith('.xml')) category = 'manifest';
      else if (f.path.includes('.github/workflows')) category = 'ci';
      return { ...f, category };
    });
    res.json({ files: all });
  });

  app.get('/api/kotlin/file', (req: Request, res: Response) => {
    const relPath = String(req.query.path || '').replace(/^\/+/, '');
    if (!relPath || relPath.includes('..') || (!relPath.startsWith('android/') && !relPath.startsWith('.github/'))) {
      res.status(400).json({ error: 'Chemin non autorisé' });
      return;
    }
    const fullPath = path.join(__dirname, relPath);
    if (!fs.existsSync(fullPath)) {
      res.status(404).json({ error: 'Fichier introuvable' });
      return;
    }
    res.json({ path: relPath, content: fs.readFileSync(fullPath, 'utf-8') });
  });

  // In-App Update endpoint checking latest GitHub Release APK on mafiruss12/IPTV-KTP-FREE
  let updateCache: { data: Record<string, unknown>; fetchedAt: number } | null = null;
  app.get('/api/app/update', async (_req: Request, res: Response) => {
    try {
      if (updateCache && Date.now() - updateCache.fetchedAt < 5 * 60 * 1000) {
        res.json(updateCache.data);
        return;
      }

      let payload: Record<string, unknown> | null = null;
      try {
        const ghRes = await fetch(
          'https://api.github.com/repos/mafiruss12/IPTV-KTP-FREE/releases/latest',
          {
            headers: {
              Accept: 'application/vnd.github+json',
              'User-Agent': 'KTP-IPTV-Updater/1.0',
            },
            signal: AbortSignal.timeout(10000),
          }
        );
        if (ghRes.ok) {
          const rel = (await ghRes.json()) as {
            tag_name?: string;
            name?: string;
            body?: string;
            published_at?: string;
            html_url?: string;
            assets?: Array<{ name: string; size: number; browser_download_url: string }>;
          };
          const assets = rel.assets || [];
          const ktpReleaseApk = assets.find(
            (a) => a.name.startsWith('KTP-IPTV-') && a.name.endsWith('.apk') && !a.name.includes('unsigned')
          );
          const signedReleaseApk = assets.find(
            (a) => a.name.includes('release') && a.name.endsWith('.apk') && !a.name.includes('unsigned')
          );
          const debugApk = assets.find((a) => a.name.endsWith('debug.apk'));
          const anyApk = assets.find((a) => a.name.endsWith('.apk'));
          const chosenApk = ktpReleaseApk || signedReleaseApk || debugApk || anyApk;
          const tag = rel.tag_name || 'v1.0.0';
          payload = {
            tag,
            name: rel.name || tag || 'KTP IPTV',
            publishedAt: rel.published_at || new Date().toISOString(),
            notes: rel.body || '',
            htmlUrl: rel.html_url || 'https://github.com/mafiruss12/IPTV-KTP-FREE/releases',
            apkName: chosenApk?.name || `KTP-IPTV-${tag}.apk`,
            apkUrl:
              chosenApk?.browser_download_url ||
              `https://github.com/mafiruss12/IPTV-KTP-FREE/releases/download/${tag}/KTP-IPTV-${tag}.apk`,
            apkSize: chosenApk?.size || 0,
          };
        }
      } catch {
        // fallback below
      }

      if (!payload) {
        try {
          const redirRes = await fetch('https://github.com/mafiruss12/IPTV-KTP-FREE/releases/latest', {
            headers: { 'User-Agent': 'KTP-IPTV-Updater/1.0' },
            redirect: 'follow',
            signal: AbortSignal.timeout(10000),
          });
          const tag = redirRes.url.split('/releases/tag/')[1]?.split('?')[0]?.trim();
          if (tag) {
            const apkName = `KTP-IPTV-${tag}.apk`;
            payload = {
              tag,
              name: `KTP IPTV Android ${tag}`,
              publishedAt: new Date().toISOString(),
              notes: '',
              htmlUrl: redirRes.url,
              apkName,
              apkUrl: `https://github.com/mafiruss12/IPTV-KTP-FREE/releases/download/${tag}/${apkName}`,
              apkSize: 0,
            };
          }
        } catch {
          // fallback below
        }
      }

      if (!payload) {
        payload = {
          tag: 'latest',
          name: 'KTP IPTV Android (GitHub Releases)',
          publishedAt: new Date().toISOString(),
          notes: '',
          htmlUrl: 'https://github.com/mafiruss12/IPTV-KTP-FREE/releases/latest',
          apkName: 'Dernier APK signé (GitHub)',
          apkUrl: 'https://github.com/mafiruss12/IPTV-KTP-FREE/releases/latest',
          apkSize: 0,
        };
      }

      updateCache = { data: payload, fetchedAt: Date.now() };
      res.json(payload);
    } catch (error) {
      res.status(502).json({
        error: 'Impossible de vérifier les mises à jour',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  if (IS_PROD) {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`KTP IPTV server + HTTP/HTTPS proxy running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
