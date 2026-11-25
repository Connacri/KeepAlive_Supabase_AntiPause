import test from 'node:test';
import assert from 'node:assert/strict';
import nacl from 'tweetnacl';
import { blake2b } from 'blakejs';
import {
  FetchLike,
  fetchProjectsFromGitHub,
  getGitHubPagesUrl,
  parseProjectsJsonFromRepo,
  parseRepoSlug,
  pushFilesToGitHub,
  sealGitHubSecret,
  selectFilesForExistingRepo,
  syncSecretsToGitHub,
} from './githubSync';
import { GeneratedFile } from '../types';

function unsealForTest(sealedBase64: string, recipientPair: nacl.BoxKeyPair): string {
  const sealed = new Uint8Array(Buffer.from(sealedBase64, 'base64'));
  const epk = sealed.slice(0, nacl.box.publicKeyLength);
  const cipher = sealed.slice(nacl.box.publicKeyLength);

  const nonceInput = new Uint8Array(epk.length + recipientPair.publicKey.length);
  nonceInput.set(epk, 0);
  nonceInput.set(recipientPair.publicKey, epk.length);
  const nonce = blake2b(nonceInput, null, nacl.box.nonceLength);

  const plain = nacl.box.open(cipher, nonce, epk, recipientPair.secretKey);
  assert.ok(plain, 'Failed to decrypt sealed box');
  return new TextDecoder().decode(plain);
}

test('parseRepoSlug accepts owner/repo and full GitHub URLs', () => {
  assert.deepEqual(parseRepoSlug('Connacri/KeepAlive_Supabase_AntiPause'), {
    owner: 'Connacri',
    repo: 'KeepAlive_Supabase_AntiPause',
    slug: 'Connacri/KeepAlive_Supabase_AntiPause',
  });
  assert.deepEqual(parseRepoSlug('https://github.com/Connacri/KeepAlive_Supabase_AntiPause.git'), {
    owner: 'Connacri',
    repo: 'KeepAlive_Supabase_AntiPause',
    slug: 'Connacri/KeepAlive_Supabase_AntiPause',
  });
  assert.equal(parseRepoSlug('just-a-name'), null);
  assert.equal(parseRepoSlug('a/b/c'), null);
});

test('selectFilesForExistingRepo excludes root .gitignore and README.md', () => {
  const sample: GeneratedFile[] = [
    { path: '.github/workflows/keepalive.yml', language: 'yaml', description: '', content: 'name: ping' },
    { path: 'scripts/keepalive.py', language: 'python', description: '', content: 'print(1)' },
    { path: 'projects.json', language: 'json', description: '', content: '{}' },
    { path: 'README.md', language: 'markdown', description: '', content: '# readme' },
    { path: '.gitignore', language: 'text', description: '', content: '.env' },
  ];

  const filtered = selectFilesForExistingRepo(sample);
  assert.deepEqual(
    filtered.map((f) => f.path),
    ['.github/workflows/keepalive.yml', 'scripts/keepalive.py', 'projects.json']
  );
});

test('sealGitHubSecret produces valid libsodium sealed box decryptable by recipient', () => {
  const pair = nacl.box.keyPair();
  const pubBase64 = Buffer.from(pair.publicKey).toString('base64');
  const secret = 'sb_secret_test_value_123456';

  const sealed = sealGitHubSecret(secret, pubBase64);
  const decrypted = unsealForTest(sealed, pair);
  assert.equal(decrypted, secret);
});

test('pushFilesToGitHub commits only automation files via Git Data API', async () => {
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const mockFetch: FetchLike = (async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method, body });

    if (url.endsWith('/git/ref/heads/main') && method === 'GET') {
      return new Response(JSON.stringify({ object: { sha: 'parent-sha' } }), { status: 200 });
    }
    if (url.endsWith('/git/commits/parent-sha')) {
      return new Response(JSON.stringify({ tree: { sha: 'base-tree-sha' } }), { status: 200 });
    }
    if (url.endsWith('/git/blobs')) {
      return new Response(JSON.stringify({ sha: `blob-${calls.length}` }), { status: 201 });
    }
    if (url.endsWith('/git/trees')) {
      return new Response(JSON.stringify({ sha: 'new-tree-sha' }), { status: 201 });
    }
    if (url.endsWith('/git/commits') && method === 'POST') {
      return new Response(
        JSON.stringify({ sha: 'new-commit-sha', html_url: 'https://github.com/Connacri/KeepAlive/commit/new-commit-sha' }),
        { status: 201 }
      );
    }
    if (url.endsWith('/git/refs/heads/main') && method === 'PATCH') {
      return new Response(JSON.stringify({ ref: 'refs/heads/main' }), { status: 200 });
    }
    return new Response(JSON.stringify({ message: 'unexpected' }), { status: 500 });
  }) as FetchLike;

  const result = await pushFilesToGitHub({
    repoSlug: 'Connacri/KeepAlive_Supabase_AntiPause',
    branch: 'main',
    token: 'ghp_testtoken',
    files: [
      { path: '.github/workflows/keepalive.yml', language: 'yaml', description: '', content: 'cron' },
      { path: 'projects.json', language: 'json', description: '', content: '{"projects":[]}' },
      { path: '.gitignore', language: 'text', description: '', content: 'ignored' },
      { path: 'README.md', language: 'markdown', description: '', content: 'ignored' },
    ],
    fetchImpl: mockFetch,
  });

  assert.equal(result.filesCount, 2);
  assert.equal(result.commitSha, 'new-commit-sha');
  const treeCall = calls.find((c) => c.url.endsWith('/git/trees'));
  assert.ok(treeCall);
  const treeBody = treeCall.body as { base_tree: string; tree: Array<{ path: string }> };
  assert.equal(treeBody.base_tree, 'base-tree-sha');
  assert.deepEqual(
    treeBody.tree.map((t) => t.path),
    ['.github/workflows/keepalive.yml', 'projects.json']
  );
});

