import { Database, FolderGit2, KeyRound, FileCode2 } from 'lucide-react';

export type NavSection = 'projects' | 'repo' | 'secrets' | 'sql';

interface SidebarProps {
  active: NavSection;
  onChange: (section: NavSection) => void;
  activeCount: number;
  totalCount: number;
  cronLabel: string;
}

const NAV_ITEMS: { id: NavSection; label: string; icon: typeof Database }[] = [
  { id: 'projects', label: 'Projets Supabase', icon: Database },
  { id: 'secrets', label: 'Sync GitHub & Secrets', icon: KeyRound },
  { id: 'repo', label: 'Fichiers du dépôt', icon: FolderGit2 },
  { id: 'sql', label: 'SQL & Opérations', icon: FileCode2 },
];

export function Sidebar({ active, onChange, activeCount, totalCount, cronLabel }: SidebarProps) {
  return (
    <>
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 border-r border-slate-200 bg-white min-h-screen">
        <div className="px-6 py-5 border-b border-slate-200">
          <div className="text-base font-bold tracking-tight text-slate-900">
            Supabase KeepAlive
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Automatisation GitHub Actions
          </p>
        </div>

        <nav aria-label="Navigation principale" className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onChange(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left whitespace-nowrap ${
                  isActive
                    ? 'bg-emerald-50 text-emerald-900'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-emerald-700' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="px-6 py-4 border-t border-slate-200 text-xs text-slate-500 space-y-1.5">
          <div className="flex items-center justify-between">
            <span>Projets actifs</span>
            <span className="font-mono tabular-nums font-medium text-slate-700">
              {activeCount}/{totalCount}
            </span>
          </div>
          <div className="text-slate-500 truncate" title={cronLabel}>
            {cronLabel}
          </div>
        </div>
      </aside>

      <nav
        aria-label="Navigation mobile"
        className="lg:hidden flex items-center gap-1 overflow-x-auto px-4 py-2 border-b border-slate-200 bg-white"
      >
        {NAV_ITEMS.map((item) => {
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                isActive
                  ? 'bg-emerald-50 text-emerald-900'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </>
  );
}
