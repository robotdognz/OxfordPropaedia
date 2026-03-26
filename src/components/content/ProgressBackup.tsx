import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  downloadProgressFile,
  getProgressSummary,
  importProgress,
  recordExportTime,
  type ProgressBackup as ProgressBackupData,
} from '../../utils/progressBackup';

export default function ProgressBackup() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [summary, setSummary] = useState({ checkedCount: 0, lastExported: null as string | null });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setSummary(getProgressSummary());
  }, []);

  const handleExport = () => {
    downloadProgressFile();
    recordExportTime();
    setSummary(getProgressSummary());
    setMessage({ type: 'success', text: 'Progress exported.' });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleImport = () => {
    fileRef.current?.click();
  };

  const handleFileChange = (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const backup = JSON.parse(reader.result as string) as ProgressBackupData;
        const result = importProgress(backup);
        if (result.errors.length > 0) {
          setMessage({ type: 'error', text: result.errors.join(' ') });
        } else {
          setMessage({ type: 'success', text: `Restored ${result.imported} settings. Reload the page to apply.` });
        }
        setSummary(getProgressSummary());
      } catch {
        setMessage({ type: 'error', text: 'Could not read the backup file.' });
      }
      input.value = '';
    };
    reader.readAsText(file);
  };

  return (
    <div class="rounded-xl border border-gray-200 bg-gray-50/50 p-5">
      <h3 class="text-sm font-medium uppercase tracking-wide text-gray-500">Your Progress</h3>
      <p class="mt-2 text-sm text-gray-600">
        {summary.checkedCount > 0
          ? `${summary.checkedCount} readings checked off.`
          : 'No readings checked off yet.'}
        {summary.lastExported && (
          <span class="text-gray-400"> Last backed up {new Date(summary.lastExported).toLocaleDateString()}.</span>
        )}
      </p>
      <p class="mt-1 text-xs text-gray-400">
        Your progress is stored in this browser. Export a backup to keep it safe or transfer it to another device.
      </p>
      <div class="mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleExport}
          class="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
        >
          Export backup
        </button>
        <button
          type="button"
          onClick={handleImport}
          class="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
        >
          Import backup
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json"
          class="hidden"
          onChange={handleFileChange}
        />
      </div>
      {message && (
        <p class={`mt-2 text-sm ${message.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
