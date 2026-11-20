import { useState, type FormEvent } from 'react';
import { Download, FolderPlus, Play, Trash2 } from 'lucide-react';
import type { FavoriteList, IptvChannel } from '../types/iptv';
import { ChannelLogo } from './ChannelLogo';

interface FavoritesViewProps {
  favoriteLists: FavoriteList[];
  allKnownChannels: Map<string, IptvChannel>;
  activeChannelId?: string;
  onSelectChannel: (channel: IptvChannel) => void;
  onCreateList: (name: string) => void;
  onDeleteList: (listId: string) => void;
  onRemoveFromList: (listId: string, channelId: string) => void;
}

export function FavoritesView({
  favoriteLists,
  allKnownChannels,
  activeChannelId,
  onSelectChannel,
  onCreateList,
  onDeleteList,
  onRemoveFromList,
}: FavoritesViewProps) {
  const [selectedListId, setSelectedListId] = useState<string>(favoriteLists[0]?.id || 'default');
  const [newListName, setNewListName] = useState('');

  const activeList =
    favoriteLists.find((l) => l.id === selectedListId) || favoriteLists[0];

  const resolvedChannels = (activeList?.channelIds || [])
    .map((id) => allKnownChannels.get(id))
    .filter((ch): ch is IptvChannel => Boolean(ch));

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;
    onCreateList(newListName.trim());
    setNewListName('');
  };

  const handleExportM3u = () => {
    if (!activeList || resolvedChannels.length === 0) return;
    const lines = ['#EXTM3U'];
    for (const ch of resolvedChannels) {
      lines.push(
        `#EXTINF:-1 tvg-id="${ch.id}" tvg-logo="${ch.logo || ''}" tvg-country="${ch.countryCode}" group-title="${ch.categories[0] || 'Favoris'}",${ch.name}`
      );
      if (ch.userAgent) lines.push(`#EXTVLCOPT:http-user-agent=${ch.userAgent}`);
      if (ch.referrer) lines.push(`#EXTVLCOPT:http-referrer=${ch.referrer}`);
      lines.push(ch.url);
    }
    const blob = new Blob([lines.join('\n')], { type: 'audio/x-mpegurl;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeList.name.toLowerCase().replace(/\s+/g, '-')}.m3u`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <div className="lg:col-span-4 rounded-2xl bg-[#131720] border border-slate-800/80 p-5">
        <h2 className="font-display text-base font-semibold text-white">Listes de favoris</h2>
        <p className="text-xs text-slate-400 mt-1">
          Organisez vos chaînes par collection personnalisée et exportez-les en M3U.
        </p>

        <form onSubmit={handleCreate} className="mt-4 flex gap-2">
          <input
            type="text"
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            placeholder="Nouvelle liste (ex : Sport FR)"
            className="flex-1 h-11 px-3 rounded-xl bg-[#0B0D11] border border-slate-800 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            aria-label="Créer la liste"
            className="min-h-[44px] min-w-[44px] rounded-xl bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center transition-colors shrink-0"
          >
            <FolderPlus className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-4 space-y-1">
          {favoriteLists.map((list) => {
            const isActive = list.id === activeList?.id;
            return (
              <div
                key={list.id}
                className={`flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors ${
                  isActive ? 'bg-blue-600/15 border border-blue-500/30' : 'hover:bg-[#1B212E]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedListId(list.id)}
                  className="flex-1 text-left min-w-0 min-h-[36px] flex items-center justify-between pr-2"
                >
                  <span className={`text-sm font-medium truncate ${isActive ? 'text-white' : 'text-slate-300'}`}>
                    {list.name}
                  </span>
                  <span className="font-mono text-xs text-slate-400 tabular-nums ml-2">
                    {list.channelIds.length}
                  </span>
                </button>
                {list.id !== 'default' && (
                  <button
                    type="button"
                    onClick={() => onDeleteList(list.id)}
                    aria-label={`Supprimer ${list.name}`}
                    className="min-h-[36px] min-w-[36px] rounded-lg text-slate-500 hover:text-rose-400 flex items-center justify-center"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="lg:col-span-8 rounded-2xl bg-[#131720] border border-slate-800/80 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
          <div>
            <h3 className="font-display text-base font-semibold text-white">
              {activeList?.name || 'Favoris'}
            </h3>
            <p className="text-xs text-slate-400 tabular-nums">
              {resolvedChannels.length} chaîne{resolvedChannels.length > 1 ? 's' : ''} enregistrée{resolvedChannels.length > 1 ? 's' : ''}
            </p>
          </div>
          {resolvedChannels.length > 0 && (
            <button
              type="button"
              onClick={handleExportM3u}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#1B212E] hover:bg-slate-700 text-xs font-medium text-slate-200 inline-flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exporter .m3u</span>
            </button>
          )}
        </div>

        {resolvedChannels.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">
            Aucune chaîne dans cette liste. Cliquez sur l’icône Favoris d’une chaîne pour l’ajouter.
          </div>
        ) : (
          <div className="divide-y divide-slate-800/70 mt-2">
            {resolvedChannels.map((ch) => (
              <div
                key={ch.id}
                className={`py-3 px-2 flex items-center justify-between gap-3 rounded-xl transition-colors ${
                  activeChannelId === ch.id ? 'bg-blue-600/10' : 'hover:bg-[#1B212E]/60'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectChannel(ch)}
                  className="flex items-center gap-3 min-w-0 flex-1 text-left min-h-[44px]"
                >
                  <ChannelLogo src={ch.logo} name={ch.name} size="sm" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white truncate">{ch.name}</div>
                    <div className="text-xs text-slate-400 truncate">
                      {ch.countryFlag} {ch.countryName} · {ch.categories[0] || 'General'} ·{' '}
                      {ch.isHttp ? 'HTTP→HTTPS Proxy' : 'HTTPS'}
                    </div>
                  </div>
                </button>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => onSelectChannel(ch)}
                    aria-label={`Lire ${ch.name}`}
                    className="min-h-[40px] min-w-[40px] rounded-lg bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white flex items-center justify-center transition-colors"
                  >
                    <Play className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => activeList && onRemoveFromList(activeList.id, ch.id)}
                    aria-label={`Retirer ${ch.name}`}
                    className="min-h-[40px] min-w-[40px] rounded-lg text-slate-400 hover:text-rose-400 flex items-center justify-center transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
