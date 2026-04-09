import { h } from 'preact';
import { useEffect } from 'preact/hooks';
import { useJsonPayload } from '../../hooks/useJsonPayload';
import type { WikipediaLibraryPayload } from '../../utils/readingLibraryPayloads';
import WikipediaLibrary from './WikipediaLibrary';

interface WikipediaLibraryLoaderProps {
  dataUrl: string;
  baseUrl: string;
  onReadingTypeChange: (type: import('../../utils/readingPreference').ReadingType) => void;
  onReady?: () => void;
}

export default function WikipediaLibraryLoader({
  dataUrl,
  baseUrl,
  onReadingTypeChange,
  onReady,
}: WikipediaLibraryLoaderProps) {
  const { data, error } = useJsonPayload<WikipediaLibraryPayload>(dataUrl);

  useEffect(() => {
    if (data && onReady) {
      onReady();
    }
  }, [data, onReady]);

  if (error) {
    return (
      <div class="rounded-xl border border-red-200 bg-red-50 px-4 py-5 text-sm text-red-700">
        Could not load the Wikipedia library right now.
      </div>
    );
  }

  if (!data) {
    return (
      <div class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
        Loading the Wikipedia library...
      </div>
    );
  }

  return (
    <WikipediaLibrary
      entries={data.entries}
      baseUrl={baseUrl}
      onReadingTypeChange={onReadingTypeChange}
    />
  );
}
