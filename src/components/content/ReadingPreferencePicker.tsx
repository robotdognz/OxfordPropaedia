import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import {
  type ReadingType,
  READING_TYPE_LABELS,
  getReadingPreference,
  setReadingPreference,
  subscribeReadingPreference,
} from '../../utils/readingPreference';

const TYPES: ReadingType[] = ['vsi', 'wikipedia', 'iot', 'macropaedia'];

export default function ReadingPreferencePicker() {
  const [selected, setSelected] = useState<ReadingType>('vsi');

  useEffect(() => {
    setSelected(getReadingPreference());
    return subscribeReadingPreference((type) => setSelected(type));
  }, []);

  return (
    <div class="space-y-1">
      {TYPES.map((type) => (
        <button
          key={type}
          type="button"
          onClick={() => setReadingPreference(type)}
          class={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition ${
            selected === type
              ? 'bg-indigo-50 text-indigo-700 font-semibold'
              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
          }`}
        >
          <span class={`inline-block h-1.5 w-1.5 rounded-full ${
            selected === type ? 'bg-indigo-500' : 'bg-slate-300'
          }`} />
          {READING_TYPE_LABELS[type]}
        </button>
      ))}
    </div>
  );
}
