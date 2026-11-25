import { useMemo, useState } from 'react';
import { Check, Copy, Download, FileText } from 'lucide-react';
import { CronPreset, GeneratedFile, RepoSettings } from '../types';
import { resolveCronExpression } from '../utils/repoGenerator';
import { downloadSingleFile } from '../utils/zipExport';

interface RepoExplorerViewProps {
  files: GeneratedFile[];
  settings: RepoSettings;
  onUpdateSettings: (patch: Partial<RepoSettings>) => void;
  onDownloadZip: () => void;
}

export function RepoExplorerView({
  files,
  settings,
  onUpdateSettings,
  onDownloadZip,
}: RepoExplorerViewProps) {
  const [selectedPath, setSelectedPath] = useState<string>('.github/workflows/keepalive.yml');
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const activeFile = useMemo(
    () => files.find((f) => f.path === selectedPath) || files[0],
    [files, selectedPath]
  );

  const { cron } = resolveCronExpression(settings.cronPreset, settings.customCron);

  const handleCopyFile = async () => {
    if (!activeFile) return;
    try {
      await navigator.clipboard.writeText(activeFile.content);
      setCopiedPath(activeFile.path);
      setTimeout(() => setCopiedPath(null), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Paramètres des workflows GitHub Actions</h2>
            <p className="text-sm text-slate-500">
              Toutes les modifications régénèrent immédiatement les fichiers à synchroniser sur ton dépôt.
            </p>
          </div>
          <button
            type="button"
            onClick={onDownloadZip}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0 self-start sm:self-auto"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Exporter .zip (secours)</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-2 border-t border-slate-200">
          <div>
            <label htmlFor="repo-slug-input" className="block text-xs font-medium text-slate-600 mb-1">
              Dépôt GitHub (propriétaire/dépôt)
            </label>
            <input
              id="repo-slug-input"
              type="text"
              value={settings.githubRepoSlug}
              onChange={(e) => onUpdateSettings({ githubRepoSlug: e.target.value })}
              placeholder="Connacri/KeepAlive_Supabase_AntiPause"
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          <div>
            <label htmlFor="repo-branch-input" className="block text-xs font-medium text-slate-600 mb-1">
              Branche cible
            </label>
            <input
              id="repo-branch-input"
              type="text"
              value={settings.githubBranch}
              onChange={(e) => onUpdateSettings({ githubBranch: e.target.value })}
              placeholder="main"
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          <div>
            <label htmlFor="cron-preset-select" className="block text-xs font-medium text-slate-600 mb-1">
              Fréquence du ping planifié (cron UTC)
            </label>
            <select
              id="cron-preset-select"
              value={settings.cronPreset}
              onChange={(e) => onUpdateSettings({ cronPreset: e.target.value as CronPreset })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              <option value="every12h">Toutes les 12 heures (0 */12 * * *)</option>
              <option value="daily">Chaque jour à 08:00 UTC (0 8 * * *)</option>
              <option value="twice_weekly">Lundi et jeudi à 09:00 UTC (0 9 * * 1,4)</option>
              <option value="custom">Expression cron personnalisée</option>
            </select>
          </div>

          <div>
            <label htmlFor="custom-cron-input" className="block text-xs font-medium text-slate-600 mb-1">
              Expression cron active
            </label>
            <input
              id="custom-cron-input"
              type="text"
              value={settings.cronPreset === 'custom' ? settings.customCron : cron}
              disabled={settings.cronPreset !== 'custom'}
              onChange={(e) => onUpdateSettings({ customCron: e.target.value })}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg disabled:bg-slate-50 disabled:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-6 pt-1 text-sm text-slate-700">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.autoSetupOnPing}
              onChange={(e) => onUpdateSettings({ autoSetupOnPing: e.target.checked })}
              className="w-4 h-4 accent-emerald-600 rounded"
            />
            <span>Auto-créer la table au ping si absente (nécessite jeton sbp_)</span>
          </label>

          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.urlsInSecrets}
              onChange={(e) => onUpdateSettings({ urlsInSecrets: e.target.checked })}
              className="w-4 h-4 accent-emerald-600 rounded"
            />
            <span>Masquer aussi les URLs Supabase dans les Secrets GitHub</span>
          </label>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden grid grid-cols-1 lg:grid-cols-12">
        <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-slate-200 bg-slate-50/60 p-3">
          <div className="px-2 py-1.5 text-xs font-semibold text-slate-500">
            Arborescence du dépôt ({files.length} fichiers)
          </div>
          <ul className="mt-1 space-y-0.5" role="list">
            {files.map((file) => {
              const isSelected = activeFile?.path === file.path;
              return (
                <li key={file.path}>
                  <button
                    type="button"
                    onClick={() => setSelectedPath(file.path)}
                    aria-current={isSelected ? 'true' : undefined}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-xs font-mono transition-colors ${
                      isSelected
                        ? 'bg-emerald-50 text-emerald-900 font-medium'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <FileText
                      className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-emerald-700' : 'text-slate-400'}`}
                    />
                    <span className="truncate">{file.path}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="lg:col-span-8 flex flex-col min-w-0">
          {activeFile && (
            <>
              <div className="px-4 py-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white">
                <div className="min-w-0">
                  <div className="text-sm font-mono font-semibold text-slate-900 truncate">
                    {activeFile.path}
                  </div>
                  <div className="text-xs text-slate-500 truncate">{activeFile.description}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleCopyFile}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
                  >
                    {copiedPath === activeFile.path ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Copié</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-slate-500" />
                        <span>Copier</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadSingleFile(activeFile.path, activeFile.content)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-500" />
                    <span>Fichier</span>
                  </button>
                </div>
              </div>

              <div className="bg-slate-950 text-slate-100 p-4 overflow-x-auto max-h-[540px] overflow-y-auto">
                <pre className="text-xs font-mono leading-relaxed whitespace-pre">
                  <code>{activeFile.content}</code>
                </pre>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
