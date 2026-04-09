import { h } from 'preact';
import { partColorHex } from '../../utils/helpers';
import type { ReadingType } from '../../utils/readingPreference';
import { READING_TYPE_UI_META } from '../../utils/readingPreference';
import ShelfToggleButton from './ShelfToggleButton';

export interface BookshelfItem {
  key: string;
  href: string;
  title: string;
  meta?: string | null;
  readingType: ReadingType;
  dominantPartNumber?: number | null;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  checkboxAriaLabel: string;
  shelved: boolean;
  onShelvedChange: (shelved: boolean) => void;
  shelfAriaLabel: string;
}

const COVER_PALETTES: Record<ReadingType, Array<{ background: string }>> = {
  vsi: [
    {
      background: 'linear-gradient(165deg, #312e81 0%, #4f46e5 52%, #a5b4fc 100%)',
    },
    {
      background: 'linear-gradient(165deg, #111827 0%, #334155 54%, #cbd5e1 100%)',
    },
    {
      background: 'linear-gradient(165deg, #1d4ed8 0%, #2563eb 48%, #93c5fd 100%)',
    },
    {
      background: 'linear-gradient(165deg, #4c1d95 0%, #7c3aed 48%, #c4b5fd 100%)',
    },
  ],
  wikipedia: [
    {
      background: 'linear-gradient(165deg, #0f172a 0%, #334155 56%, #cbd5e1 100%)',
    },
    {
      background: 'linear-gradient(165deg, #1f2937 0%, #475569 54%, #e2e8f0 100%)',
    },
    {
      background: 'linear-gradient(165deg, #374151 0%, #64748b 56%, #dbeafe 100%)',
    },
  ],
  iot: [
    {
      background: 'linear-gradient(165deg, #7c2d12 0%, #ea580c 52%, #fdba74 100%)',
    },
    {
      background: 'linear-gradient(165deg, #9a3412 0%, #f97316 48%, #fed7aa 100%)',
    },
    {
      background: 'linear-gradient(165deg, #1e293b 0%, #475569 42%, #fb923c 100%)',
    },
  ],
  macropaedia: [
    {
      background: 'linear-gradient(165deg, #134e4a 0%, #0f766e 48%, #99f6e4 100%)',
    },
    {
      background: 'linear-gradient(165deg, #064e3b 0%, #047857 52%, #a7f3d0 100%)',
    },
    {
      background: 'linear-gradient(165deg, #164e63 0%, #0f766e 54%, #ccfbf1 100%)',
    },
  ],
};

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function coverPaletteFor(readingType: ReadingType, seed: string) {
  const palettes = COVER_PALETTES[readingType];
  return palettes[hashString(seed) % palettes.length];
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '');
  const int = Number.parseInt(normalized, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((channel) => clampChannel(channel).toString(16).padStart(2, '0')).join('')}`;
}

function mixHexColors(hexA: string, hexB: string, weight: number): string {
  const [r1, g1, b1] = hexToRgb(hexA);
  const [r2, g2, b2] = hexToRgb(hexB);
  const mix = (a: number, b: number) => a + (b - a) * weight;
  return rgbToHex([
    mix(r1, r2),
    mix(g1, g2),
    mix(b1, b2),
  ] as [number, number, number]);
}

function partCoverPalette(partNumber: number): { background: string } {
  const base = partColorHex(partNumber);
  const dark = mixHexColors(base, '#0f172a', 0.42);
  const light = mixHexColors(base, '#ffffff', 0.34);
  return {
    background: `linear-gradient(165deg, ${dark} 0%, ${base} 50%, ${light} 100%)`,
  };
}

function titleClassFor(title: string, hasMeta: boolean): string {
  if (hasMeta) {
    if (title.length >= 80) {
      return 'text-[0.6rem] sm:text-[0.7rem]';
    }

    if (title.length >= 54) {
      return 'text-[0.64rem] sm:text-[0.74rem]';
    }

    return 'text-[0.7rem] sm:text-[0.8rem]';
  }

  if (title.length >= 80) {
    return 'text-[0.64rem] sm:text-[0.74rem]';
  }

  if (title.length >= 54) {
    return 'text-[0.68rem] sm:text-[0.78rem]';
  }

  return 'text-[0.74rem] sm:text-[0.84rem]';
}

function trimTrailingDecorators(value: string): string {
  return value.replace(/[\s.-]+$/g, '');
}

function truncateLine(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  return `${trimTrailingDecorators(value.slice(0, Math.max(1, maxChars - 3)))}...`;
}

function splitLongWord(word: string, maxChars: number): [string, string] {
  const splitAt = Math.max(4, maxChars - 1);
  return [`${word.slice(0, splitAt)}-`, word.slice(splitAt)];
}

function wrapTitleLines(title: string, hasMeta: boolean): string[] {
  const maxLines = hasMeta ? 4 : 5;
  const maxCharsPerLine = hasMeta ? 11 : 12;
  const words = title.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = '';

  const pushLine = (line: string) => {
    if (line) {
      lines.push(line);
    }
  };

  for (let index = 0; index < words.length; index += 1) {
    let word = words[index];

    while (word.length > maxCharsPerLine) {
      if (currentLine) {
        pushLine(currentLine);
        currentLine = '';
        if (lines.length >= maxLines) {
          lines[maxLines - 1] = truncateLine(lines[maxLines - 1], maxCharsPerLine);
          return lines.slice(0, maxLines);
        }
      }

      if (lines.length === maxLines - 1) {
        lines.push(truncateLine(word, maxCharsPerLine));
        return lines;
      }

      const [chunk, remainder] = splitLongWord(word, maxCharsPerLine);
      lines.push(chunk);
      word = remainder;

      if (lines.length >= maxLines) {
        lines[maxLines - 1] = truncateLine(lines[maxLines - 1], maxCharsPerLine);
        return lines.slice(0, maxLines);
      }
    }

    const nextLine = currentLine ? `${currentLine} ${word}` : word;
    if (nextLine.length <= maxCharsPerLine) {
      currentLine = nextLine;
      continue;
    }

    if (lines.length === maxLines - 1) {
      lines.push(truncateLine(nextLine, maxCharsPerLine));
      return lines;
    }

    pushLine(currentLine);
    currentLine = word;
  }

  if (currentLine) {
    if (lines.length >= maxLines) {
      lines[maxLines - 1] = truncateLine(lines[maxLines - 1], maxCharsPerLine);
    } else {
      lines.push(currentLine);
    }
  }

  return lines.slice(0, maxLines);
}

function DoneToggle({
  checked,
  onCheckedChange,
  ariaLabel,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      aria-label={ariaLabel}
      onClick={() => onCheckedChange(!checked)}
      class={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${
        checked
          ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
          : 'border-white/70 bg-white/90 text-slate-400 hover:border-slate-300 hover:text-slate-600'
      }`}
    >
      <svg class="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
        <path d="m5 10 3 3 7-7" stroke-linecap="round" stroke-linejoin="round"></path>
      </svg>
    </button>
  );
}

