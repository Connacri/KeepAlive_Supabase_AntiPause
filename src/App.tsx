import { useEffect, useMemo, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import { ProjectConfig, RepoSettings } from './types';
import { buildSecretChecklist, generateRepositoryFiles, resolveCronExpression } from './utils/repoGenerator';
import { stampInitialActivity, transitionProjectActivity } from './utils/projectActivity';
import { downloadRepoAsZip } from './utils/zipExport';
import { NavSection, Sidebar } from './components/Sidebar';
import { ProjectsView } from './components/ProjectsView';
import { RepoExplorerView } from './components/RepoExplorerView';
import { SecretsDeployView } from './components/SecretsDeployView';
import { SqlReferenceView } from './components/SqlReferenceView';
import { ProjectModal } from './components/ProjectModal';
import { ImportModal } from './components/ImportModal';

const STORAGE_PROJECTS_KEY = 'supabase_keepalive_gh_projects_v1';
const STORAGE_SETTINGS_KEY = 'supabase_keepalive_gh_settings_v1';

const DEFAULT_PROJECTS: ProjectConfig[] = [
  {
    id: 'demo-blog',
    name: 'blog-vitrine',
    account: 'perso@exemple.fr',
    url: 'https://blogvitrine.supabase.co',
    keyType: 'secret',
    keySecretName: 'SUPABASE_KEY_BLOG_VITRINE',
    urlSecretName: 'SUPABASE_URL_BLOG_VITRINE',
    tokenSecretName: 'SUPABASE_TOKEN_PERSO',
    table: 'keepalive_pings',
    keep: 5,
    enabled: true,
  },
  {
    id: 'demo-app',
    name: 'crm-client',
    account: 'perso@exemple.fr',
    url: 'https://crmclientdemo.supabase.co',
    keyType: 'anon',
    keySecretName: 'SUPABASE_KEY_CRM_CLIENT',
    urlSecretName: 'SUPABASE_URL_CRM_CLIENT',
    tokenSecretName: 'SUPABASE_TOKEN_PERSO',
    table: 'keepalive_pings',
    keep: 5,
    enabled: true,
  },
];

const DEFAULT_SETTINGS: RepoSettings = {
  repoName: 'KeepAlive_Supabase_AntiPause',
  githubRepoSlug: 'Connacri/KeepAlive_Supabase_AntiPause',
  githubBranch: 'main',
  cronPreset: 'every12h',
  customCron: '0 */12 * * *',
  urlsInSecrets: false,
  autoSetupOnPing: true,
};

const SECTION_TITLES: Record<NavSection, { title: string; subtitle: string }> = {
  projects: {
    title: 'Projets Supabase',
    subtitle: 'Configure les projets à maintenir actifs via GitHub Actions.',
  },
  secrets: {
    title: 'Sync GitHub & Secrets',
    subtitle: 'Pousse les workflows et configure les Secrets directement sur ton dépôt déjà existant.',
  },
  repo: {
    title: 'Fichiers du dépôt',
    subtitle: 'Inspecte les workflows, le script Python et projects.json générés pour GitHub Actions.',
  },
  sql: {
    title: 'SQL & Opérations',
    subtitle: 'Scripts SQL manuels et détail des 3 workflows GitHub Actions.',
  },
};

function loadInitialProjects(): ProjectConfig[] {
  const nowIso = new Date().toISOString();
  try {
    const raw = localStorage.getItem(STORAGE_PROJECTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return stampInitialActivity(parsed, nowIso);
    }
  } catch {
    // ignore storage errors
  }
  return stampInitialActivity(DEFAULT_PROJECTS, nowIso);
}

function detectRepoSlugFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  const host = window.location.hostname.toLowerCase();
  if (!host.endsWith('.github.io')) return null;
  const owner = host.split('.')[0];
  const repo = window.location.pathname.split('/').filter(Boolean)[0];
  if (!owner || !repo) return null;
  return `${owner}/${repo}`;
}

function loadInitialSettings(): RepoSettings {
  const detectedSlug = detectRepoSlugFromLocation();
  const baseDefaults = detectedSlug
    ? { ...DEFAULT_SETTINGS, githubRepoSlug: detectedSlug }
    : DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_SETTINGS_KEY);
    if (raw) {
      return { ...baseDefaults, ...JSON.parse(raw) };
    }
  } catch {
    // ignore storage errors
  }
  return baseDefaults;
}

