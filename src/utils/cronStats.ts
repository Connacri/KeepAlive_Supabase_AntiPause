import { ProjectConfig } from '../types';

export interface DailySchedulePoint {
  dayIndex: number; // 0 = Dimanche ... 6 = Samedi (JS Date.getUTCDay())
  shortLabel: string;
  runs: number;
  pings: number;
}

export interface CronPingStats {
  isValid: boolean;
  error?: string;
  cron: string;
  activeProjects: number;
  disabledProjects: number;
  runsPerActiveDay: number;
  avgRunsPerDay: number;
  pingsPerDay: number;
  pingsPerWeek: number;
  estimatedRequestsPerDay: number;
  weeklyBreakdown: DailySchedulePoint[];
  nextRunsUtc: string[];
  maxGapHours: number | null;
}

const ORDERED_WEEKDAYS: { dayIndex: number; shortLabel: string }[] = [
  { dayIndex: 1, shortLabel: 'Lun' },
  { dayIndex: 2, shortLabel: 'Mar' },
  { dayIndex: 3, shortLabel: 'Mer' },
  { dayIndex: 4, shortLabel: 'Jeu' },
  { dayIndex: 5, shortLabel: 'Ven' },
  { dayIndex: 6, shortLabel: 'Sam' },
  { dayIndex: 0, shortLabel: 'Dim' },
];

function parseCronField(
  field: string,
  min: number,
  max: number,
  normalizeSevenToZero = false
): Set<number> | null {
  const result = new Set<number>();
  const parts = field.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  for (const part of parts) {
    const slashSplit = part.split('/');
    if (slashSplit.length > 2) return null;

    const rangeExpr = slashSplit[0];
    const step = slashSplit.length === 2 ? Number(slashSplit[1]) : 1;
    if (!Number.isInteger(step) || step < 1) return null;

    let start = min;
    let end = max;

    if (rangeExpr !== '*') {
      if (rangeExpr.includes('-')) {
        const bounds = rangeExpr.split('-');
        if (bounds.length !== 2) return null;
        start = Number(bounds[0]);
        end = Number(bounds[1]);
      } else {
        start = Number(rangeExpr);
        end = slashSplit.length === 2 ? max : start;
      }
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < min || end > max || start > end) {
        return null;
      }
    }

    for (let val = start; val <= end; val += step) {
      result.add(normalizeSevenToZero && val === 7 ? 0 : val);
    }
  }

  return result;
}

export function formatUtcDateTime(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  const minute = String(date.getUTCMinutes()).padStart(2, '0');
  return `${day}/${month} à ${hour}:${minute} UTC`;
}

