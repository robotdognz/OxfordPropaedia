import { h, type ComponentChildren } from 'preact';

interface ReadingLibraryStatisticsAccordionProps {
  totalLabel: string;
  totalCount: number;
  totalDescription: string;
  completedCount: number;
  completedDescription: string;
}

function StatBlock({
  label,
  value,
}: {
  label: string;
  value: ComponentChildren;
}) {
  return (
    <div class="min-w-0">
      <p class="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p class="mt-1 font-serif text-2xl leading-none text-slate-900 sm:text-[2rem]">{value}</p>
    </div>
  );
}

export default function ReadingLibraryStatisticsAccordion({
  totalLabel,
  totalCount,
  totalDescription,
  completedCount,
  completedDescription,
}: ReadingLibraryStatisticsAccordionProps) {
  return (
    <section class="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm shadow-slate-200/40 sm:px-5">
      <div class="grid grid-cols-2 gap-4">
        <StatBlock
          label={totalLabel}
          value={totalCount}
        />
        <StatBlock
          label="Checked Off"
          value={completedCount}
        />
      </div>
      <div class="sr-only">
        <StatBlock
          label={totalLabel}
          value={totalCount}
        />
        <StatBlock
          label="Checked Off"
          value={completedCount}
        />
        <p>{totalDescription}</p>
        <p>{completedDescription}</p>
      </div>
    </section>
  );
}
