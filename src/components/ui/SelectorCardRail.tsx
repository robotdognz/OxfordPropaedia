import { h } from 'preact';

export interface SelectorCardRailOption<Value extends string = string> {
  value: Value;
  label: string;
  eyebrow?: string;
  meta?: string;
  accentColor?: string;
  disabled?: boolean;
}

interface SelectorCardRailProps<Value extends string = string> {
  ariaLabel: string;
  value: Value;
  options: SelectorCardRailOption<Value>[];
  onChange: (value: Value) => void;
  label?: string;
  description?: string;
  size?: 'regular' | 'compact';
  columns?: 1 | 2 | 3 | 4;
}

export default function SelectorCardRail<Value extends string = string>({
  ariaLabel,
  value,
  options,
  onChange,
  label,
  description,
  size = 'regular',
  columns,
}: SelectorCardRailProps<Value>) {
  const isCompact = size === 'compact';
  const forcedLayoutClass = columns === 1
    ? 'grid-cols-1'
    : columns === 2
      ? 'grid-cols-2'
      : columns === 3
        ? 'grid-cols-3'
        : columns === 4
          ? 'grid-cols-4'
          : null;
  const layoutClass = columns
    ? forcedLayoutClass
    : options.length <= 1
      ? 'grid-cols-1'
      : options.length <= 2
        ? 'grid-cols-2'
        : options.length === 3
          ? 'grid-cols-2 sm:grid-cols-3'
          : 'grid-cols-2 xl:grid-cols-4';

  return (
    <section class={label || description ? 'space-y-1.5' : undefined}>
      {label || description ? (
        <div class="space-y-1">
          {label ? (
            <p class="text-[0.68rem] font-sans font-semibold uppercase tracking-[0.18em] text-slate-500">
              {label}
            </p>
          ) : null}
          {description ? (
            <p class="text-xs leading-5 text-slate-500 sm:text-sm">
              {description}
            </p>
          ) : null}
        </div>
      ) : null}
      <div
        class={`grid gap-1.5 ${layoutClass}`}
        role="tablist"
        aria-label={ariaLabel}
      >
        {options.map((option) => {
          const isActive = option.value === value;

          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={isActive}
              disabled={option.disabled}
              onClick={() => {
                if (!option.disabled) onChange(option.value);
              }}
              class={`group relative flex min-w-0 items-center rounded-xl border px-2.5 text-left transition ${
                isCompact ? 'min-h-9 py-1.5' : 'min-h-10 py-2'
              } ${
                option.disabled
                  ? 'cursor-default border-slate-200 bg-slate-50 text-slate-300'
                  : isActive
                    ? 'border-slate-300 bg-white text-slate-900 shadow-sm shadow-slate-200/70'
                    : 'border-slate-200/70 bg-slate-50/60 text-slate-600 hover:border-slate-300 hover:bg-white'
              }`}
            >
              <span class="min-w-0 flex-1">
                {!isCompact && option.eyebrow ? (
                  <span class={`block truncate text-[10px] font-semibold uppercase tracking-[0.16em] ${
                    option.disabled
                      ? 'text-slate-300'
                      : isActive
                        ? 'text-slate-500'
                        : 'text-slate-400'
                  }`}>
                    {option.eyebrow}
                  </span>
                ) : null}
                <span class={`block truncate leading-5 ${
                  isCompact
                    ? isActive ? 'text-xs font-semibold text-slate-900' : 'text-xs font-medium'
                    : isActive ? 'text-sm font-semibold text-slate-900' : 'text-sm font-medium'
                }`}>
                  {option.label}
                </span>
              </span>
              {option.meta ? (
                <span class={`shrink-0 truncate text-[11px] ${
                  option.disabled
                    ? 'text-slate-300'
                    : isActive
                      ? 'text-slate-600'
                      : 'text-slate-500'
                }`}>
                  {option.meta}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
