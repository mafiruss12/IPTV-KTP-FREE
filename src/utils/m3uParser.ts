import type { ChannelType, IptvChannel, ResolutionBucket } from '../types/iptv';

export function decodeHtml(input?: string | null): string {
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

export function classifyResolution(quality?: string | null, name?: string | null): ResolutionBucket {
  const combined = `${quality || ''} ${name || ''}`.toLowerCase();
  if (/(\b4k\b|\buhd\b|2160p|3840x2160)/.test(combined)) return '4k';
  if (/(1080p|1080i|\bfhd\b|full\s?hd|1920x1080)/.test(combined)) return '1080p';
  if (/(720p|\bhd\b|1280x720)/.test(combined)) return '720p';
  if (/(576p|540p|480p|360p|240p|\bsd\b)/.test(combined)) return 'sd';
  return 'unknown';
}

function extractAttr(line: string, attr: string): string {
  const regex = new RegExp(`${attr}="([^"]*)"`, 'i');
  const match = line.match(regex);
  return match ? match[1].trim() : '';
}

export function parseM3uContent(
  content: string,
  sourceLabel = 'Playlist M3U',
  sourceId = 'm3u'
): IptvChannel[] {
  const lines = content.split(/\r?\n/);
  const channels: IptvChannel[] = [];

  let currentName = '';
  let currentLogo = '';
  let currentGroup = '';
  let currentCountry = '';
  let currentLanguage = '';
  let currentId = '';
  let currentUa = '';
  let currentRef = '';

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;

    if (raw.startsWith('#EXTINF:')) {
      currentId = extractAttr(raw, 'tvg-id');
      currentLogo = extractAttr(raw, 'tvg-logo');
      currentGroup = decodeHtml(extractAttr(raw, 'group-title') || 'General');
      currentCountry = extractAttr(raw, 'tvg-country').toUpperCase();
      currentLanguage = decodeHtml(extractAttr(raw, 'tvg-language'));
      const tvgName = extractAttr(raw, 'tvg-name');
      const commaIdx = raw.lastIndexOf(',');
      const displayName = commaIdx !== -1 ? raw.slice(commaIdx + 1).trim() : '';
      currentName = decodeHtml(displayName || tvgName || `Chaîne ${channels.length + 1}`);
      continue;
    }

    if (raw.startsWith('#EXTVLCOPT:')) {
      const opt = raw.slice('#EXTVLCOPT:'.length);
      if (opt.toLowerCase().startsWith('http-user-agent=')) {
        currentUa = opt.slice('http-user-agent='.length).trim();
      } else if (opt.toLowerCase().startsWith('http-referrer=')) {
        currentRef = opt.slice('http-referrer='.length).trim();
      }
      continue;
    }

    if (raw.startsWith('#')) {
      continue;
    }

    if (/^https?:\/\//i.test(raw)) {
      const lowerUrl = raw.toLowerCase();
      let type: ChannelType = 'live_24_7';
      if (lowerUrl.includes('/movie/') || /\.(mp4|mkv|avi)(\?|$)/i.test(lowerUrl)) {
        type = 'vod';
      } else if (lowerUrl.includes('/series/')) {
        type = 'series';
      } else if (currentGroup.toLowerCase().includes('radio')) {
        type = 'radio';
      }

      const categorySlug = currentGroup.toLowerCase().split(';')[0].trim() || 'general';
      const countryCode = currentCountry || 'INT';
      const resolutionBucket = classifyResolution(undefined, currentName);

      channels.push({
        id: `${sourceId}:${currentId || channels.length + 1}:${encodeURIComponent(currentName).slice(0, 24)}`,
        name: currentName || `Flux ${channels.length + 1}`,
        url: raw,
        logo: currentLogo || undefined,
        countryCode,
        countryName: countryCode === 'INT' ? 'International' : countryCode,
        countryFlag: countryCode === 'INT' ? '🌐' : '',
        categories: [categorySlug],
        languages: currentLanguage ? [currentLanguage.toLowerCase()] : [],
        languageNames: currentLanguage ? [currentLanguage] : [],
        type,
        quality: resolutionBucket !== 'unknown' ? resolutionBucket.toUpperCase() : undefined,
        resolutionBucket,
        userAgent: currentUa || undefined,
        referrer: currentRef || undefined,
        isHttp: lowerUrl.startsWith('http://'),
        isGeoBlocked: false,
        sourceKind: 'm3u',
        sourceLabel: decodeHtml(sourceLabel),
      });

      currentName = '';
      currentLogo = '';
      currentGroup = '';
      currentCountry = '';
      currentLanguage = '';
      currentId = '';
      currentUa = '';
      currentRef = '';
    }
  }

  return channels;
}
