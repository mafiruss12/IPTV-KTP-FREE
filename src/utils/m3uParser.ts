import type { ChannelType, IptvChannel } from '../types/iptv';

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
      currentGroup = extractAttr(raw, 'group-title') || 'General';
      currentCountry = extractAttr(raw, 'tvg-country').toUpperCase();
      currentLanguage = extractAttr(raw, 'tvg-language');
      const tvgName = extractAttr(raw, 'tvg-name');
      const commaIdx = raw.lastIndexOf(',');
      const displayName = commaIdx !== -1 ? raw.slice(commaIdx + 1).trim() : '';
      currentName = displayName || tvgName || `Chaîne ${channels.length + 1}`;
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
        userAgent: currentUa || undefined,
        referrer: currentRef || undefined,
        isHttp: lowerUrl.startsWith('http://'),
        isGeoBlocked: false,
        sourceKind: 'm3u',
        sourceLabel,
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
