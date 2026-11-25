import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  FolderUp,
  PauseCircle,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { ProjectConfig, RepoSettings } from '../types';
import { PingScheduleDashboard } from './PingScheduleDashboard';

interface ProjectsViewProps {
  projects: ProjectConfig[];
  settings: RepoSettings;
  cronLabel: string;
  secretCount: number;
  onAdd: () => void;
  onEdit: (project: ProjectConfig) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onOpenImport: () => void;
  onNavigateRepo: () => void;
  onUpdateSettings: (patch: Partial<RepoSettings>) => void;
}

type StatusFilter = 'all' | 'active' | 'paused';

export function ProjectsView({
  projects,
  settings,
  cronLabel,
  secretCount,
  onAdd,
  onEdit,
  onToggle,
  onDelete,
  onOpenImport,
  onNavigateRepo,
  onUpdateSettings,
}: ProjectsViewProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');

  const distinctAccounts = useMemo(() => {
    const set = new Set(projects.map((p) => p.account.trim()).filter(Boolean));
    return set.size;
  }, [projects]);

  const activeCount = useMemo(() => projects.filter((p) => p.enabled).length, [projects]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...projects]
      .sort((a, b) => {
        const accA = (a.account || '~').toLowerCase();
        const accB = (b.account || '~').toLowerCase();
        if (accA !== accB) return accA.localeCompare(accB);
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      })
      .filter((p) => {
        if (filter === 'active' && !p.enabled) return false;
        if (filter === 'paused' && p.enabled) return false;
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          p.account.toLowerCase().includes(q) ||
          p.url.toLowerCase().includes(q) ||
          p.table.toLowerCase().includes(q) ||
          p.keySecretName.toLowerCase().includes(q)
        );
      });
  }, [projects, search, filter]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Projets configurés</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">
            {activeCount} <span className="text-sm font-normal text-slate-500">/ {projects.length} actifs</span>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Comptes Supabase</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">
            {distinctAccounts}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Secrets GitHub requis</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">
            {secretCount}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Planification GitHub Actions</div>
          <div className="mt-1 text-sm font-semibold text-slate-900 truncate" title={cronLabel}>
            {cronLabel}
          </div>
        </div>
      </div>

      <PingScheduleDashboard
        projects={projects}
        settings={settings}
        onUpdateSettings={onUpdateSettings}
        onNavigateRepo={onNavigateRepo}
      />

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Rechercher un projet"
                placeholder="Filtrer projet, compte, secret..."
                className="pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg" role="group" aria-label="Filtrer par état">
              {(
                [
                  ['all', 'Tous'],
                  ['active', 'Actifs'],
                  ['paused', 'Désactivés'],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setFilter(val)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    filter === val ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenImport}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <FolderUp className="w-4 h-4 text-slate-500" />
              <span>Importer JSON</span>
            </button>
            <button
              type="button"
              onClick={onAdd}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Ajouter un projet</span>
            </button>
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="px-6 py-12 text-center space-y-3">
            <p className="text-sm font-medium text-slate-900">Aucun projet Supabase configuré</p>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              Ajoute tes projets Supabase pour générer automatiquement les workflows GitHub Actions
              (ping planifié, création de table et vidage) sans exposer tes clés.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={onAdd}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Ajouter votre premier projet</span>
              </button>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate-500">
            Aucun projet ne correspond à votre recherche.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-500">
                  <th className="py-3 px-4">Compte</th>
                  <th className="py-3 px-4">Projet & URL</th>
                  <th className="py-3 px-4">Table & rétention</th>
                  <th className="py-3 px-4">Secrets GitHub</th>
                  <th className="py-3 px-4">État</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {filtered.map((p) => (
                  <tr
                    key={p.id}
                    className={`hover:bg-slate-50/80 transition-colors ${p.enabled ? '' : 'opacity-60'}`}
                  >
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                      {p.account || '—'}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{p.name}</div>
                      <div className="text-xs font-mono text-slate-500 truncate max-w-[260px]" title={p.url}>
                        {p.url}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-mono text-xs text-slate-800">{p.table}</div>
                      <div className="text-xs text-slate-500 tabular-nums">garde {p.keep} ligne(s)</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-xs font-mono text-slate-800">
                        {p.keySecretName}{' '}
                        <span className="text-slate-500 font-sans">
                          ({p.keyType === 'secret' ? 'secrète' : 'anon'})
                        </span>
                      </div>
                      {p.tokenSecretName ? (
                        <div className="text-xs font-mono text-slate-500">
                          {p.tokenSecretName} (auto-table)
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400">SQL manuel</div>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {p.enabled ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span>Actif</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
                          <PauseCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>Désactivé</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onEdit(p)}
                          aria-label={`Modifier ${p.name}`}
                          className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onToggle(p.id)}
                          aria-label={p.enabled ? `Désactiver ${p.name}` : `Activer ${p.name}`}
                          className="px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap"
                        >
                          {p.enabled ? 'Désactiver' : 'Activer'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(p.id)}
                          aria-label={`Supprimer ${p.name}`}
                          className="p-2 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-slate-900">
            Trois workflows inclus dans le dépôt prêt à pousser
          </h3>
          <p className="text-sm text-slate-600">
            Ping planifié (<span className="font-mono text-xs">keepalive.yml</span>), création automatique de table (<span className="font-mono text-xs">setup-tables.yml</span>) et vidage sécurisé (<span className="font-mono text-xs">empty-tables.yml</span>).
          </p>
        </div>
        <button
          type="button"
          onClick={onNavigateRepo}
          className="px-4 py-2 text-sm font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 whitespace-nowrap shrink-0"
        >
          Inspecter les fichiers du dépôt
        </button>
      </div>
    </div>
  );
}
