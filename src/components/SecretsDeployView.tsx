import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  GitBranch,
  Globe,
  Play,
  RefreshCw,
  ShieldCheck,
  Terminal,
  UploadCloud,
} from 'lucide-react';
import { GeneratedFile, ProjectConfig, RepoSettings, SecretItem } from '../types';
import {
  fetchGitHubRepoStatus,
  fetchProjectsFromGitHub,
  getGitHubPagesUrl,
  GitHubRepoStatus,
  parseRepoSlug,
  PushFilesResult,
  pushFilesToGitHub,
  selectFilesForExistingRepo,
  syncSecretsToGitHub,
  triggerGitHubWorkflow,
} from '../utils/githubSync';

interface SecretsDeployViewProps {
  secrets: SecretItem[];
  settings: RepoSettings;
  files: GeneratedFile[];
  githubToken: string;
  onChangeGithubToken: (token: string) => void;
  inlineSecretValues: Record<string, string>;
  onChangeInlineSecretValue: (name: string, value: string) => void;
  onUpdateSettings: (patch: Partial<RepoSettings>) => void;
  onLoadProjectsFromRepo: (projects: Omit<ProjectConfig, 'id'>[]) => void;
  onShowToast: (msg: string) => void;
}

export function SecretsDeployView({
  secrets,
  settings,
  files,
  githubToken,
  onChangeGithubToken,
  inlineSecretValues,
  onChangeInlineSecretValue,
  onUpdateSettings,
  onLoadProjectsFromRepo,
  onShowToast,
}: SecretsDeployViewProps) {
  const [checkedNames, setCheckedNames] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);

  const [checkingRepo, setCheckingRepo] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [pushingFiles, setPushingFiles] = useState(false);
  const [syncingSecrets, setSyncingSecrets] = useState(false);
  const [dispatchingWorkflow, setDispatchingWorkflow] = useState<string | null>(null);

  const [repoStatus, setRepoStatus] = useState<GitHubRepoStatus | null>(null);
  const [lastPush, setLastPush] = useState<PushFilesResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncSuccess, setSyncSuccess] = useState<string | null>(null);

  const parsedSlug = useMemo(() => parseRepoSlug(settings.githubRepoSlug), [settings.githubRepoSlug]);
  const pagesUrl = useMemo(() => getGitHubPagesUrl(settings.githubRepoSlug), [settings.githubRepoSlug]);
  const filesToPush = useMemo(() => selectFilesForExistingRepo(files), [files]);

  const effectiveSecretValues = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of secrets) {
      const override = inlineSecretValues[s.name];
      map[s.name] = override !== undefined ? override : s.localValue || '';
    }
    return map;
  }, [secrets, inlineSecretValues]);

  const readySecretCount = useMemo(
    () => secrets.filter((s) => Boolean(effectiveSecretValues[s.name]?.trim())).length,
    [secrets, effectiveSecretValues]
  );

  const toggleCheck = (name: string) => {
    setCheckedNames((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const ghCliCommands = useMemo(() => {
    const repoFlag = parsedSlug ? ` --repo ${parsedSlug.slug}` : '';
    if (secrets.length === 0) {
      return '# Ajoute au moins un projet pour générer les commandes gh secret set.';
    }
    return secrets
      .map((s) => {
        const raw = effectiveSecretValues[s.name]?.trim();
        const val = raw ? `"${raw}"` : '"COLLER_LA_VALEUR_ICI"';
        return `gh secret set ${s.name}${repoFlag} --body ${val}`;
      })
      .join('\n');
  }, [secrets, effectiveSecretValues, parsedSlug]);

  const existingRepoCliCommands = useMemo(() => {
    const slug = parsedSlug?.slug || settings.githubRepoSlug || 'TON_COMPTE/KeepAlive_Supabase_AntiPause';
    const branch = settings.githubBranch.trim() || 'main';
    return `# Ton dépôt est déjà poussé sur GitHub (${slug}) :
# 1. Mets à jour ta copie locale puis pousse uniquement les fichiers d'automatisation :
git pull origin ${branch}
git add .github/workflows scripts/keepalive.py projects.json sql
git commit -m "Mise à jour automatisation Supabase KeepAlive"
git push origin ${branch}

# 2. Ou déclenche directement un ping depuis le terminal :
gh workflow run keepalive.yml --repo ${slug}`;
  }, [parsedSlug, settings.githubRepoSlug, settings.githubBranch]);

  const copyText = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleCheckRepo = async () => {
    setSyncError(null);
    setSyncSuccess(null);
    setCheckingRepo(true);
    try {
      const status = await fetchGitHubRepoStatus({
        repoSlug: settings.githubRepoSlug,
        branch: settings.githubBranch,
        token: githubToken,
      });
      setRepoStatus(status);
      setSyncSuccess(
        `Connecté à ${status.repoFullName} (${status.existingSecretNames.length} secret(s) détecté(s)).`
      );
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Impossible de vérifier le dépôt GitHub.');
    } finally {
      setCheckingRepo(false);
    }
  };

  const handleLoadProjectsFromRepo = async () => {
    setSyncError(null);
    setSyncSuccess(null);
    setLoadingProjects(true);
    try {
      const entries = await fetchProjectsFromGitHub({
        repoSlug: settings.githubRepoSlug,
        branch: settings.githubBranch,
        token: githubToken,
      });
      if (entries.length === 0) {
        setSyncSuccess('Le fichier projects.json du dépôt ne contient aucun projet pour le moment.');
      } else {
        onLoadProjectsFromRepo(entries);
        setSyncSuccess(`${entries.length} projet(s) chargé(s) depuis projects.json sur GitHub.`);
      }
    } catch (err) {
      setSyncError(
        err instanceof Error ? err.message : 'Impossible de charger projects.json depuis GitHub.'
      );
    } finally {
      setLoadingProjects(false);
    }
  };

  const handlePushFiles = async () => {
    setSyncError(null);
    setSyncSuccess(null);
    setPushingFiles(true);
    try {
      const res = await pushFilesToGitHub({
        repoSlug: settings.githubRepoSlug,
        branch: settings.githubBranch,
        token: githubToken,
        files,
      });
      setLastPush(res);
      setSyncSuccess(
        `${res.filesCount} fichiers poussés directement sur ${settings.githubRepoSlug} (${res.branch}).`
      );
      onShowToast(`Fichiers poussés sur GitHub (commit ${res.commitSha.slice(0, 7)}).`);
      try {
        const status = await fetchGitHubRepoStatus({
          repoSlug: settings.githubRepoSlug,
          branch: settings.githubBranch,
          token: githubToken,
        });
        setRepoStatus(status);
      } catch {
        // non-blocking refresh
      }
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Échec du push vers GitHub.');
    } finally {
      setPushingFiles(false);
    }
  };

  const handleSyncSecrets = async () => {
    setSyncError(null);
    setSyncSuccess(null);
    setSyncingSecrets(true);
    try {
      const payload = secrets.map((s) => ({
        name: s.name,
        value: effectiveSecretValues[s.name],
      }));
      const res = await syncSecretsToGitHub({
        repoSlug: settings.githubRepoSlug,
        token: githubToken,
        secrets: payload,
      });
      const msg =
        res.skipped.length > 0
          ? `${res.uploaded.length} secret(s) envoyé(s) sur GitHub (${res.skipped.length} laissé(s) vide(s)).`
          : `${res.uploaded.length} secret(s) chiffré(s) et envoyé(s) sur GitHub.`;
      setSyncSuccess(msg);
      onShowToast(msg);
      const status = await fetchGitHubRepoStatus({
        repoSlug: settings.githubRepoSlug,
        branch: settings.githubBranch,
        token: githubToken,
      });
      setRepoStatus(status);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Impossible d’envoyer les secrets.');
    } finally {
      setSyncingSecrets(false);
    }
  };

  const handleTriggerWorkflow = async (
    workflowFile: 'keepalive.yml' | 'setup-tables.yml',
    label: string
  ) => {
    setSyncError(null);
    setSyncSuccess(null);
    setDispatchingWorkflow(workflowFile);
    try {
      await triggerGitHubWorkflow({
        repoSlug: settings.githubRepoSlug,
        branch: settings.githubBranch,
        token: githubToken,
        workflowFile,
      });
      setSyncSuccess(`Workflow « ${label} » déclenché sur GitHub Actions.`);
      onShowToast(`Workflow ${workflowFile} lancé.`);
      setTimeout(async () => {
        try {
          const status = await fetchGitHubRepoStatus({
            repoSlug: settings.githubRepoSlug,
            branch: settings.githubBranch,
            token: githubToken,
          });
          setRepoStatus(status);
        } catch {
          // ignore delayed refresh errors
        }
      }, 1500);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Échec du déclenchement du workflow.');
    } finally {
      setDispatchingWorkflow(null);
    }
  };

  const existingSecretsSet = useMemo(
    () => new Set(repoStatus?.existingSecretNames ?? []),
    [repoStatus]
  );

  const completedCount = secrets.filter(
    (s) => checkedNames[s.name] || existingSecretsSet.has(s.name)
  ).length;

  const repoActionsUrl = parsedSlug
    ? `https://github.com/${parsedSlug.slug}/actions`
    : 'https://github.com';
  const repoSecretsUrl = parsedSlug
    ? `https://github.com/${parsedSlug.slug}/settings/secrets/actions`
    : 'https://github.com';
  const repoPagesSettingsUrl = parsedSlug
    ? `https://github.com/${parsedSlug.slug}/settings/pages`
    : 'https://github.com';

  return (
    <div className="space-y-6">
      <section
        aria-label="Publication de la page web sur GitHub Pages"
        className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
      >
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-emerald-600 shrink-0" />
            <h2 className="text-sm font-semibold text-slate-900">
              Page web publiée (GitHub Pages)
            </h2>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Le workflow <span className="font-mono text-slate-800">.github/workflows/deploy-pages.yml</span> publie automatiquement cette interface sur GitHub Pages à chaque push. Active une seule fois <span className="font-medium text-slate-800">Settings → Pages → Source : GitHub Actions</span> pour gérer tes projets directement depuis l’URL publiée.
          </p>
          {pagesUrl && (
            <div className="text-xs font-mono text-emerald-800 pt-0.5 break-all">
              {pagesUrl}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {parsedSlug && (
            <a
              href={repoPagesSettingsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
            >
              <span>Réglages Pages</span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
            </a>
          )}
          {pagesUrl && (
            <a
              href={pagesUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 whitespace-nowrap"
            >
              <span>Ouvrir la page publiée</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </section>

      <section
        aria-label="Synchronisation directe vers le dépôt déjà poussé"
        className="bg-white border border-slate-200 rounded-xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              1. Pousser directement vers ton dépôt GitHub existant
            </h2>
            <p className="text-sm text-slate-500">
              Aucun fichier à télécharger : met à jour uniquement{' '}
              <span className="font-mono text-xs text-slate-700">.github/workflows/</span>,{' '}
              <span className="font-mono text-xs text-slate-700">scripts/keepalive.py</span>,{' '}
              <span className="font-mono text-xs text-slate-700">projects.json</span> et{' '}
              <span className="font-mono text-xs text-slate-700">sql/</span> sans écraser ton{' '}
              <span className="font-mono text-xs text-slate-700">README.md</span> ni ton{' '}
              <span className="font-mono text-xs text-slate-700">.gitignore</span>.
            </p>
          </div>
          {parsedSlug && (
            <a
              href={repoActionsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0 self-start sm:self-auto"
            >
              <span>Ouvrir Actions</span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
            </a>
          )}
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-5">
              <label htmlFor="sync-repo-slug" className="block text-xs font-medium text-slate-700 mb-1">
                Dépôt déjà poussé (propriétaire/dépôt)
              </label>
              <input
                id="sync-repo-slug"
                type="text"
                value={settings.githubRepoSlug}
                onChange={(e) => onUpdateSettings({ githubRepoSlug: e.target.value })}
                placeholder="Connacri/KeepAlive_Supabase_AntiPause"
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div className="md:col-span-2">
              <label htmlFor="sync-repo-branch" className="block text-xs font-medium text-slate-700 mb-1">
                Branche
              </label>
              <div className="relative">
                <GitBranch className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="sync-repo-branch"
                  type="text"
                  value={settings.githubBranch}
                  onChange={(e) => onUpdateSettings({ githubBranch: e.target.value })}
                  placeholder="main"
                  className="w-full pl-8 pr-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            </div>

            <div className="md:col-span-5">
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="sync-github-pat" className="block text-xs font-medium text-slate-700">
                  Jeton personnel GitHub (PAT, en mémoire uniquement)
                </label>
                <a
                  href="https://github.com/settings/personal-access-tokens/new"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-emerald-700 hover:underline inline-flex items-center gap-1"
                >
                  <span>Créer un jeton</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div className="relative">
                <input
                  id="sync-github-pat"
                  type={showToken ? 'text' : 'password'}
                  autoComplete="off"
                  value={githubToken}
                  onChange={(e) => onChangeGithubToken(e.target.value)}
                  placeholder="github_pat_... ou ghp_..."
                  className="w-full pl-3 pr-10 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((prev) => !prev)}
                  aria-label={showToken ? 'Masquer le jeton GitHub' : 'Afficher le jeton GitHub'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700 rounded-md"
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <p className="text-xs text-slate-500 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                Droits requis : <span className="font-mono">Contents (Read/Write)</span>,{' '}
                <span className="font-mono">Secrets (Read/Write)</span> et{' '}
                <span className="font-mono">Actions (Read/Write)</span>. Jamais sauvegardé dans{' '}
                <span className="font-mono">localStorage</span>.
              </span>
            </p>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleLoadProjectsFromRepo}
                disabled={loadingProjects || !parsedSlug}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
              >
                <RefreshCw className={`w-4 h-4 ${loadingProjects ? 'animate-spin' : ''}`} />
                <span>{loadingProjects ? 'Chargement...' : 'Charger projects.json'}</span>
              </button>

              <button
                type="button"
                onClick={handleCheckRepo}
                disabled={checkingRepo || !parsedSlug}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
              >
                <RefreshCw className={`w-4 h-4 ${checkingRepo ? 'animate-spin' : ''}`} />
                <span>{checkingRepo ? 'Vérification...' : 'Vérifier le dépôt'}</span>
              </button>

              <button
                type="button"
                onClick={handlePushFiles}
                disabled={pushingFiles || !parsedSlug}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap"
              >
                <UploadCloud className="w-4 h-4" />
                <span>
                  {pushingFiles
                    ? 'Envoi en cours...'
                    : `Pousser les ${filesToPush.length} fichiers sur GitHub`}
                </span>
              </button>
            </div>
          </div>

          {syncError && (
            <div
              role="alert"
              className="p-3 text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">{syncError}</span>
            </div>
          )}

          {syncSuccess && (
            <div
              role="status"
              className="p-3 text-sm text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg flex flex-wrap items-center justify-between gap-2"
            >
              <div className="min-w-0 flex-1 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span className="min-w-0 break-words [overflow-wrap:anywhere]">{syncSuccess}</span>
              </div>
              {lastPush && (
                <a
                  href={lastPush.commitUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-mono font-medium text-emerald-800 underline shrink-0"
                >
                  <span>Commit {lastPush.commitSha.slice(0, 7)}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          )}

          {repoStatus && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-slate-700 min-w-0 break-words [overflow-wrap:anywhere]">
                  Dépôt vérifié :{' '}
                  <span className="font-mono font-semibold text-slate-900">
                    {repoStatus.repoFullName}
                  </span>{' '}
                  · {repoStatus.privateRepo ? 'Privé' : 'Public'} · branche{' '}
                  <span className="font-mono">{settings.githubBranch || repoStatus.defaultBranch}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleTriggerWorkflow('setup-tables.yml', 'Créer les tables')}
                    disabled={dispatchingWorkflow !== null}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-50 whitespace-nowrap"
                  >
                    <Play className="w-3.5 h-3.5 text-slate-500" />
                    <span>
                      {dispatchingWorkflow === 'setup-tables.yml'
                        ? 'Lancement...'
                        : 'Créer les tables'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTriggerWorkflow('keepalive.yml', 'Ping maintenant')}
                    disabled={dispatchingWorkflow !== null}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-900 bg-emerald-100 border border-emerald-200 rounded-lg hover:bg-emerald-200/70 disabled:opacity-50 whitespace-nowrap"
                  >
                    <Play className="w-3.5 h-3.5 text-emerald-700" />
                    <span>
                      {dispatchingWorkflow === 'keepalive.yml'
                        ? 'Lancement...'
                        : 'Lancer un ping maintenant'}
                    </span>
                  </button>
                </div>
              </div>

              {repoStatus.recentRuns.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-slate-200">
                  <div className="text-xs font-medium text-slate-600">
                    Dernières exécutions GitHub Actions
                  </div>
                  <ul className="divide-y divide-slate-200 bg-white border border-slate-200 rounded-lg">
                    {repoStatus.recentRuns.map((run) => (
                      <li
                        key={run.id}
                        className="px-3 py-2 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0 flex items-center gap-2">
                          <span
                            className={`font-medium ${
                              run.conclusion === 'success'
                                ? 'text-emerald-700'
                                : run.conclusion === 'failure'
                                  ? 'text-red-700'
                                  : 'text-amber-700'
                            }`}
                          >
                            {run.conclusion || run.status}
                          </span>
                          <span className="font-medium text-slate-900 truncate">{run.name}</span>
                          <span className="text-slate-400 font-mono hidden sm:inline">
                            ({run.event})
                          </span>
                        </div>
                        <a
                          href={run.htmlUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 whitespace-nowrap shrink-0"
                        >
                          <span>Logs</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <section
        aria-label="Secrets GitHub Actions"
        className="bg-white border border-slate-200 rounded-xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              2. Secrets GitHub Actions ({completedCount}/{secrets.length} configurés)
            </h2>
            <p className="text-sm text-slate-500">
              Saisis les valeurs ci-dessous (en mémoire) pour les chiffrer et les envoyer en un clic, ou copie les noms vers{' '}
              <a
                href={repoSecretsUrl}
                target="_blank"
                rel="noreferrer"
                className="text-emerald-700 hover:underline"
              >
                Settings → Secrets
              </a>
              .
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleSyncSecrets}
              disabled={syncingSecrets || secrets.length === 0 || !parsedSlug}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
            >
              <UploadCloud className="w-4 h-4" />
              <span>
                {syncingSecrets
                  ? 'Chiffrement & envoi...'
                  : `Envoyer ${readySecretCount} secret(s) sur GitHub`}
              </span>
            </button>
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
                  <th className="py-2.5 px-4">État GitHub</th>
                  <th className="py-2.5 px-4">Valeur pour envoi direct (mémoire)</th>
                  <th className="py-2.5 px-4">Projets liés</th>
                  <th className="py-2.5 px-4 text-right">Copier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {secrets.map((secret) => {
                  const onGitHub = existingSecretsSet.has(secret.name);
                  const val = effectiveSecretValues[secret.name] || '';
                  return (
                    <tr key={secret.name} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4">
                        <input
                          type="checkbox"
                          checked={Boolean(checkedNames[secret.name] || onGitHub)}
                          onChange={() => toggleCheck(secret.name)}
                          aria-label={`Marquer ${secret.name} comme configuré`}
                          className="w-4 h-4 accent-emerald-600 rounded"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-mono text-xs font-semibold text-slate-900">
                          {secret.name}
                        </div>
                        <div className="text-slate-500 text-xs mt-0.5">{secret.hint}</div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-xs">
                        {onGitHub ? (
                          <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Présent sur GitHub</span>
                          </span>
                        ) : (
                          <span className="text-slate-400">
                            {repoStatus ? 'Absent' : 'Non vérifié'}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 min-w-[210px]">
                        <input
                          type="password"
                          autoComplete="off"
                          value={val}
                          onChange={(e) => onChangeInlineSecretValue(secret.name, e.target.value)}
                          aria-label={`Valeur du secret ${secret.name}`}
                          placeholder={
                            secret.kind === 'access_token'
                              ? 'sbp_...'
                              : secret.kind === 'url'
                                ? 'https://xxxx.supabase.co'
                                : 'sb_secret_... ou sb_publishable_...'
                          }
                          className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                        />
                      </td>
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-slate-500" />
              <h3 className="text-sm font-semibold text-slate-900">
                3. Alternative CLI — Dépôt déjà cloné en local
              </h3>
            </div>
            <button
              type="button"
              onClick={() => copyText('git-push', existingRepoCliCommands)}
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
            <code>{existingRepoCliCommands}</code>
          </pre>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-slate-500" />
              <h3 className="text-sm font-semibold text-slate-900">
                4. Envoyer les secrets via GitHub CLI (gh)
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
