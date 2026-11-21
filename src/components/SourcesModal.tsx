import { useState, type FormEvent } from 'react';
import { FileUp, Link2, Server, Trash2, CheckCircle2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import type { IptvChannel, PlaylistSource } from '../types/iptv';
import { parseM3uContent } from '../utils/m3uParser';

interface SourcesPanelProps {
  sources: PlaylistSource[];
  onAddSource: (source: PlaylistSource, channels: IptvChannel[]) => void;
  onRemoveSource: (sourceId: string) => void;
}

export function SourcesPanel({ sources, onAddSource, onRemoveSource }: SourcesPanelProps) {
  const [tab, setTab] = useState<'m3u' | 'xtream' | 'file'>('m3u');
  const [m3uName, setM3uName] = useState('');
  const [m3uUrl, setM3uUrl] = useState('');

  const [xtreamName, setXtreamName] = useState('');
  const [xtreamHost, setXtreamHost] = useState('');
  const [xtreamUser, setXtreamUser] = useState('');
  const [xtreamPass, setXtreamPass] = useState('');
  const [showPass, setShowPass] = useState(false);

  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const handleAddM3uUrl = async (e: FormEvent) => {
    e.preventDefault();
    if (!m3uUrl.trim()) return;
    setLoading(true);
    setFeedback(null);
    try {
      const label = m3uName.trim() || 'Playlist M3U';
      const res = await fetch(
        `/api/proxy/m3u?url=${encodeURIComponent(m3uUrl.trim())}&label=${encodeURIComponent(label)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Échec du chargement M3U');

      const sourceId = `m3u-${Date.now()}`;
      const channels: IptvChannel[] = (data.channels || []).map((c: IptvChannel, idx: number) => ({
        ...c,
        id: `${sourceId}:${idx}`,
        sourceKind: 'm3u',
        sourceLabel: label,
      }));

      onAddSource(
        {
          id: sourceId,
          name: label,
          kind: 'm3u',
          url: m3uUrl.trim(),
          channelCount: channels.length,
          addedAt: new Date().toISOString(),
          enabled: true,
        },
        channels
      );
      setFeedback({ kind: 'ok', text: `${channels.length} chaînes importées depuis la playlist M3U.` });
      setM3uName('');
      setM3uUrl('');
    } catch (err) {
      setFeedback({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Impossible de lire cette playlist M3U',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleConnectXtream = async (e: FormEvent) => {
    e.preventDefault();
    if (!xtreamHost.trim() || !xtreamUser.trim() || !xtreamPass.trim()) return;
    setLoading(true);
    setFeedback(null);
    try {
      const label = xtreamName.trim() || xtreamHost.trim();
      const res = await fetch('/api/xtream/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: xtreamHost.trim(),
          username: xtreamUser.trim(),
          password: xtreamPass.trim(),
          label,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Connexion Xtream refusée');

      const sourceId = `xtream-${Date.now()}`;
      const channels: IptvChannel[] = (data.channels || []).map((c: IptvChannel, idx: number) => ({
        ...c,
        id: `${sourceId}:${idx}`,
      }));

      onAddSource(
        {
          id: sourceId,
          name: label,
          kind: 'xtream',
          url: xtreamHost.trim(),
          username: xtreamUser.trim(),
          password: xtreamPass.trim(),
          channelCount: channels.length,
          addedAt: new Date().toISOString(),
          enabled: true,
        },
        channels
      );
      setFeedback({
        kind: 'ok',
        text: `Serveur Xtream connecté : ${channels.length} flux Live, VOD et Séries ajoutés (routage HTTP→HTTPS actif).`,
      });
      setXtreamName('');
      setXtreamHost('');
      setXtreamUser('');
      setXtreamPass('');
    } catch (err) {
      setFeedback({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Erreur de connexion Xtream Codes',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (file: File | undefined) => {
    if (!file) return;
    setLoading(true);
    setFeedback(null);
    try {
      const text = await file.text();
      const sourceId = `file-${Date.now()}`;
      const label = file.name.replace(/\.(m3u8?|txt)$/i, '');
      const channels = parseM3uContent(text, label, sourceId);
      if (channels.length === 0) {
        throw new Error('Aucun flux valide détecté dans ce fichier.');
      }
      onAddSource(
        {
          id: sourceId,
          name: label,
          kind: 'm3u',
          url: `Fichier local (${file.name})`,
          channelCount: channels.length,
          addedAt: new Date().toISOString(),
          enabled: true,
        },
        channels
      );
      setFeedback({ kind: 'ok', text: `${channels.length} chaînes extraites de ${file.name}.` });
    } catch (err) {
      setFeedback({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Fichier M3U invalide',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <div className="lg:col-span-7 rounded-2xl bg-[#131720] border border-slate-800/80 p-6">
        <h2 className="font-display text-lg font-semibold text-white">Ajouter une source IPTV</h2>
        <p className="text-sm text-slate-400 mt-1">
          Toutes les requêtes HTTP et HTTPS sont relayées via le proxy intégré. Les flux publics Afrique et France/TNT sont déjà indexés ; importez vos identifiants Xtream ou M3U pour vos bouquets privés (Canal+ chiffrés, VOD, etc.).
        </p>

        <div className="flex items-center gap-1 p-1 bg-[#0B0D11] rounded-xl border border-slate-800 mt-5 w-fit">
          <button
            type="button"
            onClick={() => setTab('m3u')}
            className={`min-h-[40px] px-4 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              tab === 'm3u' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Lien M3U / M3U8
          </button>
          <button
            type="button"
            onClick={() => setTab('xtream')}
            className={`min-h-[40px] px-4 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              tab === 'xtream' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Xtream Codes API
          </button>
          <button
            type="button"
            onClick={() => setTab('file')}
            className={`min-h-[40px] px-4 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              tab === 'file' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Fichier .m3u
          </button>
        </div>

        {tab === 'm3u' && (
          <form onSubmit={handleAddM3uUrl} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Nom de la playlist</label>
              <input
                type="text"
                value={m3uName}
                onChange={(e) => setM3uName(e.target.value)}
                placeholder="Ex : Chaînes France HD"
                className="w-full h-11 px-3.5 rounded-xl bg-[#0B0D11] border border-slate-800 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">URL M3U / M3U8 (HTTP ou HTTPS)</label>
              <input
                type="url"
                required
                value={m3uUrl}
                onChange={(e) => setM3uUrl(e.target.value)}
                placeholder="https://iptv-org.github.io/iptv/languages/fra.m3u"
                className="w-full h-11 px-3.5 rounded-xl bg-[#0B0D11] border border-slate-800 text-sm font-mono text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setM3uName('Afrique complète');
                  setM3uUrl('https://iptv-org.github.io/iptv/regions/afr.m3u');
                }}
                className="px-3 py-1.5 rounded-lg bg-[#1B212E] hover:bg-slate-700 text-xs text-slate-300 transition-colors"
              >
                Afrique complète (530+)
              </button>
              <button
                type="button"
                onClick={() => {
                  setM3uName('France & TNT');
                  setM3uUrl('https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist_france.m3u8');
                }}
                className="px-3 py-1.5 rounded-lg bg-[#1B212E] hover:bg-slate-700 text-xs text-slate-300 transition-colors"
              >
                France & TNT
              </button>
              <button
                type="button"
                onClick={() => {
                  setM3uName('iptv-org Français');
                  setM3uUrl('https://iptv-org.github.io/iptv/languages/fra.m3u');
                }}
                className="px-3 py-1.5 rounded-lg bg-[#1B212E] hover:bg-slate-700 text-xs text-slate-300 transition-colors"
              >
                Francophone
              </button>
              <button
                type="button"
                onClick={() => {
                  setM3uName('iptv-org Sports');
                  setM3uUrl('https://iptv-org.github.io/iptv/categories/sports.m3u');
                }}
                className="px-3 py-1.5 rounded-lg bg-[#1B212E] hover:bg-slate-700 text-xs text-slate-300 transition-colors"
              >
                Sports
              </button>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors"
            >
              <Link2 className="w-4 h-4" />
              <span>{loading ? 'Analyse et proxy en cours…' : 'Importer la playlist M3U'}</span>
            </button>
          </form>
        )}

        {tab === 'xtream' && (
          <form onSubmit={handleConnectXtream} className="mt-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Nom du profil</label>
                <input
                  type="text"
                  value={xtreamName}
                  onChange={(e) => setXtreamName(e.target.value)}
                  placeholder="Mon Serveur Xtream"
                  className="w-full h-11 px-3.5 rounded-xl bg-[#0B0D11] border border-slate-800 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">URL du serveur (http:// ou https://)</label>
                <input
                  type="text"
                  required
                  value={xtreamHost}
                  onChange={(e) => setXtreamHost(e.target.value)}
                  placeholder="http://exemple.server:8080"
                  className="w-full h-11 px-3.5 rounded-xl bg-[#0B0D11] border border-slate-800 text-sm font-mono text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Nom d’utilisateur</label>
                <input
                  type="text"
                  required
                  value={xtreamUser}
                  onChange={(e) => setXtreamUser(e.target.value)}
                  placeholder="username"
                  className="w-full h-11 px-3.5 rounded-xl bg-[#0B0D11] border border-slate-800 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Mot de passe</label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    required
                    value={xtreamPass}
                    onChange={(e) => setXtreamPass(e.target.value)}
                    placeholder="••••••••"
                    className="w-full h-11 pl-3.5 pr-11 rounded-xl bg-[#0B0D11] border border-slate-800 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    aria-label={showPass ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[36px] min-w-[36px] rounded-lg text-slate-400 hover:text-white flex items-center justify-center"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors"
            >
              <Server className="w-4 h-4" />
              <span>{loading ? 'Authentification Xtream…' : 'Connecter Xtream Codes'}</span>
            </button>
          </form>
        )}

        {tab === 'file' && (
          <div className="mt-5">
            <label className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-[#0B0D11] hover:border-blue-500/70 transition-colors p-8 cursor-pointer text-center">
              <FileUp className="w-7 h-7 text-blue-400 mb-2" />
              <span className="text-sm font-medium text-white">Importer un fichier .m3u ou .m3u8</span>
              <span className="text-xs text-slate-400 mt-1">
                Analyse locale instantanée avec support tvg-logo, group-title et EXTVLCOPT
              </span>
              <input
                type="file"
                accept=".m3u,.m3u8,.txt"
                className="hidden"
                onChange={(e) => handleFileUpload(e.target.files?.[0])}
              />
            </label>
          </div>
        )}

        {feedback && (
          <div
            className={`mt-4 p-3.5 rounded-xl border text-xs flex items-center gap-2 ${
              feedback.kind === 'ok'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}
          >
            {feedback.kind === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}
      </div>

      {/* Active sources */}
      <div className="lg:col-span-5 rounded-2xl bg-[#131720] border border-slate-800/80 p-6">
        <h3 className="font-display text-base font-semibold text-white">Sources configurées</h3>
        <div className="mt-4 divide-y divide-slate-800/80">
          <div className="py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-white">iptv-org/iptv (Public Index)</div>
              <div className="text-xs text-slate-400 truncate">Source intégrée · Synchronisation API directe</div>
            </div>
            <span className="text-xs font-mono text-blue-400 shrink-0">Actif</span>
          </div>

          {sources.length === 0 ? (
            <div className="py-6 text-xs text-slate-400">
              Aucune playlist M3U ou compte Xtream personnalisé ajouté pour le moment.
            </div>
          ) : (
            sources.map((src) => (
              <div key={src.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-white truncate">{src.name}</div>
                  <div className="text-xs text-slate-400 truncate font-mono">
                    {src.kind.toUpperCase()} · {src.channelCount} flux · {src.url}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveSource(src.id)}
                  aria-label={`Supprimer ${src.name}`}
                  className="min-h-[40px] min-w-[40px] rounded-lg hover:bg-rose-500/15 text-slate-400 hover:text-rose-400 flex items-center justify-center transition-colors shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
