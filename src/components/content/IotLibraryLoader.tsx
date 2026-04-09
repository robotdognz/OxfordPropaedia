import { h } from 'preact';
import { useEffect } from 'preact/hooks';
import { useJsonPayload } from '../../hooks/useJsonPayload';
import type { IotLibraryPayload } from '../../utils/readingLibraryPayloads';
import IotLibrary from './IotLibrary';

interface IotLibraryLoaderProps {
  dataUrl: string;
  baseUrl: string;
  onReadingTypeChange: (type: import('../../utils/readingPreference').ReadingType) => void;
  onReady?: () => void;
}

export default function IotLibraryLoader({ dataUrl, baseUrl, onReadingTypeChange, onReady }: IotLibraryLoaderProps) {
  const { data, error } = useJsonPayload<IotLibraryPayload>(dataUrl);

  useEffect(() => {
    if (data && onReady) {
      onReady();
    }
  }, [data, onReady]);

  if (error) {
    return (
      <div class="rounded-xl border border-red-200 bg-red-50 px-4 py-5 text-sm text-red-700">
        Could not load the BBC In Our Time library right now.
      </div>
    );
  }

  if (!data) {
    return (
      <div class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
        Loading the BBC In Our Time library...
      </div>
    );
  }

  return (
    <IotLibrary
      entries={data.entries}
      baseUrl={baseUrl}
      onReadingTypeChange={onReadingTypeChange}
    />
  );
}
