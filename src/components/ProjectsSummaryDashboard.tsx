import { useEffect, useMemo, useState } from 'react';
import { Activity, Layers, ShieldCheck, Timer } from 'lucide-react';
import { ProjectConfig } from '../types';
import { computeProjectsSummaryStats } from '../utils/projectActivity';

interface ProjectsSummaryDashboardProps {
  projects: ProjectConfig[];
  secretCount: number;
  cronLabel: string;
}

export function ProjectsSummaryDashboard({
  projects,
  secretCount,
  cronLabel,
}: ProjectsSummaryDashboardProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  const hasActiveProjects = useMemo(
    () => projects.some((p) => p.enabled && Boolean(p.activeSince)),
    [projects]
  );

  useEffect(() => {
    setNowMs(Date.now());
    if (!hasActiveProjects) return;
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [hasActiveProjects, projects]);

  const distinctAccounts = useMemo(() => {
    const set = new Set(projects.map((p) => p.account.trim()).filter(Boolean));
    return set.size;
  }, [projects]);

  const stats = useMemo(
    () => computeProjectsSummaryStats(projects, nowMs),
    [projects, nowMs]
  );

  return (
    <section
      aria-label="Statistiques rapides des projets"
      className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
    >
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-500">Nombre total de projets</span>
          <Layers className="w-4 h-4 text-slate-400 shrink-0" />
        </div>
        <div
          data-testid="stat-total-projects"
          className="mt-1.5 text-2xl font-semibold text-slate-900 tabular-nums"
        >
          {stats.totalProjects}
        </div>
        <div className="mt-1 text-xs text-slate-500 tabular-nums">
          {distinctAccounts} compte(s) Supabase
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-500">Projets actifs</span>
          <Activity className="w-4 h-4 text-emerald-600 shrink-0" />
        </div>
        <div className="mt-1.5 flex items-baseline gap-2">
          <span
            data-testid="stat-active-projects"
            className="text-2xl font-semibold text-slate-900 tabular-nums"
          >
            {stats.activeProjects}
          </span>
          <span className="text-xs text-slate-500 tabular-nums">
            / {stats.totalProjects}
          </span>
        </div>
        <div className="mt-1 text-xs text-slate-500 tabular-nums">
          {stats.pausedProjects > 0
            ? `${stats.pausedProjects} projet(s) en pause`
            : stats.totalProjects > 0
              ? 'Tous inclus dans le ping'
              : 'Aucun projet actif'}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-500">Temps total cumulé d’activité</span>
          <Timer className="w-4 h-4 text-emerald-600 shrink-0" />
        </div>
        <div
          data-testid="stat-total-active-time"
          className="mt-1.5 text-2xl font-semibold text-slate-900 tabular-nums"
        >
          {stats.formattedTotalActiveTime}
        </div>
        <div className="mt-1 text-xs text-slate-500">
          {stats.activeProjects > 0
            ? 'Cumul en direct des projets actifs'
            : stats.totalActiveMs > 0
              ? 'Temps conservé (en pause)'
              : 'Démarre dès activation'}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-500">Secrets & Planification</span>
          <ShieldCheck className="w-4 h-4 text-slate-400 shrink-0" />
        </div>
        <div className="mt-1.5 text-2xl font-semibold text-slate-900 tabular-nums">
          {secretCount}{' '}
          <span className="text-sm font-normal text-slate-500">
            secret{secretCount > 1 ? 's' : ''}
          </span>
        </div>
        <div className="mt-1 text-xs text-slate-500 truncate" title={cronLabel}>
          {cronLabel}
        </div>
      </div>
    </section>
  );
}
