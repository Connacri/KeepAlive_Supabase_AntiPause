import JSZip from 'jszip';
import { GeneratedFile } from '../types';

export async function downloadRepoAsZip(repoName: string, files: GeneratedFile[]): Promise<void> {
  const zip = new JSZip();
  const safeRoot = repoName.trim().replace(/[^a-zA-Z0-9._-]+/g, '-') || 'supabase-keepalive-actions';

  for (const file of files) {
    zip.file(`${safeRoot}/${file.path}`, file.content);
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeRoot}.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadSingleFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.split('/').pop() || 'fichier.txt';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
