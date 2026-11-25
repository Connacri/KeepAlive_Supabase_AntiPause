import { useState } from 'react';
import { X } from 'lucide-react';
import { ProjectConfig } from '../types';
import { parseImportedConfig } from '../utils/supabaseParser';

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  onImport: (projects: Omit<ProjectConfig, 'id'>[]) => void;
}

export function ImportModal({ open, onClose, onImport }: ImportModalProps) {
  const [jsonText, setJsonText] = useState('');
  const [error, setError] = useState('');

  if (!open) return null;

  const handleImport = () => {
    setError('');
    if (!jsonText.trim()) {
      setError('Colle le contenu de ton fichier config.json avant d’importer.');
      return;
    }

    try {
      const { projects, errors } = parseImportedConfig(jsonText);
      if (projects.length === 0) {
        setError(errors.join(' · ') || 'Aucun projet valide trouvé dans ce JSON.');
        return;
      }
      onImport(projects);
      setJsonText('');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-modal-title"
    >
      <div className="w-full max-w-xl bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 id="import-modal-title" className="text-lg font-semibold text-slate-900">
            Importer une configuration JSON
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer la fenêtre d'import"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-600">
            Compatible avec <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">config.json</code> de
            SupabaseKeepAlive Windows et le format <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">travisvn/supabase-inactive-fix</code>.
            Les secrets chiffrés DPAPI ne sont pas déchiffrables ici et seront remplacés par des noms de Secrets GitHub.
          </p>

          <div>
            <label htmlFor="import-json-input" className="block text-sm font-medium text-slate-700 mb-1.5">
              Contenu JSON
            </label>
            <textarea
              id="import-json-input"
              rows={8}
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              placeholder='[{"name":"MonProjet","account":"moi@gmail.com","supabase_url":"https://xxx.supabase.co","table_name":"keepalive_pings"}]'
              className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
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
              type="button"
              onClick={handleImport}
              className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 whitespace-nowrap shrink-0"
            >
              Importer les projets
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
