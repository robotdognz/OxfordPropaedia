import { h } from 'preact';

export interface ShelfToggleButtonProps {
  shelved: boolean;
  onToggle: (shelved: boolean) => void;
  ariaLabel: string;
  label?: string;
  compact?: boolean;
  variant?: 'inline' | 'ribbon';
  ribbonOffsetClass?: string;
}

function BookmarkIcon({
  shelved,
  variant,
}: {
  shelved: boolean;
  variant: 'inline' | 'ribbon';
}) {
  const filledPath = variant === 'ribbon'
    ? 'M7 0H17V23L12 18.5L7 23V0Z'
    : 'M7.5 3.75h9a1.25 1.25 0 0 1 1.25 1.25V20l-5.75-2.875L6.25 20V5A1.25 1.25 0 0 1 7.5 3.75Z';
  const outlinePath = variant === 'ribbon'
    ? 'M7.7 0.4V22.1L12 18.7L16.3 22.1V0.4'
    : filledPath;
  const sizeClass = variant === 'ribbon' ? 'h-9 w-10' : 'h-5 w-5';

  if (shelved) {
    return (
      <svg class={sizeClass} viewBox="0 0 24 24" aria-hidden="true">
        <path d={filledPath} fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg class={sizeClass} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d={outlinePath}
        stroke="currentColor"
        stroke-width={variant === 'ribbon' ? '0.65' : '1.9'}
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

export default function ShelfToggleButton({
  shelved,
  onToggle,
  ariaLabel,
  label = 'My Shelf',
  compact = false,
  variant = compact ? 'ribbon' : 'inline',
  ribbonOffsetClass = '-mt-[18px]',
}: ShelfToggleButtonProps) {
  const icon = <BookmarkIcon shelved={shelved} variant={variant} />;

  if (variant === 'ribbon') {
    return (
      <button
        type="button"
        aria-pressed={shelved}
        aria-label={ariaLabel}
        onClick={() => onToggle(!shelved)}
        class={`inline-flex flex-none items-start justify-center px-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 ${
          compact ? `${ribbonOffsetClass} h-9 w-10 overflow-visible` : 'h-9 w-10'
        } ${shelved ? 'text-blue-700 hover:text-blue-800' : 'text-slate-400 hover:text-slate-600'}`}
      >
        {icon}
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={shelved}
      aria-label={ariaLabel}
      onClick={() => onToggle(!shelved)}
      class={`inline-flex items-center gap-1.5 rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 ${
        compact
          ? 'px-0.5 py-0.5 text-xs font-medium'
          : 'px-0.5 py-0.5 text-sm font-sans leading-none'
      } ${shelved ? 'text-blue-700 hover:text-blue-800' : 'text-slate-500 hover:text-slate-700'}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