export default function App() {
  const [projects, setProjects] = useState<ProjectConfig[]>(loadInitialProjects);
  const [settings, setSettings] = useState<RepoSettings>(loadInitialSettings);
  const [activeSection, setActiveSection] = useState<NavSection>('projects');
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectConfig | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Strictement en mémoire navigateur (jamais persisté dans localStorage)
  const [githubToken, setGithubToken] = useState('');
  const [inlineSecretValues, setInlineSecretValues] = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      // Ne jamais persister les valeurs secrètes locales en clair dans localStorage
      const sanitized = projects.map(({ localKeyValue: _k, localTokenValue: _t, ...rest }) => rest);
      localStorage.setItem(STORAGE_PROJECTS_KEY, JSON.stringify(sanitized));
    } catch {
      // ignore storage errors
    }
  }, [projects]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // ignore storage errors
    }
  }, [settings]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((curr) => (curr === msg ? null : curr));
    }, 3200);
  };

  const files = useMemo(() => generateRepositoryFiles(projects, settings), [projects, settings]);
  const secrets = useMemo(() => buildSecretChecklist(projects, settings), [projects, settings]);
  const { label: cronLabel } = useMemo(
    () => resolveCronExpression(settings.cronPreset, settings.customCron),
    [settings.cronPreset, settings.customCron]
  );

  const existingAccounts = useMemo(() => {
    const set = new Set(projects.map((p) => p.account.trim()).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [projects]);

  const activeCount = useMemo(() => projects.filter((p) => p.enabled).length, [projects]);

  const handleSaveProject = (draft: Omit<ProjectConfig, 'id'>, existingId?: string) => {
    const nowMs = Date.now();
    if (existingId) {
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== existingId) return p;
          const activityPatch = transitionProjectActivity(p, draft.enabled, nowMs);
          return { ...draft, id: existingId, ...activityPatch };
        })
      );
      showToast(`Projet « ${draft.name} » mis à jour.`);
    } else {
      const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(nowMs);
      const activityPatch = draft.enabled
        ? { activeSince: new Date(nowMs).toISOString(), accumulatedActiveMs: 0 }
        : { activeSince: undefined, accumulatedActiveMs: 0 };
      setProjects((prev) => [...prev, { ...draft, id, ...activityPatch }]);
      showToast(`Projet « ${draft.name} » ajouté.`);
    }
  };

  const handleToggleProject = (id: string) => {
    const nowMs = Date.now();
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        return { ...p, ...transitionProjectActivity(p, !p.enabled, nowMs) };
      })
    );
  };

  const handleDeleteProject = (id: string) => {
    const target = projects.find((p) => p.id === id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
    if (target) {
      showToast(`Projet « ${target.name} » retiré.`);
    }
  };

  const handleImportProjects = (imported: Omit<ProjectConfig, 'id'>[]) => {
    const nowIso = new Date().toISOString();
    const stamped = stampInitialActivity(
      imported.map((p, idx) => ({
        ...p,
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${idx}`,
      })),
      nowIso
    );
    setProjects((prev) => [...prev, ...stamped]);
    showToast(`${stamped.length} projet(s) importé(s).`);
  };

  const handleReplaceProjectsFromRepo = (loaded: Omit<ProjectConfig, 'id'>[]) => {
    const nowIso = new Date().toISOString();
    const stamped = stampInitialActivity(
      loaded.map((p, idx) => ({
        ...p,
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${idx}`,
      })),
      nowIso
    );
    setProjects(stamped);
    showToast(`${stamped.length} projet(s) chargé(s) depuis GitHub.`);
  };

  const handleDownloadZip = async () => {
    const slug = settings.githubRepoSlug.split('/').pop() || settings.repoName;
    await downloadRepoAsZip(slug, files);
    showToast(`Archive « ${slug}.zip » générée (${files.length} fichiers).`);
  };

  const sectionMeta = SECTION_TITLES[activeSection];

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-slate-50 text-slate-900">
      <Sidebar
        active={activeSection}
        onChange={setActiveSection}
        activeCount={activeCount}
        totalCount={projects.length}
        cronLabel={cronLabel}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between gap-3 sm:gap-8">
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-semibold text-slate-900 truncate">{sectionMeta.title}</h1>
            <p className="text-xs text-slate-500 truncate">{sectionMeta.subtitle}</p>
          </div>

          <button
            type="button"
            onClick={() => setActiveSection('secrets')}
            className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap shrink-0"
          >
            <UploadCloud className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Synchroniser sur GitHub</span>
            <span className="sm:hidden">Sync GitHub</span>
          </button>
        </header>

        <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
          {activeSection === 'projects' && (
            <ProjectsView
              projects={projects}
              settings={settings}
              cronLabel={cronLabel}
              secretCount={secrets.length}
              onAdd={() => {
                setEditingProject(null);
                setProjectModalOpen(true);
              }}
              onEdit={(project) => {
                setEditingProject(project);
                setProjectModalOpen(true);
              }}
              onToggle={handleToggleProject}
              onDelete={handleDeleteProject}
              onOpenImport={() => setImportModalOpen(true)}
              onNavigateRepo={() => setActiveSection('repo')}
              onNavigateSync={() => setActiveSection('secrets')}
              onUpdateSettings={(patch) => setSettings((prev) => ({ ...prev, ...patch }))}
            />
          )}

          {activeSection === 'secrets' && (
            <SecretsDeployView
              secrets={secrets}
              settings={settings}
              files={files}
              githubToken={githubToken}
              onChangeGithubToken={setGithubToken}
              inlineSecretValues={inlineSecretValues}
              onChangeInlineSecretValue={(name, value) =>
                setInlineSecretValues((prev) => ({ ...prev, [name]: value }))
              }
              onUpdateSettings={(patch) => setSettings((prev) => ({ ...prev, ...patch }))}
              onLoadProjectsFromRepo={handleReplaceProjectsFromRepo}
              onShowToast={showToast}
            />
          )}

          {activeSection === 'repo' && (
            <RepoExplorerView
              files={files}
              settings={settings}
              onUpdateSettings={(patch) => setSettings((prev) => ({ ...prev, ...patch }))}
              onDownloadZip={handleDownloadZip}
            />
          )}

          {activeSection === 'sql' && <SqlReferenceView projects={projects} />}
        </main>
      </div>

      <ProjectModal
        open={projectModalOpen}
        initialProject={editingProject}
        existingAccounts={existingAccounts}
        onClose={() => setProjectModalOpen(false)}
        onSave={handleSaveProject}
      />

      <ImportModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImport={handleImportProjects}
      />

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 px-4 py-2.5 text-sm font-medium text-white bg-slate-900 rounded-lg shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
