import { useMemo, useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { KeyVariant, ProjectConfig } from '../types';
import { buildSql, DEFAULT_TABLE } from '../utils/supabaseParser';

interface SqlReferenceViewProps {
  projects: ProjectConfig[];
}

function getSqlEditorUrl(projectUrl: string): string | null {
  try {
    const host = new URL(projectUrl).hostname;
    if (host.endsWith('.supabase.co')) {
      const ref = host.split('.')[0];
      return `https://supabase.com/dashboard/project/${ref}/sql/new`;
    }
  } catch {
    return null;
  }
  return null;
}

export function SqlReferenceView({ projects }: SqlReferenceViewProps) {
  const [tableName, setTableName] = useState(DEFAULT_TABLE);
  const [variant, setVariant] = useState<KeyVariant>('secret');
  const [copied, setCopied] = useState(false);

  const sql = useMemo(() => buildSql(tableName, variant), [tableName, variant]);

  const uniqueTables = useMemo(() => {
    const set = new Set<string>([DEFAULT_TABLE]);
    for (const p of projects) {
      if (p.table) set.add(p.table);
    }
    return Array.from(set);
  }, [projects]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Générateur SQL manuel (si aucun jeton sbp_ n’est utilisé)
            </h2>
            <p className="text-sm text-slate-500">
              À coller une seule fois dans Supabase → SQL Editor si tu préfères créer la table manuellement.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label htmlFor="sql-table-input" className="sr-only">
                Nom de la table
              </label>
              <input
                id="sql-table-input"
                type="text"
                list="sql-tables-list"
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                placeholder="keepalive_pings"
                className="px-3 py-1.5 text-sm font-mono border border-slate-300 rounded-lg w-48 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
              <datalist id="sql-tables-list">
                {uniqueTables.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setVariant('secret')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  variant === 'secret' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Variante B : Clé secrète
              </button>
              <button
                type="button"
                onClick={() => setVariant('anon')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  variant === 'anon' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Variante A : Clé anon
              </button>
            </div>

            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 whitespace-nowrap shrink-0"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>SQL copié</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copier le SQL</span>
                </>
              )}
            </button>
          </div>
        </div>

        <pre className="p-4 bg-slate-950 text-slate-100 text-xs font-mono leading-relaxed overflow-x-auto">
          <code>{sql}</code>
        </pre>

        {projects.length > 0 && (
          <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-500 font-medium">Ouvrir SQL Editor :</span>
            {projects.map((p) => {
              const editorUrl = getSqlEditorUrl(p.url);
              if (!editorUrl) return null;
              return (
                <a
                  key={p.id}
                  href={editorUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-slate-700 bg-white border border-slate-300 rounded-md hover:border-emerald-500 hover:text-emerald-800 transition-colors"
                >
                  <span>{p.name}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
          <h3 className="text-sm font-semibold text-slate-900">01. Cycle de Ping</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Exécute 4 appels PostgREST réels : <span className="font-mono">POST</span> (INSERT), <span className="font-mono">PATCH</span> (UPDATE), <span className="font-mono">GET</span> (<span className="font-mono">Prefer: count=exact</span>), puis <span className="font-mono">DELETE</span> des plus anciennes lignes au-delà de <span className="font-mono">keep</span>.
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
          <h3 className="text-sm font-semibold text-slate-900">02. Création de table</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Appelle <span className="font-mono">POST /v1/projects/&#123;ref&#125;/database/query</span> avec le jeton <span className="font-mono">sbp_</span> pour créer la table, le trigger limiteur à 200 lignes, la RLS et recharger PostgREST.
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
          <h3 className="text-sm font-semibold text-slate-900">03. Vidage sécurisé</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Compte les lignes existantes puis exécute <span className="font-mono">DELETE ?id=not.is.null</span> sur la table dédiée uniquement. Le workflow exige le mot-clé <span className="font-mono font-semibold">VIDER</span>.
          </p>
        </div>
      </div>
    </div>
  );
}
