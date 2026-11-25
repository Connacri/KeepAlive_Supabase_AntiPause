import test from 'node:test';
import assert from 'node:assert/strict';
import { ProjectConfig } from '../types';
import {
  computeProjectsSummaryStats,
  formatActiveDuration,
  getProjectActiveMs,
  stampInitialActivity,
  transitionProjectActivity,
} from './projectActivity';

function makeProject(
  id: string,
  enabled: boolean,
  extra: Partial<ProjectConfig> = {}
): ProjectConfig {
  return {
    id,
    name: `proj-${id}`,
    account: 'acc@example.com',
    url: `https://proj${id}.supabase.co`,
    keyType: 'secret',
    keySecretName: `SUPABASE_KEY_${id}`,
    urlSecretName: `SUPABASE_URL_${id}`,
    tokenSecretName: 'SUPABASE_TOKEN',
    table: 'keepalive_pings',
    keep: 5,
    enabled,
    ...extra,
  };
}

test('formatActiveDuration formats seconds, minutes, hours and days cleanly in French', () => {
  assert.equal(formatActiveDuration(0), '0 s');
  assert.equal(formatActiveDuration(45_000), '45 s');
  assert.equal(formatActiveDuration(125_000), '2 min 5 s');
  assert.equal(formatActiveDuration(7_500_000), '2 h 5 min');
  assert.equal(formatActiveDuration(90_000_000), '1 j 1 h');
});

test('computeProjectsSummaryStats counts total, active, and cumulative active time', () => {
  const nowMs = Date.parse('2026-11-25T12:00:00.000Z');
  const projects = [
    makeProject('1', true, {
      activeSince: '2026-11-25T11:30:00.000Z', // 30 min active
      accumulatedActiveMs: 600_000, // + 10 min banked = 40 min
    }),
    makeProject('2', false, {
      accumulatedActiveMs: 1_200_000, // 20 min banked while previously active
    }),
  ];

  const stats = computeProjectsSummaryStats(projects, nowMs);
  assert.equal(stats.totalProjects, 2);
  assert.equal(stats.activeProjects, 1);
  assert.equal(stats.pausedProjects, 1);
  assert.equal(stats.totalActiveMs, 3_600_000);
  assert.equal(stats.formattedTotalActiveTime, '1 h');
});

test('transitionProjectActivity banks elapsed active time when pausing and resumes cleanly', () => {
  const startMs = Date.parse('2026-11-25T10:00:00.000Z');
  const pauseMs = Date.parse('2026-11-25T10:05:30.000Z');
  const resumeMs = Date.parse('2026-11-25T11:00:00.000Z');
  const finalMs = Date.parse('2026-11-25T11:01:00.000Z');

  const initial = makeProject('1', true, { activeSince: new Date(startMs).toISOString() });
  const pausedPatch = transitionProjectActivity(initial, false, pauseMs);
  const pausedProject = { ...initial, ...pausedPatch };

  assert.equal(pausedProject.enabled, false);
  assert.equal(pausedProject.activeSince, undefined);
  assert.equal(pausedProject.accumulatedActiveMs, 330_000);
  assert.equal(getProjectActiveMs(pausedProject, resumeMs), 330_000);

  const resumedPatch = transitionProjectActivity(pausedProject, true, resumeMs);
  const resumedProject = { ...pausedProject, ...resumedPatch };

  assert.equal(resumedProject.enabled, true);
  assert.equal(resumedProject.activeSince, '2026-11-25T11:00:00.000Z');
  assert.equal(getProjectActiveMs(resumedProject, finalMs), 390_000);
});

test('stampInitialActivity assigns activeSince to active projects without one', () => {
  const nowIso = '2026-11-25T10:00:00.000Z';
  const stamped = stampInitialActivity([makeProject('1', true), makeProject('2', false)], nowIso);

  assert.equal(stamped[0].activeSince, nowIso);
  assert.equal(stamped[0].accumulatedActiveMs, 0);
  assert.equal(stamped[1].activeSince, undefined);
  assert.equal(stamped[1].accumulatedActiveMs, 0);
});
