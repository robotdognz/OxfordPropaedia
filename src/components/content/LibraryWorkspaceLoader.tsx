import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import VsiLibraryLoader from './VsiLibraryLoader';
import WikipediaLibraryLoader from './WikipediaLibraryLoader';
import IotLibraryLoader from './IotLibraryLoader';
import MacropaediaLibraryLoader from './MacropaediaLibraryLoader';
import {
  getReadingPreference,
  setReadingPreference,
  subscribeReadingPreference,
  type ReadingType,
} from '../../utils/readingPreference';

interface LibraryWorkspaceLoaderProps {
  baseUrl: string;
}

function parseLibrarySourceFromUrl(): ReadingType | null {
  if (typeof window === 'undefined') return null;

  const source = new URL(window.location.href).searchParams.get('source');
  return source === 'vsi' || source === 'wikipedia' || source === 'iot' || source === 'macropaedia'
    ? source
    : null;
}

export default function LibraryWorkspaceLoader({ baseUrl }: LibraryWorkspaceLoaderProps) {
  const [readingType, setReadingTypeState] = useState<ReadingType>(() => parseLibrarySourceFromUrl() ?? getReadingPreference());
  const pendingScrollY = useRef<number | null>(null);

  useEffect(() => {
    const syncFromUrl = () => {
      const source = parseLibrarySourceFromUrl();
      if (source) {
        setReadingTypeState(source);
        setReadingPreference(source);
        return;
      }

      setReadingTypeState(getReadingPreference());
    };

    syncFromUrl();
    const unsubscribe = subscribeReadingPreference((type) => {
      if (!parseLibrarySourceFromUrl()) {
        setReadingTypeState(type);
      }
    });
    window.addEventListener('popstate', syncFromUrl);

    return () => {
      unsubscribe();
      window.removeEventListener('popstate', syncFromUrl);
    };
  }, []);

  const handleReadingTypeChange = (type: ReadingType) => {
    if (typeof window !== 'undefined') {
      pendingScrollY.current = window.scrollY;
    }
    setReadingTypeState(type);
  };

  const handleSourceReady = () => {
    if (typeof window === 'undefined') return;
    if (pendingScrollY.current == null) return;

    const targetY = pendingScrollY.current;
    pendingScrollY.current = null;

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: targetY, behavior: 'auto' });
      });
    });
  };

  return (
    readingType === 'vsi' ? (
      <VsiLibraryLoader
        dataUrl={`${baseUrl}/library-data/vsi.json`}
        baseUrl={baseUrl}
        onReadingTypeChange={handleReadingTypeChange}
        onReady={handleSourceReady}
      />
    ) : readingType === 'wikipedia' ? (
      <WikipediaLibraryLoader
        dataUrl={`${baseUrl}/library-data/wikipedia.json`}
        baseUrl={baseUrl}
        onReadingTypeChange={handleReadingTypeChange}
        onReady={handleSourceReady}
      />
    ) : readingType === 'iot' ? (
      <IotLibraryLoader
        dataUrl={`${baseUrl}/library-data/iot.json`}
        baseUrl={baseUrl}
        onReadingTypeChange={handleReadingTypeChange}
        onReady={handleSourceReady}
      />
    ) : (
      <MacropaediaLibraryLoader
        dataUrl={`${baseUrl}/library-data/macropaedia.json`}
        baseUrl={baseUrl}
        onReadingTypeChange={handleReadingTypeChange}
        onReady={handleSourceReady}
      />
    )
  );
}
