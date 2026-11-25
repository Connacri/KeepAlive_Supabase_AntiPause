import nacl from 'tweetnacl';
import { blake2b } from 'blakejs';
import { GeneratedFile } from '../types';

export interface ParsedRepoSlug {
  owner: string;
  repo: string;
  slug: string;
}

export interface GitHubWorkflowRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  htmlUrl: string;
  createdAt: string;
  event: string;
}

export interface GitHubRepoStatus {
  repoFullName: string;
  privateRepo: boolean;
  defaultBranch: string;
  branchHeadSha: string;
  existingSecretNames: string[];
  recentRuns: GitHubWorkflowRun[];
}

export interface PushFilesResult {
  commitSha: string;
  commitUrl: string;
  filesCount: number;
  branch: string;
}

export interface SyncSecretsResult {
  uploaded: string[];
  skipped: string[];
}

export type FetchLike = typeof fetch;

const GITHUB_API_BASE = 'https://api.github.com';
const EXCLUDED_EXISTING_REPO_FILES = new Set(['.gitignore', 'README.md']);

function encodeUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

/**
 * Accepts `owner/repo` or a GitHub URL like `https://github.com/owner/repo(.git)`
 */
export function parseRepoSlug(raw: string): ParsedRepoSlug | null {
  const cleaned = raw
    .trim()
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/^git@github\.com:/i, '')
    .replace(/\.git$/i, '')
    .replace(/^\/+|\/+$/g, '');

  const parts = cleaned.split('/').filter(Boolean);
  if (parts.length !== 2) return null;

  const [owner, repo] = parts;
  const validPart = /^[A-Za-z0-9._-]+$/;
  if (!validPart.test(owner) || !validPart.test(repo)) return null;

  return { owner, repo, slug: `${owner}/${repo}` };
}

/**
 * When pushing to an already-pushed repository (which already contains its own app,
 * README.md and .gitignore), update only the KeepAlive automation files.
 */
export function selectFilesForExistingRepo(files: GeneratedFile[]): GeneratedFile[] {
  return files.filter((f) => !EXCLUDED_EXISTING_REPO_FILES.has(f.path));
}

/**
 * Encrypts a GitHub Actions secret value using libsodium sealed box (X25519 + XSalsa20-Poly1305)
 * compatible with GitHub's PUT /actions/secrets/{secret_name} endpoint.
 */
export function sealGitHubSecret(secretValue: string, publicKeyBase64: string): string {
  const recipientPublicKey = base64ToBytes(publicKeyBase64.trim());
  if (recipientPublicKey.length !== nacl.box.publicKeyLength) {
    throw new Error('Clé publique GitHub invalide.');
  }

  const messageBytes = encodeUtf8(secretValue);
  const ephemeral = nacl.box.keyPair();

  const nonceInput = new Uint8Array(ephemeral.publicKey.length + recipientPublicKey.length);
  nonceInput.set(ephemeral.publicKey, 0);
  nonceInput.set(recipientPublicKey, ephemeral.publicKey.length);
  const nonce = blake2b(nonceInput, null, nacl.box.nonceLength);

  const cipherText = nacl.box(messageBytes, nonce, recipientPublicKey, ephemeral.secretKey);
  const sealed = new Uint8Array(ephemeral.publicKey.length + cipherText.length);
  sealed.set(ephemeral.publicKey, 0);
  sealed.set(cipherText, ephemeral.publicKey.length);

  return bytesToBase64(sealed);
}

