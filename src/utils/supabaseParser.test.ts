import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSql,
  makeSecretIdentifier,
  normalizeUrl,
  parseImportedConfig,
  smartParseSupabaseText,
  validateProjectDraft,
} from './supabaseParser';

test('smartParseSupabaseText extracts URL, sb_publishable, sb_secret, sbp_ and JWT roles', () => {
  const payloadAnon = Buffer.from(JSON.stringify({ role: 'anon', ref: 'abc' })).toString('base64url');
  const payloadSvc = Buffer.from(JSON.stringify({ role: 'service_role', ref: 'abc' })).toString('base64url');
  const sample = `
    https://demoapp123.supabase.co
    sb_publishable_abc123456789
    sb_secret_xyz987654321
    sbp_token_000111222
    eyJhbGciOiJIUzI1NiJ9.${payloadAnon}.sig
    eyJhbGciOiJIUzI1NiJ9.${payloadSvc}.sig
  `;
  const parsed = smartParseSupabaseText(sample);
  assert.equal(parsed.url, 'https://demoapp123.supabase.co');
  assert.equal(parsed.suggestedName, 'demoapp123');
  assert.equal(parsed.anonKey, 'sb_publishable_abc123456789');
  assert.equal(parsed.secretKey, 'sb_secret_xyz987654321');
  assert.equal(parsed.accessToken, 'sbp_token_000111222');
  assert.equal(parsed.detectedVariant, 'secret');
});

test('normalizeUrl strips trailing /rest/v1 and slashes', () => {
  assert.equal(normalizeUrl('https://abc.supabase.co/rest/v1/'), 'https://abc.supabase.co');
  assert.equal(normalizeUrl('https://abc.supabase.co/rest'), 'https://abc.supabase.co');
});

test('makeSecretIdentifier normalizes accents and symbols', () => {
  assert.equal(makeSecretIdentifier('SUPABASE_KEY', 'Mon Blog Perso!'), 'SUPABASE_KEY_MON_BLOG_PERSO');
});

test('validateProjectDraft rejects invalid URL and invalid table name', () => {
  const badUrl = validateProjectDraft({ url: 'not-a-url', name: 'Test' });
  assert.equal(badUrl.ok, false);

  const badTable = validateProjectDraft({
    url: 'https://abc.supabase.co',
    name: 'Test',
    table: 'bad table!',
  });
  assert.equal(badTable.ok, false);

  const valid = validateProjectDraft({
    url: 'https://abc.supabase.co',
    name: 'Blog',
    keep: 200,
  });
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.project.keep, 150);
    assert.equal(valid.project.keySecretName, 'SUPABASE_KEY_BLOG');
  }
});

test('buildSql differentiates anon policy vs secret RLS without policy and custom table triggers', () => {
  const anonSql = buildSql('keepalive_pings', 'anon');
  assert.match(anonSql, /create policy "keepalive_anon_all"/);
  assert.match(anonSql, /keepalive_cap_trg/);

  const secretSql = buildSql('custom-pings', 'secret');
  assert.doesNotMatch(secretSql, /create policy "keepalive_anon_all"/);
  assert.match(secretSql, /keepalive_cap_custom_pings_trg/);
  assert.match(secretSql, /notify pgrst, 'reload schema';/);
});

test('parseImportedConfig supports travisvn array and // comments without leaking raw secrets', () => {
  const raw = `
    // comment line
    [
      {
        "name": "Portfolio",
        "account": "perso@gmail.com",
        "supabase_url": "https://port123.supabase.co",
        "supabase_key": "sb_secret_test123456",
        "table_name": "keepalive_pings"
      }
    ]
  `;
  const res = parseImportedConfig(raw);
  assert.equal(res.errors.length, 0);
  assert.equal(res.projects.length, 1);
  assert.equal(res.projects[0].keyType, 'secret');
  assert.equal(res.projects[0].keySecretName, 'SUPABASE_KEY_PORTFOLIO');
  assert.equal(res.projects[0].tokenSecretName, 'SUPABASE_TOKEN_PERSO_GMAIL_COM');
});

test('parseImportedConfig preserves secret keyType when Windows config.json has dpapi secret_key', () => {
  const raw = JSON.stringify({
    interval_hours: 72,
    projects: [
      {
        name: 'Appointment',
        url: 'https://vkmgakmujipnpjlawjqm.supabase.co',
        table: 'keepalive_pings',
        keep: 5,
        enabled: true,
        anon_key: 'dpapi:AQAAANCM',
        secret_key: 'dpapi:AQAAANCMSECRET',
        account: 'user@example.com',
      },
    ],
  });
  const res = parseImportedConfig(raw);
  assert.equal(res.errors.length, 0);
  assert.equal(res.projects.length, 1);
  assert.equal(res.projects[0].keyType, 'secret');
  assert.equal(res.projects[0].localKeyValue, undefined);
});
