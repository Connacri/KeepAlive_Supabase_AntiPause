import test from 'node:test';
import assert from 'node:assert/strict';
import { ProjectConfig } from '../types';
import { buildWindowsDpapiExportCommand, parseEnvSecretBlock } from './secretBulkParser';

test('parseEnvSecretBlock parses KEY=VALUE lines, comments, export prefix, and quotes', () => {
  const input = `
# Mon export temporaire
export SUPABASE_KEY_APPOINTMENT="sb_secret_abc123"
supabase_key_cyberscrape='sb_secret_def456'
SUPABASE_TOKEN_PERSO=sbp_xyz789
UNKNOWN_SECRET=ignored_value
EMPTY_SECRET=
`;
  const valid = new Set([
    'SUPABASE_KEY_APPOINTMENT',
    'SUPABASE_KEY_CYBERSCRAPE',
    'SUPABASE_TOKEN_PERSO',
    'EMPTY_SECRET',
  ]);

  const result = parseEnvSecretBlock(input, valid);
  assert.deepEqual(result.matched, {
    SUPABASE_KEY_APPOINTMENT: 'sb_secret_abc123',
    SUPABASE_KEY_CYBERSCRAPE: 'sb_secret_def456',
    SUPABASE_TOKEN_PERSO: 'sbp_xyz789',
  });
  assert.deepEqual(result.unknownKeys, ['UNKNOWN_SECRET']);
  assert.equal(result.totalParsed, 4);
});

test('buildWindowsDpapiExportCommand embeds project URL to secret mapping and pipes to clip', () => {
  const sample: ProjectConfig[] = [
    {
      id: '1',
      name: 'Appointment',
      account: 'acc@example.com',
      url: 'https://vkmgakmujipnpjlawjqm.supabase.co/',
      keyType: 'secret',
      keySecretName: 'SUPABASE_KEY_APPOINTMENT',
      urlSecretName: 'SUPABASE_URL_APPOINTMENT',
      tokenSecretName: '',
      table: 'keepalive_pings',
      keep: 5,
      enabled: true,
    },
  ];

  const cmd = buildWindowsDpapiExportCommand(sample);
  assert.ok(cmd.includes('CryptUnprotectData'));
  assert.ok(cmd.includes('https://vkmgakmujipnpjlawjqm.supabase.co'));
  assert.ok(cmd.includes('SUPABASE_KEY_APPOINTMENT'));
  assert.ok(cmd.endsWith('| clip'));
});
