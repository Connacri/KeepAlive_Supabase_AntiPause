import { ProjectConfig } from '../types';

export interface ParsedSecretBlockResult {
  matched: Record<string, string>;
  unknownKeys: string[];
  totalParsed: number;
}

export function parseEnvSecretBlock(
  rawText: string,
  validSecretNames?: Set<string>
): ParsedSecretBlockResult {
  const matched: Record<string, string> = {};
  const unknownKeys: string[] = [];
  let totalParsed = 0;

  for (const rawLine of rawText.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const cleanLine = trimmed.startsWith('export ')
      ? trimmed.slice('export '.length).trim()
      : trimmed;

    const eqIndex = cleanLine.indexOf('=');
    if (eqIndex <= 0) continue;

    const key = cleanLine.slice(0, eqIndex).trim().toUpperCase();
    let value = cleanLine.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }

    if (!key || !value) continue;
    totalParsed += 1;

    if (validSecretNames && !validSecretNames.has(key)) {
      unknownKeys.push(key);
      continue;
    }

    matched[key] = value;
  }

  return { matched, unknownKeys, totalParsed };
}

export function buildWindowsDpapiExportCommand(projects: ProjectConfig[]): string {
  const urlMap: Record<string, string> = {};
  for (const p of projects) {
    const cleanUrl = p.url.trim().replace(/\/+$/, '').toLowerCase();
    if (cleanUrl && p.keySecretName) {
      urlMap[cleanUrl] = p.keySecretName;
    }
  }

  const py = [
    'import os,json,base64,ctypes,ctypes.wintypes as wt,re,unicodedata',
    'class B(ctypes.Structure): _fields_=[("c",wt.DWORD),("p",ctypes.POINTER(wt.BYTE))]',
    'def u(s):',
    ' if not s: return ""',
    ' if s.startswith("plain:"): return base64.b64decode(s[6:]).decode("utf-8")',
    ' if not s.startswith("dpapi:"): return s',
    ' raw=base64.b64decode(s[6:]); buf=ctypes.create_string_buffer(raw,len(raw))',
    ' bi=B(len(raw),ctypes.cast(buf,ctypes.POINTER(wt.BYTE))); bo=B()',
    ' if not ctypes.windll.crypt32.CryptUnprotectData(ctypes.byref(bi),None,None,None,None,0,ctypes.byref(bo)): raise ctypes.WinError()',
    ' try: return ctypes.string_at(bo.p,bo.c).decode("utf-8")',
    ' finally: ctypes.windll.kernel32.LocalFree(bo.p)',
    `m=${JSON.stringify(urlMap)}`,
    'p=next((x for x in ("config.json",os.path.join(os.environ.get("APPDATA",""),"SupabaseKeepAlive","config.json")) if os.path.exists(x)),None)',
    'cfg=json.load(open(p,encoding="utf-8"))',
    'for pr in cfg.get("projects",[]):',
    ' url=(pr.get("url") or "").strip().rstrip("/").lower()',
    ' n=re.sub(r"[^A-Z0-9]+","_",unicodedata.normalize("NFD",pr.get("name","")).encode("ascii","ignore").decode().upper()).strip("_")[:36]',
    ' k=m.get(url) or ("SUPABASE_KEY_"+(n or "PROJET"))',
    ' v=(u(pr.get("secret_key","")) or u(pr.get("anon_key",""))).strip()',
    ' if v: print(f"{k}={v}")',
  ].join('; ');

  return `python -c '${py.replace(/'/g, "''")}' | clip`;
}
