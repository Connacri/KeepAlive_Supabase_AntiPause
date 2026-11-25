import { ProjectConfig } from '../types';

export interface ProjectsSummaryStats {
  totalProjects: number;
  activeProjects: number;
  pausedProjects: number;
  totalActiveMs: number;
  formattedTotalActiveTime: string;
}

export function getProjectActiveMs(project: ProjectConfig, nowMs: number = Date.now()): number {
  const banked =
    typeof project.accumulatedActiveMs === 'number' &&
    Number.isFinite(project.accumulatedActiveMs) &&
    project.accumulatedActiveMs > 0
      ? project.accumulatedActiveMs
      : 0;

  if (!project.enabled || !project.activeSince) {
    return banked;
  }

  const startedAt = Date.parse(project.activeSince);
  if (!Number.isFinite(startedAt)) {
    return banked;
  }

  return banked + Math.max(0, nowMs - startedAt);
}

export function formatActiveDuration(totalMs: number): string {
  const safeMs = Number.isFinite(totalMs) && totalMs > 0 ? totalMs : 0;
  const totalSeconds = Math.floor(safeMs / 1000);

  if (totalSeconds < 60) {
    return `${totalSeconds} s`;
  }

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    if (hours > 0 && minutes > 0) return `${days} j ${hours} h ${minutes} min`;
    if (hours > 0) return `${days} j ${hours} h`;
    return `${days} j`;
  }

  if (hours > 0) {
    return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
  }

  return seconds > 0 ? `${minutes} min ${seconds} s` : `${minutes} min`;
}

export function computeProjectsSummaryStats(
  projects: ProjectConfig[],
  nowMs: number = Date.now()
): ProjectsSummaryStats {
  const totalProjects = projects.length;
  let activeProjects = 0;
  let totalActiveMs = 0;

  for (const project of projects) {
    if (project.enabled) {
      activeProjects += 1;
    }
    totalActiveMs += getProjectActiveMs(project, nowMs);
  }

  return {
    totalProjects,
    activeProjects,
    pausedProjects: totalProjects - activeProjects,
    totalActiveMs,
    formattedTotalActiveTime: formatActiveDuration(totalActiveMs),
  };
}

export function stampInitialActivity(
  projects: ProjectConfig[],
  nowIso: string = new Date().toISOString()
): ProjectConfig[] {
  return projects.map((project) => {
    const accumulatedActiveMs =
      typeof project.accumulatedActiveMs === 'number' &&
      Number.isFinite(project.accumulatedActiveMs) &&
      project.accumulatedActiveMs > 0
        ? project.accumulatedActiveMs
        : 0;

    if (project.enabled) {
      const validSince =
        typeof project.activeSince === 'string' && Number.isFinite(Date.parse(project.activeSince));
      return {
        ...project,
        accumulatedActiveMs,
        activeSince: validSince ? project.activeSince : nowIso,
      };
    }

    return {
      ...project,
      accumulatedActiveMs,
      activeSince: undefined,
    };
  });
}

export function transitionProjectActivity(
  previous: ProjectConfig,
  nextEnabled: boolean,
  nowMs: number = Date.now()
): Pick<ProjectConfig, 'enabled' | 'activeSince' | 'accumulatedActiveMs'> {
  const currentBanked =
    typeof previous.accumulatedActiveMs === 'number' &&
    Number.isFinite(previous.accumulatedActiveMs) &&
    previous.accumulatedActiveMs > 0
      ? previous.accumulatedActiveMs
      : 0;

  if (previous.enabled && !nextEnabled) {
    return {
      enabled: false,
      accumulatedActiveMs: getProjectActiveMs(previous, nowMs),
      activeSince: undefined,
    };
  }

  if (!previous.enabled && nextEnabled) {
    return {
      enabled: true,
      accumulatedActiveMs: currentBanked,
      activeSince: new Date(nowMs).toISOString(),
    };
  }

  if (nextEnabled) {
    const validSince =
      typeof previous.activeSince === 'string' && Number.isFinite(Date.parse(previous.activeSince));
    return {
      enabled: true,
      accumulatedActiveMs: currentBanked,
      activeSince: validSince ? previous.activeSince : new Date(nowMs).toISOString(),
    };
  }

  return {
    enabled: false,
    accumulatedActiveMs: currentBanked,
    activeSince: undefined,
  };
}
