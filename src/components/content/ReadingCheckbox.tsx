import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import {
  readChecklistState,
  subscribeChecklistState,
  writeChecklistState,
} from '../../utils/readingChecklist';

export interface ReadingCheckboxProps {
  checklistKey: string;
  label?: string;
}

export default function ReadingCheckbox({ checklistKey, label = 'Mark as read' }: ReadingCheckboxProps) {
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setChecked(Boolean(readChecklistState()[checklistKey]));
    return subscribeChecklistState(() => {
      setChecked(Boolean(readChecklistState()[checklistKey]));
    });
  }, [checklistKey]);

  return (
    <label class="inline-flex items-center gap-2 text-sm font-sans text-slate-600 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => {
          const next = (e.currentTarget as HTMLInputElement).checked;
          writeChecklistState(checklistKey, next);
        }}
        class="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
      />
      {checked ? 'Read' : label}
    </label>
  );
}