export function computeCronPingStats(
  cron: string,
  projects: ProjectConfig[],
  now: Date = new Date()
): CronPingStats {
  const activeProjects = projects.filter((p) => p.enabled).length;
  const disabledProjects = projects.length - activeProjects;

  const emptyWeek: DailySchedulePoint[] = ORDERED_WEEKDAYS.map((d) => ({
    dayIndex: d.dayIndex,
    shortLabel: d.shortLabel,
    runs: 0,
    pings: 0,
  }));

  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) {
    return {
      isValid: false,
      error: 'Une expression cron standard doit contenir exactement 5 champs.',
      cron,
      activeProjects,
      disabledProjects,
      runsPerActiveDay: 0,
      avgRunsPerDay: 0,
      pingsPerDay: 0,
      pingsPerWeek: 0,
      estimatedRequestsPerDay: 0,
      weeklyBreakdown: emptyWeek,
      nextRunsUtc: [],
      maxGapHours: null,
    };
  }

  const minutes = parseCronField(fields[0], 0, 59);
  const hours = parseCronField(fields[1], 0, 23);
  const dom = parseCronField(fields[2], 1, 31);
  const months = parseCronField(fields[3], 1, 12);
  const dow = parseCronField(fields[4], 0, 7, true);

  if (!minutes || !hours || !dom || !months || !dow) {
    return {
      isValid: false,
      error: 'Syntaxe cron invalide (vérifie les bornes ou les pas).',
      cron,
      activeProjects,
      disabledProjects,
      runsPerActiveDay: 0,
      avgRunsPerDay: 0,
      pingsPerWeek: 0,
      pingsPerDay: 0,
      estimatedRequestsPerDay: 0,
      weeklyBreakdown: emptyWeek,
      nextRunsUtc: [],
      maxGapHours: null,
    };
  }

  const domWildcard = fields[2] === '*';
  const dowWildcard = fields[4] === '*';

  const runsPerActiveDay = minutes.size * hours.size;
  const monthFactor = months.size / 12;
  const domFactor = domWildcard ? 1 : dom.size / 30.4375;

  // En cron standard, si DOM et DOW sont tous deux restreints, c'est une union (OU) ;
  // ici on calcule précisément la répartition hebdomadaire sur les jours de la semaine.
  const weeklyBreakdown: DailySchedulePoint[] = ORDERED_WEEKDAYS.map((d) => {
    const matchesDow = dow.has(d.dayIndex);
    let dayRuns = 0;
    if (domWildcard && dowWildcard) {
      dayRuns = runsPerActiveDay * monthFactor;
    } else if (domWildcard) {
      dayRuns = matchesDow ? runsPerActiveDay * monthFactor : 0;
    } else if (dowWildcard) {
      dayRuns = runsPerActiveDay * domFactor * monthFactor;
    } else {
      const unionProb = matchesDow ? 1 : domFactor;
      dayRuns = runsPerActiveDay * unionProb * monthFactor;
    }
    const roundedRuns = Math.round(dayRuns * 100) / 100;
    const roundedPings = Math.round(roundedRuns * activeProjects * 100) / 100;
    return {
      dayIndex: d.dayIndex,
      shortLabel: d.shortLabel,
      runs: roundedRuns,
      pings: roundedPings,
    };
  });

  const runsPerWeek = weeklyBreakdown.reduce((acc, d) => acc + d.runs, 0);
  const avgRunsPerDay = Math.round((runsPerWeek / 7) * 100) / 100;
  const pingsPerWeek = Math.round(runsPerWeek * activeProjects * 100) / 100;
  const pingsPerDay = Math.round(avgRunsPerDay * activeProjects * 100) / 100;
  // Chaque ping effectue INSERT + UPDATE + COUNT (+ DELETE si total > keep) = ~3.5 requêtes PostgREST en moyenne
  const estimatedRequestsPerDay = Math.round(pingsPerDay * 4);

  // Calcul déterministe des 3 prochains déclenchements UTC (scan sur max 35 jours)
  const nextDates: Date[] = [];
  const cursor = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      now.getUTCHours(),
      now.getUTCMinutes() + 1,
      0,
      0
    )
  );
  const sortedMinutes = Array.from(minutes).sort((a, b) => a - b);
  const sortedHours = Array.from(hours).sort((a, b) => a - b);

  const dayCursor = new Date(
    Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate(), 0, 0, 0, 0)
  );

  for (let dayOffset = 0; dayOffset < 35 && nextDates.length < 3; dayOffset++) {
    const checkDate = new Date(dayCursor.getTime() + dayOffset * 86400_000);
    const monthNum = checkDate.getUTCMonth() + 1;
    if (!months.has(monthNum)) continue;

    const dateNum = checkDate.getUTCDate();
    const dowNum = checkDate.getUTCDay();
    const dayMatches =
      domWildcard && dowWildcard
        ? true
        : domWildcard
          ? dow.has(dowNum)
          : dowWildcard
            ? dom.has(dateNum)
            : dom.has(dateNum) || dow.has(dowNum);

    if (!dayMatches) continue;

    for (const h of sortedHours) {
      for (const m of sortedMinutes) {
        const candidate = new Date(
          Date.UTC(checkDate.getUTCFullYear(), checkDate.getUTCMonth(), dateNum, h, m, 0, 0)
        );
        if (candidate.getTime() >= cursor.getTime()) {
          nextDates.push(candidate);
          if (nextDates.length >= 3) break;
        }
      }
      if (nextDates.length >= 3) break;
    }
  }

  let maxGapHours: number | null = null;
  if (nextDates.length >= 2) {
    let maxMs = 0;
    for (let i = 1; i < nextDates.length; i++) {
      maxMs = Math.max(maxMs, nextDates[i].getTime() - nextDates[i - 1].getTime());
    }
    maxGapHours = Math.round((maxMs / 3600_000) * 10) / 10;
  }

  return {
    isValid: true,
    cron,
    activeProjects,
    disabledProjects,
    runsPerActiveDay,
    avgRunsPerDay,
    pingsPerDay,
    pingsPerWeek,
    estimatedRequestsPerDay,
    weeklyBreakdown,
    nextRunsUtc: nextDates.map(formatUtcDateTime),
    maxGapHours,
  };
}
