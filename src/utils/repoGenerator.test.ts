import test from 'node:test';
import assert from 'node:assert/strict';
import { ProjectConfig, RepoSettings } from '../types';
import { buildSecretChecklist, generateRepositoryFiles, resolveCronExpression } from './repoGenerator';

const sampleProjects: ProjectConfig[] = [
  {
    id: '1',
    name: 'Blog',
    account: 'perso@example.com',
    url: 'https://blog123.supabase.co',
    keyType: 'secret',
    keySecretName: 'SUPABASE_KEY_BLOG',
    urlSecretName: 'SUPABASE_URL_BLOG',
    tokenSecretName: 'SUPABASE_TOKEN_PERSO',
    table: 'keepalive_pings',
    keep: 5,
    enabled: true,
    localKeyValue: 'sb_secret_NEVER_EXPORT_THIS',
    localTokenValue: 'sbp_NEVER_EXPORT_THIS',
  },
  {
    id: '2',
    name: 'CRM',
    account: 'perso@example.com',
    url: 'https://crm456.supabase.co',
    keyType: 'anon',
    keySecretName: 'SUPABASE_KEY_CRM',
    urlSecretName: 'SUPABASE_URL_CRM',
    tokenSecretName: 'SUPABASE_TOKEN_PERSO',
    table: 'keepalive_pings',
    keep: 5,
    enabled: false,
  },
];

const settings: RepoSettings = {
  repoName: 'supabase-keepalive-actions',
  cronPreset: 'every12h',
  customCron: '0 */12 * * *',
  urlsInSecrets: false,
  autoSetupOnPing: true,
};

test('resolveCronExpression maps presets accurately', () => {
  assert.equal(resolveCronExpression('every12h', '').cron, '0 */12 * * *');
  assert.equal(resolveCronExpression('twice_weekly', '').cron, '0 9 * * 1,4');
  assert.equal(resolveCronExpression('custom', '15 6 * * *').cron, '15 6 * * *');
});

test('buildSecretChecklist deduplicates shared account access tokens', () => {
  const secrets = buildSecretChecklist(sampleProjects, settings);
  const tokens = secrets.filter((s) => s.kind === 'access_token');
  assert.equal(tokens.length, 1);
  assert.deepEqual(tokens[0].projects, ['Blog', 'CRM']);
});

test('generateRepositoryFiles produces complete repo and never leaks raw secrets', () => {
  const files = generateRepositoryFiles(sampleProjects, settings);
  const paths = files.map((f) => f.path);

  assert.ok(paths.includes('.github/workflows/keepalive.yml'));
  assert.ok(paths.includes('.github/workflows/setup-tables.yml'));
  assert.ok(paths.includes('.github/workflows/empty-tables.yml'));
  assert.ok(paths.includes('scripts/keepalive.py'));
  assert.ok(paths.includes('projects.json'));
  assert.ok(paths.includes('sql/sql_cle_anon.sql'));
  assert.ok(paths.includes('sql/sql_cle_secrete.sql'));
  assert.ok(paths.includes('README.md'));
  assert.ok(paths.includes('.gitignore'));

  for (const file of files) {
    assert.ok(!file.content.includes('sb_secret_NEVER_EXPORT_THIS'), `Raw key leaked in ${file.path}`);
    assert.ok(!file.content.includes('sbp_NEVER_EXPORT_THIS'), `Raw token leaked in ${file.path}`);
  }

  const keepaliveYml = files.find((f) => f.path === '.github/workflows/keepalive.yml')!;
  assert.match(keepaliveYml.content, /cron: '0 \*\/12 \* \* \*'/);
  assert.match(keepaliveYml.content, /\$\{\{ secrets\.SUPABASE_KEY_BLOG \}\}/);
  assert.match(keepaliveYml.content, /\$\{\{ secrets\.SUPABASE_TOKEN_PERSO \}\}/);

  const emptyYml = files.find((f) => f.path === '.github/workflows/empty-tables.yml')!;
  assert.match(emptyYml.content, /inputs\.confirm != 'VIDER'/);
  assert.match(emptyYml.content, /--confirm/);
});