async function githubRequest<T>(
  path: string,
  token: string,
  options: {
    method?: string;
    body?: unknown;
    allowAnonymous?: boolean;
    fetchImpl?: FetchLike;
  } = {}
): Promise<T> {
  const fetchFn = options.fetchImpl ?? fetch;
  const cleanToken = token.trim();
  if (!cleanToken && !options.allowAnonymous) {
    throw new Error('Renseigne ton jeton personnel GitHub (PAT) pour te connecter au dépôt.');
  }

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (cleanToken) {
    headers.Authorization = `Bearer ${cleanToken}`;
  }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetchFn(`${GITHUB_API_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const apiMsg = typeof json?.message === 'string' ? json.message : `HTTP ${res.status}`;
    if (res.status === 401) {
      throw new Error('Jeton GitHub invalide ou expiré (HTTP 401).');
    }
    if (res.status === 403) {
      throw new Error(`Droits GitHub insuffisants pour cette action (${apiMsg}).`);
    }
    if (res.status === 404) {
      throw new Error(`Dépôt, branche ou ressource introuvable sur GitHub (${apiMsg}).`);
    }
    throw new Error(`Erreur API GitHub : ${apiMsg}`);
  }

  return json as T;
}

export async function fetchGitHubRepoStatus(params: {
  repoSlug: string;
  branch: string;
  token: string;
  fetchImpl?: FetchLike;
}): Promise<GitHubRepoStatus> {
  const parsed = parseRepoSlug(params.repoSlug);
  if (!parsed) {
    throw new Error('Format de dépôt invalide (attendu : propriétaire/nom-du-depot).');
  }

  const branch = params.branch.trim() || 'main';
  const fetchFn = params.fetchImpl ?? fetch;

  const repoInfo = await githubRequest<{
    full_name: string;
    private: boolean;
    default_branch: string;
  }>(`/repos/${parsed.owner}/${parsed.repo}`, params.token, { fetchImpl: fetchFn });

  const refInfo = await githubRequest<{
    object: { sha: string };
  }>(`/repos/${parsed.owner}/${parsed.repo}/git/ref/heads/${encodeURIComponent(branch)}`, params.token, {
    fetchImpl: fetchFn,
  });

  let existingSecretNames: string[] = [];
  try {
    const secretsRes = await githubRequest<{
      secrets?: Array<{ name: string }>;
    }>(`/repos/${parsed.owner}/${parsed.repo}/actions/secrets?per_page=100`, params.token, {
      fetchImpl: fetchFn,
    });
    existingSecretNames = (secretsRes.secrets ?? []).map((s) => s.name);
  } catch {
    // Non-bloquant si le jeton n'a pas encore la permission secrets:read
    existingSecretNames = [];
  }

  let recentRuns: GitHubWorkflowRun[] = [];
  try {
    const runsRes = await githubRequest<{
      workflow_runs?: Array<{
        id: number;
        name: string;
        status: string;
        conclusion: string | null;
        html_url: string;
        created_at: string;
        event: string;
      }>;
    }>(`/repos/${parsed.owner}/${parsed.repo}/actions/runs?per_page=5`, params.token, {
      fetchImpl: fetchFn,
    });
    recentRuns = (runsRes.workflow_runs ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      conclusion: r.conclusion,
      htmlUrl: r.html_url,
      createdAt: r.created_at,
      event: r.event,
    }));
  } catch {
    recentRuns = [];
  }

  return {
    repoFullName: repoInfo.full_name,
    privateRepo: Boolean(repoInfo.private),
    defaultBranch: repoInfo.default_branch,
    branchHeadSha: refInfo.object.sha,
    existingSecretNames,
    recentRuns,
  };
}

export async function pushFilesToGitHub(params: {
  repoSlug: string;
  branch: string;
  token: string;
  files: GeneratedFile[];
  commitMessage?: string;
  fetchImpl?: FetchLike;
}): Promise<PushFilesResult> {
  const parsed = parseRepoSlug(params.repoSlug);
  if (!parsed) {
    throw new Error('Format de dépôt invalide (attendu : propriétaire/nom-du-depot).');
  }

  const branch = params.branch.trim() || 'main';
  const fetchFn = params.fetchImpl ?? fetch;
  const targetFiles = selectFilesForExistingRepo(params.files);
  if (targetFiles.length === 0) {
    throw new Error('Aucun fichier KeepAlive à pousser.');
  }

  const refData = await githubRequest<{ object: { sha: string } }>(
    `/repos/${parsed.owner}/${parsed.repo}/git/ref/heads/${encodeURIComponent(branch)}`,
    params.token,
    { fetchImpl: fetchFn }
  );
  const parentCommitSha = refData.object.sha;

  const commitData = await githubRequest<{ tree: { sha: string } }>(
    `/repos/${parsed.owner}/${parsed.repo}/git/commits/${parentCommitSha}`,
    params.token,
    { fetchImpl: fetchFn }
  );
  const baseTreeSha = commitData.tree.sha;

  const treeEntries = [];
  for (const file of targetFiles) {
    const blob = await githubRequest<{ sha: string }>(
      `/repos/${parsed.owner}/${parsed.repo}/git/blobs`,
      params.token,
      {
        method: 'POST',
        body: { content: file.content, encoding: 'utf-8' },
        fetchImpl: fetchFn,
      }
    );
    treeEntries.push({
      path: file.path,
      mode: file.path.endsWith('.py') ? '100755' : '100644',
      type: 'blob',
      sha: blob.sha,
    });
  }

  const newTree = await githubRequest<{ sha: string }>(
    `/repos/${parsed.owner}/${parsed.repo}/git/trees`,
    params.token,
    {
      method: 'POST',
      body: { base_tree: baseTreeSha, tree: treeEntries },
      fetchImpl: fetchFn,
    }
  );

  const newCommit = await githubRequest<{ sha: string; html_url?: string }>(
    `/repos/${parsed.owner}/${parsed.repo}/git/commits`,
    params.token,
    {
      method: 'POST',
      body: {
        message: params.commitMessage || 'Mise à jour automatisation Supabase KeepAlive',
        tree: newTree.sha,
        parents: [parentCommitSha],
      },
      fetchImpl: fetchFn,
    }
  );

  await githubRequest(
    `/repos/${parsed.owner}/${parsed.repo}/git/refs/heads/${encodeURIComponent(branch)}`,
    params.token,
    {
      method: 'PATCH',
      body: { sha: newCommit.sha, force: false },
      fetchImpl: fetchFn,
    }
  );

  return {
    commitSha: newCommit.sha,
    commitUrl:
      newCommit.html_url || `https://github.com/${parsed.slug}/commit/${newCommit.sha}`,
    filesCount: targetFiles.length,
    branch,
  };
}

