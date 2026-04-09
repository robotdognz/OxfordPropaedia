import { h } from 'preact';
import ShelfToggleButton from './ShelfToggleButton';

export interface ReadingActionControlsProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  checkboxAriaLabel: string;
  shelved: boolean;
  onShelvedChange: (shelved: boolean) => void;
  shelfAriaLabel: string;
  align?: 'start' | 'end';
  ribbonOffsetClass?: string;
}

export default function ReadingActionControls({
  checked,
  onCheckedChange,
  checkboxAriaLabel,
  shelved,
  onShelvedChange,
  shelfAriaLabel,
  align = 'end',
  ribbonOffsetClass,
}: ReadingActionControlsProps) {
  const alignmentClass = align === 'start' ? 'justify-start' : 'justify-end';

  return (
    <div class={`flex flex-shrink-0 items-start gap-2.5 ${alignmentClass}`}>
      <ShelfToggleButton
        shelved={shelved}
        onToggle={onShelvedChange}
        ariaLabel={shelfAriaLabel}
        label="My Shelf"
        compact
        variant="ribbon"
        ribbonOffsetClass={ribbonOffsetClass}
      />
      <label class="inline-flex items-center gap-2 text-xs font-sans font-medium text-gray-500">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onCheckedChange((event.currentTarget as HTMLInputElement).checked)}
          class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          aria-label={checkboxAriaLabel}
        />
        Done
      </label>
    </div>
  );
}