export default function BookshelfGrid({
  items,
  framed = true,
}: {
  items: BookshelfItem[];
  framed?: boolean;
}) {
  if (!items.length) return null;

  const containerClass = framed
    ? 'rounded-[1.75rem] border border-[#eadbc3] bg-gradient-to-b from-[#f9f3e7] via-[#f1e6d2] to-[#ebdcc1] px-3 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] sm:px-5 sm:py-6'
    : '';

  return (
    <div class={containerClass}>
      <div class="grid grid-cols-3 gap-x-3 gap-y-6 sm:gap-x-5 sm:gap-y-8">
        {items.map((item) => {
          const meta = READING_TYPE_UI_META[item.readingType];
          const palette = item.dominantPartNumber
            ? partCoverPalette(item.dominantPartNumber)
            : coverPaletteFor(item.readingType, item.title);
          const titleLines = wrapTitleLines(item.title, Boolean(item.meta));

          return (
            <article key={item.key} class="min-w-0">
              <div class="relative mx-auto w-full max-w-[10rem]">
                  <a
                    href={item.href}
                    class={`group relative block aspect-[0.69] overflow-hidden rounded-[14px_14px_10px_10px] border border-black/10 shadow-[0_10px_18px_-12px_rgba(15,23,42,0.55),0_3px_6px_-4px_rgba(15,23,42,0.28)] transition-transform hover:-translate-y-0.5 hover:shadow-[0_12px_20px_-12px_rgba(15,23,42,0.58),0_4px_8px_-4px_rgba(15,23,42,0.22)] ${
                      item.checked ? 'ring-1 ring-black/15' : ''
                    }`}
                    style={{ background: palette.background }}
                  >
                    <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(255,255,255,0.35),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.08),transparent_40%,rgba(15,23,42,0.16))]"></div>
                    <div class="relative flex h-full flex-col px-2.5 pb-2.5 pt-2.5 text-white">
                      <div class="text-[0.48rem] font-sans font-semibold uppercase tracking-[0.22em] text-white/72">
                        {meta.label}
                      </div>
                      <div class="flex min-h-0 flex-1 flex-col pt-2.5">
                        <div class="min-h-0 flex-1 overflow-hidden">
                          <h3 class={`${titleClassFor(item.title, Boolean(item.meta))} space-y-[0.08rem] leading-[1.08] font-serif font-bold tracking-[0.01em] text-white drop-shadow-[0_1px_1px_rgba(15,23,42,0.35)]`}>
                            {titleLines.map((line, index) => (
                              <span key={`${item.key}-line-${index}`} class="block">
                                {line}
                              </span>
                            ))}
                          </h3>
                        </div>
                        {item.meta ? (
                          <div class="pt-1 font-sans text-[0.72rem] font-semibold tracking-[0.01em] text-white/78 sm:text-[0.8rem]">
                            {item.meta}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </a>

                  <div class="absolute left-2 top-0 z-10">
                    <ShelfToggleButton
                      shelved={item.shelved}
                      onToggle={item.onShelvedChange}
                      ariaLabel={item.shelfAriaLabel}
                      compact
                      variant="ribbon"
                      ribbonOffsetClass="-mt-[1px]"
                    />
                  </div>

                  <div class="absolute right-2 top-2 z-10">
                    <DoneToggle
                      checked={item.checked}
                      onCheckedChange={item.onCheckedChange}
                      ariaLabel={item.checkboxAriaLabel}
                    />
                  </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
