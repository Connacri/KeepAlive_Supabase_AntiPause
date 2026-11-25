import { useMemo } from 'react';
import { CalendarClock, Clock, Info } from 'lucide-react';
import { CronPreset, ProjectConfig, RepoSettings } from '../types';
import { computeCronPingStats } from '../utils/cronStats';
import { resolveCronExpression } from '../utils/repoGenerator';

interface PingScheduleDashboardProps {
  projects: ProjectConfig[];
  settings: RepoSettings;
  onUpdateSettings: (patch: Partial<RepoSettings>) => void;
  onNavigateRepo: () => void;
}

function formatMetric(val: number): string {
  return Number.isInteger(val) ? String(val) : val.toFixed(1).replace('.', ',');
}

export function PingScheduleDashboard({
  projects,
  settings,
  onUpdateSettings,
  onNavigateRepo,
}: PingScheduleDashboardProps) {
  const { cron, label: cronLabel } = useMemo(
    () => resolveCronExpression(settings.cronPreset, settings.customCron),
    [settings.cronPreset, settings.customCron]
  );

  const stats = useMemo(() => computeCronPingStats(cron, projects), [cron, projects]);

  const maxDailyPings = useMemo(
    () => Math.max(1, ...stats.weeklyBreakdown.map((d) => d.pings)),
    [stats.weeklyBreakdown]
  );

  const gapRisk = stats.maxGapHours !== null && stats.maxGapHours > 120;

  return (
    <section
      aria-label="Tableau de bord des pings prévus"
      className="bg-white border border-slate-200 rounded-xl overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Prévisions de pings par jour
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Calculé en direct selon le cron{' '}
            <span className="font-mono text-slate-700">{cron}</span> ({cronLabel})
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="dashboard-cron-preset" className="sr-only">
            Fréquence cron
          </label>
          <select
            id="dashboard-cron-preset"
            value={settings.cronPreset}
            onChange={(e) => onUpdateSettings({ cronPreset: e.target.value as CronPreset })}
            className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
          >
            <option value="every12h">Toutes les 12 h (0 */12 * * *)</option>
            <option value="daily">Chaque jour 08:00 UTC (0 8 * * *)</option>
            <option value="twice_weekly">Lundi & jeudi 09:00 UTC (0 9 * * 1,4)</option>
            <option value="custom">Personnalisé ({settings.customCron || '…'})</option>
          </select>

          <button
            type="button"
            onClick={onNavigateRepo}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            Éditer le workflow
          </button>
        </div>
      </div>

      {!stats.isValid ? (
        <div role="alert" className="p-5 text-sm text-red-700 bg-red-50">
          Expression cron invalide (<span className="font-mono">{stats.cron}</span>) : {stats.error}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-200 border-b border-slate-200">
            <div className="p-5">
              <div className="text-xs font-medium text-slate-500">Total pings prévus / jour</div>
              <div className="mt-1.5 flex items-baseline gap-2">
                <span
                  data-testid="pings-per-day-value"
                  className="text-2xl font-semibold text-slate-900 tabular-nums"
                >
                  {formatMetric(stats.pingsPerDay)}
                </span>
                <span className="text-xs text-slate-500">
                  ping(s) / jour en moyenne
                </span>
              </div>
              <div className="mt-1 text-xs text-slate-500 tabular-nums">
                {formatMetric(stats.avgRunsPerDay)} exécution(s)/j × {stats.activeProjects} projet(s) actif(s)
              </div>
            </div>

            <div className="p-5">
              <div className="text-xs font-medium text-slate-500">Volume hebdomadaire estimé</div>
              <div className="mt-1.5 flex items-baseline gap-2">
                <span
                  data-testid="pings-per-week-value"
                  className="text-2xl font-semibold text-slate-900 tabular-nums"
                >
                  {formatMetric(stats.pingsPerWeek)}
                </span>
                <span className="text-xs text-slate-500">pings / semaine</span>
              </div>
              <div className="mt-1 text-xs text-slate-500 tabular-nums">
                ~{stats.estimatedRequestsPerDay} requête(s) PostgREST / jour (INSERT, UPDATE, COUNT, DELETE)
              </div>
            </div>

            <div className="p-5">
              <div className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Prochain déclenchement (UTC)</span>
              </div>
              <div className="mt-1.5 text-sm font-semibold font-mono text-slate-900 tabular-nums">
                {stats.nextRunsUtc[0] || 'Aucun dans les 35 jours'}
              </div>
              <div
                className={`mt-1 text-xs flex items-center gap-1 ${
                  gapRisk ? 'text-amber-700 font-medium' : 'text-slate-500'
                }`}
              >
                {stats.maxGapHours !== null ? (
                  <>
                    <CalendarClock className="w-3.5 h-3.5 shrink-0" />
                    <span className="tabular-nums">
                      Écart max : {formatMetric(stats.maxGapHours)} h
                      {gapRisk ? ' — attention à la pause (7 j)' : ' (marge sûre avant pause 7 j)'}
                    </span>
                  </>
                ) : (
                  <>
                    <Info className="w-3.5 h-3.5 shrink-0" />
                    <span>Fréquence trop espacée pour calculer l’écart</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-slate-600">
                Répartition sur la semaine ({stats.activeProjects} projet(s) actif(s))
              </span>
              {stats.disabledProjects > 0 && (
                <span className="text-xs text-slate-500 tabular-nums">
                  {stats.disabledProjects} projet(s) désactivé(s) exclu(s)
                </span>
              )}
            </div>

            <div className="grid grid-cols-7 gap-2 items-end">
              {stats.weeklyBreakdown.map((day) => {
                const ratio = day.pings > 0 ? Math.max(18, Math.round((day.pings / maxDailyPings) * 100)) : 8;
                const activeDay = day.pings > 0;
                return (
                  <div key={day.shortLabel} className="flex flex-col items-center gap-1.5">
                    <div className="text-xs font-mono tabular-nums text-slate-700 font-medium">
                      {formatMetric(day.pings)}
                    </div>
                    <div className="w-full h-14 bg-slate-100 rounded-md flex items-end overflow-hidden p-1">
                      <div
                        title={`${day.shortLabel} : ${formatMetric(day.pings)} ping(s) (${formatMetric(day.runs)} exécution(s))`}
                        style={{ height: `${ratio}%` }}
                        className={`w-full rounded-xs transition-all ${
                          activeDay ? 'bg-emerald-600' : 'bg-slate-200'
                        }`}
                      />
                    </div>
                    <span className="text-xs text-slate-500 font-medium">{day.shortLabel}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
