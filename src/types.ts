export type KeyVariant = 'anon' | 'secret';

export type CronPreset = 'every12h' | 'daily' | 'twice_weekly' | 'custom';

export interface ProjectConfig {
  id: string;
  name: string;
  account: string;
  url: string;
  keyType: KeyVariant;
  keySecretName: string;
  urlSecretName: string;
  tokenSecretName: string;
  table: string;
  keep: number;
  enabled: boolean;
  /** Stocké uniquement en mémoire navigateur pour aider à générer les commandes `gh secret set`, jamais exporté dans le dépôt Git. */
  localKeyValue?: string;
  /** Stocké uniquement en mémoire navigateur pour aider à générer les commandes `gh secret set`, jamais exporté dans le dépôt Git. */
  localTokenValue?: string;
}

export interface RepoSettings {
  repoName: string;
  cronPreset: CronPreset;
  customCron: string;
  urlsInSecrets: boolean;
  autoSetupOnPing: boolean;
}

export interface GeneratedFile {
  path: string;
  language: 'yaml' | 'python' | 'json' | 'sql' | 'markdown' | 'text';
  description: string;
  content: string;
}

export interface SecretItem {
  name: string;
  kind: 'key' | 'url' | 'access_token';
  projects: string[];
  hint: string;
  localValue?: string;
}
