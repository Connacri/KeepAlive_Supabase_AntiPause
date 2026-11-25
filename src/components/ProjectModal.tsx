import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { KeyVariant, ProjectConfig } from '../types';
import {
  DEFAULT_KEEP,
  DEFAULT_TABLE,
  makeSecretIdentifier,
  smartParseSupabaseText,
  validateProjectDraft,
} from '../utils/supabaseParser';

interface ProjectModalProps {
  open: boolean;
  initialProject: ProjectConfig | null;
  existingAccounts: string[];
  onClose: () => void;
  onSave: (project: Omit<ProjectConfig, 'id'>, existingId?: string) => void;
}

export function ProjectModal({
  open,
  initialProject,
  existingAccounts,
  onClose,
  onSave,
}: ProjectModalProps) {
  const [pasteText, setPasteText] = useState('');
  const [account, setAccount] = useState('');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [keyType, setKeyType] = useState<KeyVariant>('secret');
  const [keySecretName, setKeySecretName] = useState('');
  const [urlSecretName, setUrlSecretName] = useState('');
  const [tokenSecretName, setTokenSecretName] = useState('');
  const [table, setTable] = useState(DEFAULT_TABLE);
  const [keep, setKeep] = useState(String(DEFAULT_KEEP));
  const [enabled, setEnabled] = useState(true);
  const [localKeyValue, setLocalKeyValue] = useState('');
  const [localTokenValue, setLocalTokenValue] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setPasteText('');
    if (initialProject) {
      setAccount(initialProject.account);
      setName(initialProject.name);
      setUrl(initialProject.url);
      setKeyType(initialProject.keyType);
      setKeySecretName(initialProject.keySecretName);
      setUrlSecretName(initialProject.urlSecretName);
      setTokenSecretName(initialProject.tokenSecretName);
      setTable(initialProject.table);
      setKeep(String(initialProject.keep));
      setEnabled(initialProject.enabled);
      setLocalKeyValue(initialProject.localKeyValue || '');
      setLocalTokenValue(initialProject.localTokenValue || '');
    } else {
      setAccount('');
      setName('');
      setUrl('');
      setKeyType('secret');
      setKeySecretName('');
      setUrlSecretName('');
      setTokenSecretName('');
      setTable(DEFAULT_TABLE);
      setKeep(String(DEFAULT_KEEP));
      setEnabled(true);
      setLocalKeyValue('');
      setLocalTokenValue('');
    }
  }, [open, initialProject]);

  if (!open) return null;

  const handleBulkPaste = (value: string) => {
    setPasteText(value);
    const parsed = smartParseSupabaseText(value);
    if (parsed.url) {
      setUrl(parsed.url);
      if (!name.trim() && parsed.suggestedName) {
        setName(parsed.suggestedName);
        if (!keySecretName.trim()) {
          setKeySecretName(makeSecretIdentifier('SUPABASE_KEY', parsed.suggestedName));
        }
        if (!urlSecretName.trim()) {
          setUrlSecretName(makeSecretIdentifier('SUPABASE_URL', parsed.suggestedName));
        }
      }
    }
    if (parsed.detectedVariant) {
      setKeyType(parsed.detectedVariant);
    }
    if (parsed.secretKey) {
      setLocalKeyValue(parsed.secretKey);
    } else if (parsed.anonKey) {
      setLocalKeyValue(parsed.anonKey);
    }
    if (parsed.accessToken) {
      setLocalTokenValue(parsed.accessToken);
      if (!tokenSecretName.trim()) {
        setTokenSecretName(
          account.trim()
            ? makeSecretIdentifier('SUPABASE_TOKEN', account.trim())
            : 'SUPABASE_ACCESS_TOKEN'
        );
      }
    }
  };

  const handleNameChange = (nextName: string) => {
    setName(nextName);
    if (!initialProject) {
      setKeySecretName(makeSecretIdentifier('SUPABASE_KEY', nextName));
      setUrlSecretName(makeSecretIdentifier('SUPABASE_URL', nextName));
    }
  };

  const handleAccountChange = (nextAccount: string) => {
    setAccount(nextAccount);
    if (!initialProject && nextAccount.trim() && !tokenSecretName.trim()) {
      setTokenSecretName(makeSecretIdentifier('SUPABASE_TOKEN', nextAccount));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = validateProjectDraft({
      name,
      account,
      url,
      keyType,
      keySecretName: keySecretName || makeSecretIdentifier('SUPABASE_KEY', name || 'PROJET'),
      urlSecretName: urlSecretName || makeSecretIdentifier('SUPABASE_URL', name || 'PROJET'),
      tokenSecretName,
      table,
      keep: Number(keep),
      enabled,
      localKeyValue,
      localTokenValue,
    });

    if (res.ok === false) {
      setError(res.error);
      return;
    }

    onSave(res.project, initialProject?.id);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-modal-title"
    >
      <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-xl overflow-hidden my-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 id="project-modal-title" className="text-lg font-semibold text-slate-900">
            {initialProject ? `Modifier « ${initialProject.name} »` : 'Ajouter un projet Supabase'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer la fenêtre"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          <div>
            <label htmlFor="bulk-paste" className="block text-sm font-medium text-slate-700 mb-1.5">
              Coller en vrac (URL + clés copiées depuis Supabase)
            </label>
            <textarea
              id="bulk-paste"
              rows={2}
              value={pasteText}
              onChange={(e) => handleBulkPaste(e.target.value)}
              placeholder="https://xxxx.supabase.co&#10;sb_secret_... ou sb_publishable_... ou sbp_..."
              className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="proj-account" className="block text-sm font-medium text-slate-700 mb-1">
                Compte Supabase
              </label>
              <input
                id="proj-account"
                type="text"
                list="existing-accounts-list"
                value={account}
                onChange={(e) => handleAccountChange(e.target.value)}
                placeholder="ex : moi@gmail.com"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
              <datalist id="existing-accounts-list">
                {existingAccounts.map((acc) => (
                  <option key={acc} value={acc} />
                ))}
              </datalist>
            </div>

            <div>
              <label htmlFor="proj-name" className="block text-sm font-medium text-slate-700 mb-1">
                Nom du projet *
              </label>
              <input
                id="proj-name"
                type="text"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="ex : blog-prod"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="proj-url" className="block text-sm font-medium text-slate-700 mb-1">
                URL du projet Supabase *
              </label>
              <input
                id="proj-url"
                type="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://xxxx.supabase.co"
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div>
              <span className="block text-sm font-medium text-slate-700 mb-1">Type de clé API</span>
              <div className="flex p-1 bg-slate-100 rounded-lg gap-1">
                <button
                  type="button"
                  onClick={() => setKeyType('secret')}
                  className={`flex-1 py-1.5 px-2.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    keyType === 'secret' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Clé secrète (sûr)
                </button>
                <button
                  type="button"
                  onClick={() => setKeyType('anon')}
                  className={`flex-1 py-1.5 px-2.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    keyType === 'anon' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Anon / Publishable
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="proj-key-secret" className="block text-sm font-medium text-slate-700 mb-1">
                Nom du Secret GitHub (clé) *
              </label>
              <input
                id="proj-key-secret"
                type="text"
                value={keySecretName}
                onChange={(e) => setKeySecretName(e.target.value.toUpperCase())}
                placeholder="SUPABASE_KEY_BLOG"
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div>
              <label htmlFor="proj-token-secret" className="block text-sm font-medium text-slate-700 mb-1">
                Nom du Secret GitHub (jeton sbp_ optionnel)
              </label>
              <input
                id="proj-token-secret"
                type="text"
                value={tokenSecretName}
                onChange={(e) => setTokenSecretName(e.target.value.toUpperCase())}
                placeholder="SUPABASE_ACCESS_TOKEN"
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
              <p className="text-xs text-slate-500 mt-1">
                Permet la création auto de table depuis GitHub Actions. Partageable par compte.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="proj-table" className="block text-sm font-medium text-slate-700 mb-1">
                  Table dédiée
                </label>
                <input
                  id="proj-table"
                  type="text"
                  value={table}
                  onChange={(e) => setTable(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
              <div>
                <label htmlFor="proj-keep" className="block text-sm font-medium text-slate-700 mb-1">
                  Lignes à garder
                </label>
                <input
                  id="proj-keep"
                  type="number"
                  min={1}
                  max={150}
                  value={keep}
                  onChange={(e) => setKeep(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-700">
                Valeurs locales pour pré-remplir « gh secret set » (jamais écrites dans le dépôt Git)
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="local-key-val" className="block text-xs text-slate-500 mb-1">
                  Clé Supabase (optionnel)
                </label>
                <input
                  id="local-key-val"
                  type="password"
                  autoComplete="off"
                  value={localKeyValue}
                  onChange={(e) => setLocalKeyValue(e.target.value)}
                  placeholder="sb_secret_... ou sb_publishable_..."
                  className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
              <div>
                <label htmlFor="local-token-val" className="block text-xs text-slate-500 mb-1">
                  Jeton sbp_ (optionnel)
                </label>
                <input
                  id="local-token-val"
                  type="password"
                  autoComplete="off"
                  value={localTokenValue}
                  onChange={(e) => setLocalTokenValue(e.target.value)}
                  placeholder="sbp_..."
                  className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="proj-enabled"
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="w-4 h-4 accent-emerald-600 rounded"
            />
            <label htmlFor="proj-enabled" className="text-sm text-slate-700">
              Inclure ce projet dans le ping planifié automatique
            </label>
          </div>

          {error && (
            <div role="alert" className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 whitespace-nowrap shrink-0"
            >
              {initialProject ? 'Enregistrer les modifications' : 'Ajouter le projet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
