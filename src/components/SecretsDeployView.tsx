import { useMemo, useState } from 'react';
import { Check, Copy, Terminal } from 'lucide-react';
import { RepoSettings, SecretItem } from '../types';

interface SecretsDeployViewProps {
  secrets: SecretItem[];
  settings: RepoSettings;
}

export function SecretsDeployView({ secrets, settings }: SecretsDeployViewProps) {
  const [checkedNames, setCheckedNames] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const toggleCheck = (name: string) => {
    setCheckedNames((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const ghCliCommands = useMemo(() => {
    if (secrets.length === 0) {
      return '# Ajoute au moins un projet pour générer les commandes gh secret set.';
    }
    return secrets
      .map((s) => {
        const val = s.localValue ? `"${s.localValue}"` : '"COLLER_LA_VALEUR_ICI"';
        return `gh secret set ${s.name} --body ${val}`;
      })
      .join('\n');
  }, [secrets]);

  const gitPushCommands = useMemo(() => {
    const slug = settings.repoName.trim() || 'supabase-keepalive-actions';
    return `# Dans le dossier décompressé (${slug}/) :
git init
git add .
git commit -m "Initialisation Supabase KeepAlive GitHub Actions"
git branch -M main

# Option A : avec GitHub CLI (recommandé)
gh repo create ${slug} --private --source=. --remote=origin --push

# Option B : dépôt déjà créé sur github.com/new
# git remote add origin https://github.com/TON_COMPTE/${slug}.git
# git push -u origin main`;
  }, [settings.repoName]);

  const copyText = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const completedCount = secrets.filter((s) => checkedNames[s.name]).length;

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              1. Secrets à créer dans GitHub Actions
            </h2>
            <p className="text-sm text-slate-500">
              Dépôt GitHub → Settings → Secrets and variables → Actions → New repository secret.
            </p>
          </div>
          <div className="text-xs font-mono tabular-nums text-slate-600">
            {completedCount}/{secrets.length} configuré(s)
          </div>
        </div>

        {secrets.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">
            Aucun secret requis tant qu’aucun projet n’est ajouté.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-500">
                  <th className="py-2.5 px-4 w-10">Fait</th>
                  <th className="py-2.5 px-4">Nom du Secret</th>
                  <th className="py-2.5 px-4">Rôle</th>
                  <th className="py-2.5 px-4">Projets liés</th>
                  <th className="py-2.5 px-4 text-right">Copier le nom</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {secrets.map((secret) => (
                  <tr key={secret.name} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4">
                      <input
                        type="checkbox"
                        checked={Boolean(checkedNames[secret.name])}
                        onChange={() => toggleCheck(secret.name)}
                        aria-label={`Marquer ${secret.name} comme configuré`}
                        className="w-4 h-4 accent-emerald-600 rounded"
                      />
                    </td>
                    <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-900">
                      {secret.name}
                    </td>
                    <td className="py-3 px-4 text-slate-600 text-xs">{secret.hint}</td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      {secret.projects.join(' · ')}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => copyText(`name-${secret.name}`, secret.name)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
                      >
                        {copiedId === `name-${secret.name}` ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Copié</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-slate-500" />
                            <span>Nom</span>
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-slate-500" />
              <h3 className="text-sm font-semibold text-slate-900">
                2. Pousser le dépôt sur GitHub (dépôt privé conseillé)
              </h3>
            </div>
            <button
              type="button"
              onClick={() => copyText('git-push', gitPushCommands)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              {copiedId === 'git-push' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Copié</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                  <span>Copier</span>
                </>
              )}
            </button>
          </div>
          <pre className="p-4 bg-slate-950 text-slate-100 text-xs font-mono leading-relaxed overflow-x-auto flex-1">
            <code>{gitPushCommands}</code>
          </pre>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-slate-500" />
              <h3 className="text-sm font-semibold text-slate-900">
                3. Envoyer les secrets rapidement avec GitHub CLI (gh)
              </h3>
            </div>
            <button
              type="button"
              onClick={() => copyText('gh-secrets', ghCliCommands)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              {copiedId === 'gh-secrets' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Copié</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                  <span>Copier</span>
                </>
              )}
            </button>
          </div>
          <pre className="p-4 bg-slate-950 text-slate-100 text-xs font-mono leading-relaxed overflow-x-auto flex-1">
            <code>{ghCliCommands}</code>
          </pre>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
        <h3 className="text-sm font-semibold text-slate-900">
          Pilotage depuis l’onglet « Actions » sur GitHub
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 text-sm text-slate-600">
          <div>
            <div className="font-medium text-slate-900">Ping planifié (keepalive.yml)</div>
            <p className="mt-1 text-xs leading-relaxed">
              S’exécute automatiquement selon le cron défini, même PC éteint. Peut aussi être lancé à la main sur un seul projet ou tous.
            </p>
          </div>
          <div>
            <div className="font-medium text-slate-900">Créer les tables (setup-tables.yml)</div>
            <p className="mt-1 text-xs leading-relaxed">
              Bouton « Run workflow » dans Actions : crée la table dédiée, le trigger limiteur à 200 lignes et la politique RLS via le jeton sbp_.
            </p>
          </div>
          <div>
            <div className="font-medium text-slate-900">Vider les tables (empty-tables.yml)</div>
            <p className="mt-1 text-xs leading-relaxed">
              Bouton « Run workflow » : demande de saisir exactement <span className="font-mono font-semibold text-slate-800">VIDER</span> pour purger les lignes sans supprimer la table.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
