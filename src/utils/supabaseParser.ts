import { KeyVariant, ProjectConfig } from '../types';

export const DEFAULT_TABLE = 'keepalive_pings';
export const DEFAULT_KEEP = 5;

const TABLE_RE = /^[A-Za-z0-9_-]{1,63}$/;
const SECRET_NAME_RE = /^[A-Z][A-Z0-9_]{1,63}$/;
const URL_RE = /^https?:\/\/[^/\s]+$/;

export interface ParsedPasteResult {
  url?: string;
  anonKey?: string;
  secretKey?: string;
  accessToken?: string;
  suggestedName?: string;
  detectedVariant?: KeyVariant;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64.padEnd(Math.ceil(b64.length / 4) * 4, '=');
    const json = atob(padded);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function smartParseSupabaseText(raw: string): ParsedPasteResult {
  const result: ParsedPasteResult = {};
  const urlMatch = raw.match(/https?:\/\/[a-z0-9-]+\.supabase\.co/i);
  if (urlMatch) {
    result.url = urlMatch[0];
    const host = urlMatch[0].replace(/^https?:\/\//i, '').split('.')[0];
    if (host) result.suggestedName = host;
  }

  const secretMatch = raw.match(/sb_secret_[A-Za-z0-9_-]+/);
  if (secretMatch) {
    result.secretKey = secretMatch[0];
    result.detectedVariant = 'secret';
  }

  const pubMatch = raw.match(/sb_publishable_[A-Za-z0-9_-]+/);
  if (pubMatch) {
    result.anonKey = pubMatch[0];
    if (!result.detectedVariant) result.detectedVariant = 'anon';
  }

  const tokenMatch = raw.match(/sbp_[A-Za-z0-9_-]+/);
  if (tokenMatch) {
    result.accessToken = tokenMatch[0];
  }

  const jwtMatches = raw.match(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g) || [];
  for (const jwt of jwtMatches) {
    const payload = decodeJwtPayload(jwt);
    if (!payload) continue;
    if (payload.role === 'service_role' && !result.secretKey) {
      result.secretKey = jwt;
      result.detectedVariant = 'secret';
    } else if (payload.role === 'anon' && !result.anonKey) {
      result.anonKey = jwt;
      if (!result.detectedVariant) result.detectedVariant = 'anon';
    }
  }

  return result;
}

export function makeSecretIdentifier(prefix: string, rawName: string): string {
  const slug = rawName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 36);
  return `${prefix}_${slug || 'PROJET'}`;
}

export function normalizeUrl(rawUrl: string): string {
  let url = rawUrl.trim().replace(/\/+$/, '');
  for (const suffix of ['/rest/v1', '/rest']) {
    if (url.endsWith(suffix)) {
      url = url.slice(0, -suffix.length).replace(/\/+$/, '');
    }
  }
  return url;
}

export function validateProjectDraft(
  draft: Partial<ProjectConfig>
): { ok: true; project: Omit<ProjectConfig, 'id'> } | { ok: false; error: string } {
  const url = normalizeUrl(draft.url || '');
  if (!URL_RE.test(url)) {
    return { ok: false, error: 'URL invalide (exemple : https://xxxx.supabase.co).' };
  }

  const hostPart = url.replace(/^https?:\/\//i, '').split('.')[0] || 'projet';
  const name = (draft.name || '').trim().slice(0, 80) || hostPart;
  const account = (draft.account || '').trim().slice(0, 120);
  const table = (draft.table || DEFAULT_TABLE).trim();

  if (!TABLE_RE.test(table)) {
    return { ok: false, error: 'Nom de table invalide (lettres, chiffres, _ et - uniquement, 1 à 63 caractères).' };
  }

  const keepRaw = Number(draft.keep ?? DEFAULT_KEEP);
  if (!Number.isFinite(keepRaw)) {
    return { ok: false, error: '« Lignes à garder » doit être un nombre.' };
  }
  const keep = Math.max(1, Math.min(150, Math.round(keepRaw)));

  const keyType: KeyVariant = draft.keyType === 'secret' ? 'secret' : 'anon';
  const keySecretName = (draft.keySecretName || makeSecretIdentifier('SUPABASE_KEY', name)).trim().toUpperCase();
  if (!SECRET_NAME_RE.test(keySecretName)) {
    return { ok: false, error: 'Nom du secret GitHub pour la clé invalide (ex : SUPABASE_KEY_BLOG).' };
  }

  const urlSecretName = (draft.urlSecretName || makeSecretIdentifier('SUPABASE_URL', name)).trim().toUpperCase();
  if (!SECRET_NAME_RE.test(urlSecretName)) {
    return { ok: false, error: 'Nom du secret GitHub pour l’URL invalide (ex : SUPABASE_URL_BLOG).' };
  }

  const tokenSecretName = (draft.tokenSecretName || '').trim().toUpperCase();
  if (tokenSecretName && !SECRET_NAME_RE.test(tokenSecretName)) {
    return { ok: false, error: 'Nom du secret GitHub pour le jeton d’accès invalide (ex : SUPABASE_ACCESS_TOKEN).' };
  }

  return {
    ok: true,
    project: {
      name,
      account,
      url,
      keyType,
      keySecretName,
      urlSecretName,
      tokenSecretName,
      table,
      keep,
      enabled: draft.enabled ?? true,
      localKeyValue: draft.localKeyValue?.trim() || undefined,
      localTokenValue: draft.localTokenValue?.trim() || undefined,
    },
  };
}

export function buildSql(table: string = DEFAULT_TABLE, variant: KeyVariant = 'anon'): string {
  const cleanTable = TABLE_RE.test(table.trim()) ? table.trim() : DEFAULT_TABLE;
  const quoted = `"${cleanTable}"`;
  const safe = cleanTable.replace(/[^A-Za-z0-9_]/g, '_');
  const isDefault = cleanTable === DEFAULT_TABLE;
  const fn = isDefault ? 'keepalive_cap' : `keepalive_cap_${safe}`;
  const trg = isDefault ? 'keepalive_cap_trg' : `${fn}_trg`;

  const head =
    variant === 'secret'
      ? `-- Variante B : clé secrète (sb_secret_... / service_role). Plus sûr côté Supabase :\n-- RLS activée SANS aucune policy => personne d'autre ne peut écrire dans la table.\n`
      : `-- Variante A : clé publishable / anon (simple). Tout détenteur de la clé anon peut écrire\n-- dans CETTE table seulement (limitée à 200 lignes par le garde-fou).\n`;

  let sql = `${head}create table if not exists public.${quoted} (
  id bigint generated by default as identity primary key,
  label text check (char_length(label) <= 80),
  note text check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- Garde-fou : la table ne dépasse jamais 200 lignes
create or replace function public.${fn}() returns trigger
language plpgsql as $$
begin
  delete from public.${quoted}
  where id in (select id from public.${quoted} order by id desc offset 200);
  return null;
end $$;
drop trigger if exists ${trg} on public.${quoted};
create trigger ${trg} after insert on public.${quoted}
  for each statement execute function public.${fn}();

alter table public.${quoted} enable row level security;
drop policy if exists "keepalive_anon_all" on public.${quoted};
`;

  if (variant !== 'secret') {
    sql += `create policy "keepalive_anon_all" on public.${quoted}
  for all to anon, authenticated using (true) with check (true);
`;
  }

  return `${sql}notify pgrst, 'reload schema';\n`;
}

export function parseImportedConfig(rawJson: string): {
  projects: Omit<ProjectConfig, 'id'>[];
  errors: string[];
} {
  const stripped = rawJson.replace(/^\s*\/\/.*$/gm, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch (e) {
    throw new Error(`JSON invalide : ${e instanceof Error ? e.message : String(e)}`);
  }

  let items: unknown[];
  if (Array.isArray(parsed)) {
    items = parsed;
  } else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { projects?: unknown[] }).projects)) {
    items = (parsed as { projects: unknown[] }).projects;
  } else if (parsed && typeof parsed === 'object') {
    items = [parsed];
  } else {
    throw new Error('Format attendu : tableau JSON de projets ou config.json SupabaseKeepAlive.');
  }

