import { useEffect, useState } from 'react';
import { Code2, Copy, Check, ExternalLink, GitBranch, Shield } from 'lucide-react';
import type { CatalogStats, KotlinProjectFile } from '../types/iptv';

interface KotlinProjectViewProps {
  stats: CatalogStats | null;
}

export function KotlinProjectView({ stats }: KotlinProjectViewProps) {
  const [files, setFiles] = useState<KotlinProjectFile[]>([]);
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [fileContent, setFileContent] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/api/kotlin/tree')
      .then((r) => r.json())
      .then((data) => {
        const list: KotlinProjectFile[] = data.files || [];
        setFiles(list);
        const preferred =
          list.find((f) => f.path.endsWith('LocalStreamProxy.kt')) ||
          list.find((f) => f.path.endsWith('.kt')) ||
          list[0];
        if (preferred) setSelectedPath(preferred.path);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedPath) return;
    fetch(`/api/kotlin/file?path=${encodeURIComponent(selectedPath)}`)
      .then((r) => r.json())
      .then((data) => setFileContent(data.content || ''))
      .catch(() => setFileContent(''));
  }, [selectedPath]);

  const handleCopy = () => {
    navigator.clipboard.writeText(fileContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <div className="space-y-6">
      {/* Architecture & iptv-org Analysis Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-[#131720] border border-slate-800/80 p-5">
          <div className="flex items-center gap-2 text-xs font-medium text-blue-400">
            <Shield className="w-4 h-4" />
            <span>Proxy HTTP ↔ HTTPS Hybride</span>
          </div>
          <h3 className="font-display text-base font-semibold text-white mt-2">
            Résolution Mixed Content & En-têtes
          </h3>
          <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
            Sur Android, <span className="font-mono text-slate-300">LocalStreamProxy.kt</span> lance un relais local sur <span className="font-mono text-slate-300">127.0.0.1</span> via OkHttp qui gère les redirections HTTP/HTTPS, injecte <span className="font-mono text-slate-300">User-Agent</span>/<span className="font-mono text-slate-300">Referer</span> et réécrit les segments <span className="font-mono text-slate-300">.m3u8</span>.
          </p>
        </div>

        <div className="rounded-2xl bg-[#131720] border border-slate-800/80 p-5">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
            <Code2 className="w-4 h-4 text-blue-400" />
            <span>Analyse iptv-org/iptv</span>
          </div>
          <div className="mt-2 font-display text-2xl font-bold text-white tabular-nums">
            {stats ? stats.totalChannels.toLocaleString('fr-FR') : '19 335'} flux
          </div>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed tabular-nums">
            {stats
              ? `${stats.httpCount.toLocaleString('fr-FR')} flux HTTP (${Math.round(
                  (stats.httpCount / Math.max(stats.totalChannels, 1)) * 100
                )}%) · ${stats.httpsCount.toLocaleString('fr-FR')} HTTPS · ${stats.customHeaderCount.toLocaleString(
                  'fr-FR'
                )} avec User-Agent/Referer.`
              : 'Analyse en direct des API streams.json, channels.json, feeds.json et logos.json.'}
          </p>
        </div>

        <div className="rounded-2xl bg-[#131720] border border-slate-800/80 p-5">
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-400">
            <GitBranch className="w-4 h-4" />
            <span>Dépôt GitHub & CI/CD</span>
          </div>
          <h3 className="font-display text-base font-semibold text-white mt-2">
            mafiruss12/IPTV-KTP-FREE
          </h3>
          <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
            Pipeline GitHub Actions (<span className="font-mono text-slate-300">android-ci.yml</span>) automatisant les tests Kotlin, la compilation APK Debug/Release et la publication des Releases.
          </p>
          <a
            href="https://github.com/mafiruss12/IPTV-KTP-FREE"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 mt-3"
          >
            <span>Ouvrir le dépôt GitHub</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Code Browser */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 rounded-2xl bg-[#131720] border border-slate-800/80 overflow-hidden">
        <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-slate-800/80 p-4 max-h-[540px] overflow-y-auto">
          <h3 className="font-display text-sm font-semibold text-white mb-3">
            Arborescence Kotlin & CI/CD ({files.length})
          </h3>
          <div className="space-y-1">
            {files.map((f) => {
              const active = f.path === selectedPath;
              return (
                <button
                  key={f.path}
                  type="button"
                  onClick={() => setSelectedPath(f.path)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-mono truncate transition-colors ${
                    active
                      ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-[#1B212E]'
                  }`}
                  title={f.path}
                >
                  {f.path}
                </button>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-8 flex flex-col min-w-0">
          <div className="px-4 py-3 border-b border-slate-800/80 flex items-center justify-between gap-3">
            <span className="font-mono text-xs text-slate-300 truncate">{selectedPath}</span>
            <button
              type="button"
              onClick={handleCopy}
              className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#1B212E] hover:bg-slate-700 text-xs text-slate-200 inline-flex items-center gap-1.5 shrink-0"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copié' : 'Copier'}</span>
            </button>
          </div>
          <pre className="p-4 text-xs font-mono text-slate-300 overflow-auto max-h-[490px] leading-relaxed bg-[#0B0D11]">
            <code>{fileContent}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}