export async function syncSecretsToGitHub(params: {
  repoSlug: string;
  token: string;
  secrets: Array<{ name: string; value?: string }>;
  fetchImpl?: FetchLike;
}): Promise<SyncSecretsResult> {
  const parsed = parseRepoSlug(params.repoSlug);
  if (!parsed) {
    throw new Error('Format de dépôt invalide (attendu : propriétaire/nom-du-depot).');
  }

  const fetchFn = params.fetchImpl ?? fetch;
  const toUpload = params.secrets.filter((s) => Boolean(s.value && s.value.trim()));
  const skipped = params.secrets.filter((s) => !s.value || !s.value.trim()).map((s) => s.name);

  if (toUpload.length === 0) {
    throw new Error(
      'Aucune valeur de secret renseignée en mémoire. Saisis au moins une valeur dans le tableau ci-dessous.'
    );
  }

  const pubKey = await githubRequest<{ key_id: string; key: string }>(
    `/repos/${parsed.owner}/${parsed.repo}/actions/secrets/public-key`,
    params.token,
    { fetchImpl: fetchFn }
  );

  const uploaded: string[] = [];
  for (const item of toUpload) {
    const encryptedValue = sealGitHubSecret(item.value!.trim(), pubKey.key);
    await githubRequest(
      `/repos/${parsed.owner}/${parsed.repo}/actions/secrets/${encodeURIComponent(item.name)}`,
      params.token,
      {
        method: 'PUT',
        body: {
          encrypted_value: encryptedValue,
          key_id: pubKey.key_id,
        },
        fetchImpl: fetchFn,
      }
    );
    uploaded.push(item.name);
  }

  return { uploaded, skipped };
}

