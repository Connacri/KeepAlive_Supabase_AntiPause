import { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { ProjectConfig, RepoSettings } from './types';
import { buildSecretChecklist, generateRepositoryFiles, resolveCronExpression } from './utils/repoGenerator';
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
  repoName: 'supabase-keepalive-actions',
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
  repo: {
    title: 'Dépôt GitHub',
    subtitle: 'Inspecte et télécharge le dépôt prêt à pousser (ping, création et vidage).',
  },
  secrets: {
    title: 'Secrets & Déploiement',
    subtitle: 'Ajoute les Secrets dans GitHub puis pousse le dépôt.',
  },
  sql: {
    title: 'SQL & Opérations',
    subtitle: 'Scripts SQL manuels et détail des 3 workflows GitHub Actions.',
  },
};

function loadInitialProjects(): ProjectConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_PROJECTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore storage errors
  }
  return DEFAULT_PROJECTS;
}

function loadInitialSettings(): RepoSettings {
  try {
    const raw = localStorage.getItem(STORAGE_SETTINGS_KEY);
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch {
    // ignore storage errors
  }
  return DEFAULT_SETTINGS;
}

export default function App() {
  const [projects, setProjects] = useState<ProjectConfig[]>(loadInitialProjects);
  const [settings, setSettings] = useState<RepoSettings>(loadInitialSettings);
  const [activeSection, setActiveSection] = useState<NavSection>('projects');
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectConfig | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

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
    if (existingId) {
      setProjects((prev) => prev.map((p) => (p.id === existingId ? { ...draft, id: existingId } : p)));
      showToast(`Projet « ${draft.name} » mis à jour.`);
    } else {
      const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
      setProjects((prev) => [...prev, { ...draft, id }]);
      showToast(`Projet « ${draft.name} » ajouté au dépôt.`);
    }
  };

  const handleToggleProject = (id: string) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p))
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
    const stamped = imported.map((p, idx) => ({
      ...p,
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${idx}`,
    }));
    setProjects((prev) => [...prev, ...stamped]);
    showToast(`${stamped.length} projet(s) importé(s).`);
  };

  const handleDownloadZip = async () => {
    await downloadRepoAsZip(settings.repoName, files);
    showToast(`Archive « ${settings.repoName}.zip » générée (${files.length} fichiers).`);
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
            onClick={handleDownloadZip}
            className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Télécharger le dépôt (.zip)</span>
            <span className="sm:hidden">Dépôt (.zip)</span>
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
              onUpdateSettings={(patch) => setSettings((prev) => ({ ...prev, ...patch }))}
            />
          )}

          {activeSection === 'repo' && (
            <RepoExplorerView
              files={files}
              settings={settings}
              onUpdateSettings={(patch) => setSettings((prev) => ({ ...prev, ...patch }))}
            />
          )}

          {activeSection === 'secrets' && (
            <SecretsDeployView secrets={secrets} settings={settings} />
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
