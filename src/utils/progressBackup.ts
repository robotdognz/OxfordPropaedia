/**
 * Export and import all user progress and preferences.
 */

const KEYS = [
  'propaedia-reading-checklist-v1',
  'propaedia-reading-preference',
  'propaedia-hide-checked-readings',
  'propaedia-coverage-layer',
  'propaedia-wiki-level',
] as const;

export interface ProgressBackup {
  version: 1;
  exportedAt: string;
  data: Record<string, string | null>;
}

export function exportProgress(): ProgressBackup {
  const data: Record<string, string | null> = {};
  for (const key of KEYS) {
    try {
      data[key] = localStorage.getItem(key);
    } catch {
      data[key] = null;
    }
  }
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    data,
  };
}

export function importProgress(backup: ProgressBackup): { imported: number; errors: string[] } {
  const errors: string[] = [];
  let imported = 0;

  if (!backup || backup.version !== 1 || !backup.data) {
    return { imported: 0, errors: ['Invalid backup file format.'] };
  }

  for (const key of KEYS) {
    const value = backup.data[key];
    if (value === null || value === undefined) continue;
    try {
      localStorage.setItem(key, value);
      imported++;
    } catch (err) {
      errors.push(`Failed to restore ${key}`);
    }
  }

  return { imported, errors };
}

export function downloadProgressFile(): void {
  const backup = exportProgress();
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `propaedia-progress-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function getProgressSummary(): { checkedCount: number; lastExported: string | null } {
  let checkedCount = 0;
  try {
    const raw = localStorage.getItem('propaedia-reading-checklist-v1');
    if (raw) {
      const parsed = JSON.parse(raw);
      checkedCount = Object.keys(parsed).filter(k => parsed[k] === true).length;
    }
  } catch {}

  let lastExported: string | null = null;
  try {
    lastExported = localStorage.getItem('propaedia-last-export');
  } catch {}

  return { checkedCount, lastExported };
}

export function recordExportTime(): void {
  try {
    localStorage.setItem('propaedia-last-export', new Date().toISOString());
  } catch {}
}