export async function triggerGitHubWorkflow(params: {
  repoSlug: string;
  branch: string;
  token: string;
  workflowFile: 'keepalive.yml' | 'setup-tables.yml' | 'empty-tables.yml' | 'deploy-pages.yml';
  inputs?: Record<string, string>;
  fetchImpl?: FetchLike;
}): Promise<void> {
  const parsed = parseRepoSlug(params.repoSlug);
  if (!parsed) {
    throw new Error('Format de dépôt invalide (attendu : propriétaire/nom-du-depot).');
  }

  await githubRequest(
    `/repos/${parsed.owner}/${parsed.repo}/actions/workflows/${params.workflowFile}/dispatches`,
    params.token,
    {
      method: 'POST',
      body: {
        ref: params.branch.trim() || 'main',
        ...(params.inputs ? { inputs: params.inputs } : {}),
      },
      fetchImpl: params.fetchImpl,
    }
  );
}

export function getGitHubPagesUrl(repoSlug: string): string | null {
  const parsed = parseRepoSlug(repoSlug);
  if (!parsed) return null;
  return `https://${parsed.owner.toLowerCase()}.github.io/${parsed.repo}/`;
}

export interface RepoProjectEntry {
  name: string;
  account: string;
  url: string;
  keyType: 'anon' | 'secret';
  keySecretName: string;
  urlSecretName: string;
  tokenSecretName: string;
  table: string;
  keep: number;
  enabled: boolean;
}

export function parseProjectsJsonFromRepo(rawJson: string): RepoProjectEntry[] {
  const parsed = JSON.parse(rawJson) as { projects?: unknown[] } | unknown[];
  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray(parsed.projects)
      ? parsed.projects
      : null;

  if (!list) {
    throw new Error('Format de projects.json invalide dans le dépôt.');
  }

  return list
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((rec) => {
      const name = String(rec.name || 'projet').trim();
      const slug = name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 36);

      return {
        name,
        account: String(rec.account || '').trim(),
        url: String(rec.url || '').trim(),
        keyType: rec.key_type === 'secret' ? 'secret' : 'anon',
        keySecretName: String(rec.key_env || `SUPABASE_KEY_${slug || 'PROJET'}`).trim().toUpperCase(),
        urlSecretName: String(rec.url_env || `SUPABASE_URL_${slug || 'PROJET'}`).trim().toUpperCase(),
        tokenSecretName: String(rec.access_token_env || '').trim().toUpperCase(),
        table: String(rec.table || 'keepalive_pings').trim(),
        keep: typeof rec.keep === 'number' ? rec.keep : 5,
        enabled: rec.enabled !== undefined ? Boolean(rec.enabled) : true,
      };
    });
}

export async function fetchProjectsFromGitHub(params: {
  repoSlug: string;
  branch: string;
  token: string;
  fetchImpl?: FetchLike;
}): Promise<RepoProjectEntry[]> {
  const parsed = parseRepoSlug(params.repoSlug);
  if (!parsed) {
    throw new Error('Format de dépôt invalide (attendu : propriétaire/nom-du-depot).');
  }

  const branch = params.branch.trim() || 'main';
  const fileRes = await githubRequest<{ content?: string; encoding?: string }>(
    `/repos/${parsed.owner}/${parsed.repo}/contents/projects.json?ref=${encodeURIComponent(branch)}`,
    params.token,
    { allowAnonymous: true, fetchImpl: params.fetchImpl }
  );

  if (!fileRes.content) {
    return [];
  }

  const cleanBase64 = fileRes.content.replace(/\s+/g, '');
  const bytes = base64ToBytes(cleanBase64);
  const text = new TextDecoder().decode(bytes);
  return parseProjectsJsonFromRepo(text);
}
