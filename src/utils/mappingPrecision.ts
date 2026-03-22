import { normalizeOutlinePath } from './helpers';

export type MappingPrecisionKind =
  | 'exact-path'
  | 'broader-path'
  | 'mapped-paths'
  | 'section-fallback'
  | 'related-topic';

export function classifyMappingPrecision(
  relevantPaths: string[] | undefined,
  selectedOutlinePath?: string | null
): MappingPrecisionKind {
  const normalizedPaths = Array.from(new Set(
    (relevantPaths ?? [])
      .map((path) => normalizeOutlinePath(path))
      .filter(Boolean)
  ));

  if (!selectedOutlinePath) {
    return normalizedPaths.length > 0 ? 'mapped-paths' : 'section-fallback';
  }

  const normalizedSelection = normalizeOutlinePath(selectedOutlinePath);
  if (normalizedPaths.some((path) => path === normalizedSelection)) {
    return 'exact-path';
  }

  if (normalizedPaths.some((path) => (
    normalizedSelection.startsWith(`${path}.`) || path.startsWith(`${normalizedSelection}.`)
  ))) {
    return 'broader-path';
  }

  if (normalizedPaths.length === 0) {
    return 'section-fallback';
  }

  return 'related-topic';
}

export function mappingPrecisionBadge(kind: MappingPrecisionKind): {
  label: string;
  className: string;
} {
  switch (kind) {
    case 'exact-path':
      return {
        label: 'Exact path',
        className: 'border-emerald-100 bg-emerald-50 text-emerald-700',
      };
    case 'broader-path':
      return {
        label: 'Broader path',
        className: 'border-amber-100 bg-amber-50 text-amber-700',
      };
    case 'mapped-paths':
      return {
        label: 'Mapped paths',
        className: 'border-indigo-100 bg-indigo-50 text-indigo-600',
      };
    case 'section-fallback':
      return {
        label: 'Section-level only',
        className: 'border-slate-200 bg-slate-50 text-slate-500',
      };
    case 'related-topic':
    default:
      return {
        label: 'Related topic',
        className: 'border-violet-100 bg-violet-50 text-violet-600',
      };
  }
}

export function subsectionPrecisionSummary(entry: {
  mappedPathCount?: number;
  mappedPathSectionCount?: number;
  fallbackSectionCount?: number;
}): string | null {
  const mappedPathCount = entry.mappedPathCount ?? 0;
  const mappedPathSectionCount = entry.mappedPathSectionCount ?? 0;
  const fallbackSectionCount = entry.fallbackSectionCount ?? 0;

  const parts: string[] = [];
  if (mappedPathCount > 0) {
    parts.push(
      `${mappedPathCount} mapped ${mappedPathCount === 1 ? 'Subsection path' : 'Subsection paths'} in ${mappedPathSectionCount} ${mappedPathSectionCount === 1 ? 'Section' : 'Sections'}`
    );
  }
  if (fallbackSectionCount > 0) {
    parts.push(
      `broader Section coverage in ${fallbackSectionCount} ${fallbackSectionCount === 1 ? 'Section' : 'Sections'}`
    );
  }

  return parts.length > 0 ? parts.join(' · ') : null;
}
