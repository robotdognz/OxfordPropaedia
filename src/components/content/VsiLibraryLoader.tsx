import { h } from 'preact';
import { useEffect } from 'preact/hooks';
import { useJsonPayload } from '../../hooks/useJsonPayload';
import type { VsiLibraryPayload } from '../../utils/readingLibraryPayloads';
import VsiLibrary from './VsiLibrary';

interface VsiLibraryLoaderProps {
  dataUrl: string;
  baseUrl: string;
  onReadingTypeChange: (type: import('../../utils/readingPreference').ReadingType) => void;
  onReady?: () => void;
}

export default function VsiLibraryLoader({ dataUrl, baseUrl, onReadingTypeChange, onReady }: VsiLibraryLoaderProps) {
  const { data, error } = useJsonPayload<VsiLibraryPayload>(dataUrl);

  useEffect(() => {
    if (data && onReady) {
      onReady();
    }
  }, [data, onReady]);

  if (error) {
    return (
      <div class="rounded-xl border border-red-200 bg-red-50 px-4 py-5 text-sm text-red-700">
        Could not load the VSI library right now.
      </div>
    );
  }

  if (!data) {
    return (
      <div class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
        Loading the VSI library...
      </div>
    );
  }

  return (
    <VsiLibrary
      entries={data.entries}
      baseUrl={baseUrl}
      onReadingTypeChange={onReadingTypeChange}
    />
  );
}