test('syncSecretsToGitHub encrypts and uploads only secrets with local values', async () => {
  const pair = nacl.box.keyPair();
  const pubBase64 = Buffer.from(pair.publicKey).toString('base64');
  const uploadedPayloads: Record<string, string> = {};

  const mockFetch: FetchLike = (async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url.endsWith('/actions/secrets/public-key')) {
      return new Response(JSON.stringify({ key_id: 'key-42', key: pubBase64 }), { status: 200 });
    }
    if (url.includes('/actions/secrets/') && method === 'PUT') {
      const name = url.split('/').pop()!;
      const body = JSON.parse(String(init?.body)) as { encrypted_value: string; key_id: string };
      assert.equal(body.key_id, 'key-42');
      uploadedPayloads[name] = body.encrypted_value;
      return new Response(null, { status: 204 });
    }
    return new Response(JSON.stringify({ message: 'unexpected' }), { status: 500 });
  }) as FetchLike;

  const res = await syncSecretsToGitHub({
    repoSlug: 'Connacri/KeepAlive_Supabase_AntiPause',
    token: 'ghp_testtoken',
    secrets: [
      { name: 'SUPABASE_KEY_BLOG', value: 'sb_secret_abc' },
      { name: 'SUPABASE_KEY_EMPTY', value: '' },
    ],
    fetchImpl: mockFetch,
  });

  assert.deepEqual(res.uploaded, ['SUPABASE_KEY_BLOG']);
  assert.deepEqual(res.skipped, ['SUPABASE_KEY_EMPTY']);
  assert.equal(unsealForTest(uploadedPayloads.SUPABASE_KEY_BLOG, pair), 'sb_secret_abc');
});

test('getGitHubPagesUrl computes lowercase GitHub Pages URL from repo slug', () => {
  assert.equal(
    getGitHubPagesUrl('Connacri/KeepAlive_Supabase_AntiPause'),
    'https://connacri.github.io/KeepAlive_Supabase_AntiPause/'
  );
  assert.equal(getGitHubPagesUrl('invalid'), null);
});

test('parseProjectsJsonFromRepo & fetchProjectsFromGitHub decode repo projects.json cleanly', async () => {
  const sampleJson = JSON.stringify({
    projects: [
      {
        name: 'Appointment',
        account: 'user@example.com',
        url: 'https://abc123.supabase.co',
        key_env: 'SUPABASE_KEY_APPOINTMENT',
        key_type: 'secret',
        access_token_env: 'SUPABASE_TOKEN_USER',
        table: 'keepalive_pings',
        keep: 5,
        enabled: true,
      },
    ],
  });

  const directParsed = parseProjectsJsonFromRepo(sampleJson);
  assert.equal(directParsed.length, 1);
  assert.equal(directParsed[0].keyType, 'secret');
  assert.equal(directParsed[0].keySecretName, 'SUPABASE_KEY_APPOINTMENT');
  assert.equal(directParsed[0].tokenSecretName, 'SUPABASE_TOKEN_USER');

  const b64 = Buffer.from(sampleJson, 'utf-8').toString('base64');
  const mockFetch: FetchLike = (async () =>
    new Response(JSON.stringify({ content: b64, encoding: 'base64' }), { status: 200 })) as FetchLike;

  const fetched = await fetchProjectsFromGitHub({
    repoSlug: 'Connacri/KeepAlive_Supabase_AntiPause',
    branch: 'main',
    token: 'ghp_test',
    fetchImpl: mockFetch,
  });
  assert.equal(fetched.length, 1);
  assert.equal(fetched[0].name, 'Appointment');
});