  const projects: Omit<ProjectConfig, 'id'>[] = [];
  const errors: string[] = [];

  for (const item of items) {
    if (!item || typeof item !== 'object') {
      errors.push('Entrée ignorée : objet attendu.');
      continue;
    }
    const rec = item as Record<string, unknown>;
    const rawName = String(rec.name || '').trim();
    const rawUrl = String(rec.supabase_url || rec.url || '').trim();
    const rawAccount = String(rec.account || rec.compte || '').trim();
    const rawTable = String(rec.table_name || rec.table || DEFAULT_TABLE).trim();
    const rawKeep = typeof rec.keep === 'number' ? rec.keep : DEFAULT_KEEP;
    const enabled = rec.enabled !== undefined ? Boolean(rec.enabled) : true;

    const secretKeyVal = typeof rec.secret_key === 'string' && !rec.secret_key.startsWith('dpapi:') ? rec.secret_key : '';
    const anonKeyVal =
      typeof rec.supabase_key === 'string'
        ? rec.supabase_key
        : typeof rec.anon_key === 'string' && !rec.anon_key.startsWith('dpapi:')
          ? rec.anon_key
          : '';

    const keyType: KeyVariant =
      rec.key_type === 'secret' || Boolean(secretKeyVal) || (anonKeyVal.startsWith('sb_secret_'))
        ? 'secret'
        : 'anon';

    const keySecretName =
      typeof rec.key_env === 'string' && rec.key_env.trim()
        ? rec.key_env.trim().toUpperCase()
        : typeof rec.supabase_key_env === 'string' && rec.supabase_key_env.trim()
          ? rec.supabase_key_env.trim().toUpperCase()
          : makeSecretIdentifier('SUPABASE_KEY', rawName || rawUrl);

    const urlSecretName =
      typeof rec.url_env === 'string' && rec.url_env.trim()
        ? rec.url_env.trim().toUpperCase()
        : makeSecretIdentifier('SUPABASE_URL', rawName || rawUrl);

    const tokenSecretName =
      typeof rec.access_token_env === 'string' && rec.access_token_env.trim()
        ? rec.access_token_env.trim().toUpperCase()
        : rawAccount
          ? makeSecretIdentifier('SUPABASE_TOKEN', rawAccount)
          : '';

    const validation = validateProjectDraft({
      name: rawName,
      account: rawAccount,
      url: rawUrl,
      keyType,
      keySecretName,
      urlSecretName,
      tokenSecretName,
      table: rawTable,
      keep: rawKeep,
      enabled,
      localKeyValue: secretKeyVal || anonKeyVal || undefined,
    });

    if (validation.ok) {
      projects.push(validation.project);
    } else {
      errors.push(`${rawName || '?'}: ${validation.error}`);
    }
  }

  return { projects, errors };
}
