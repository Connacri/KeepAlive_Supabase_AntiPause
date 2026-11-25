import test from 'node:test';
import assert from 'node:assert/strict';
import { ProjectConfig } from '../types';
import { computeCronPingStats } from './cronStats';

function makeProject(id: string, enabled: boolean): ProjectConfig {
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
  };
}

test('computeCronPingStats calculates every 12h with active and disabled projects', () => {
  const projects = [makeProject('1', true), makeProject('2', true), makeProject('3', false)];
  const now = new Date('2026-11-25T07:30:00Z');
  const stats = computeCronPingStats('0 */12 * * *', projects, now);

  assert.equal(stats.isValid, true);
  assert.equal(stats.activeProjects, 2);
  assert.equal(stats.disabledProjects, 1);
  assert.equal(stats.runsPerActiveDay, 2);
  assert.equal(stats.avgRunsPerDay, 2);
  assert.equal(stats.pingsPerDay, 4);
  assert.equal(stats.pingsPerWeek, 28);
  assert.equal(stats.maxGapHours, 12);
  assert.deepEqual(stats.nextRunsUtc, [
    '25/11 à 12:00 UTC',
    '26/11 à 00:00 UTC',
    '26/11 à 12:00 UTC',
  ]);
});

test('computeCronPingStats calculates twice weekly (Monday and Thursday)', () => {
  const projects = [makeProject('1', true)];
  const now = new Date('2026-11-25T07:30:00Z'); // Wednesday
  const stats = computeCronPingStats('0 9 * * 1,4', projects, now);

  assert.equal(stats.isValid, true);
  assert.equal(stats.pingsPerWeek, 2);
  assert.equal(stats.pingsPerDay, 0.29);
  const mon = stats.weeklyBreakdown.find((d) => d.shortLabel === 'Lun')!;
  const tue = stats.weeklyBreakdown.find((d) => d.shortLabel === 'Mar')!;
  const thu = stats.weeklyBreakdown.find((d) => d.shortLabel === 'Jeu')!;
  assert.equal(mon.pings, 1);
  assert.equal(tue.pings, 0);
  assert.equal(thu.pings, 1);
  assert.equal(stats.nextRunsUtc[0], '26/11 à 09:00 UTC'); // Thursday
  assert.equal(stats.nextRunsUtc[1], '30/11 à 09:00 UTC'); // Monday
});

test('computeCronPingStats returns invalid state for malformed cron', () => {
  const stats = computeCronPingStats('invalid cron', [makeProject('1', true)]);
  assert.equal(stats.isValid, false);
  assert.ok(stats.error);
  assert.equal(stats.pingsPerDay, 0);
});
