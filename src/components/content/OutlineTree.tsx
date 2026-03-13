import { h } from 'preact';
import { useState } from 'preact/hooks';
import InlineReferenceText from './InlineReferenceText';

export interface OutlineItem {
  level: string;
  levelType: 'major' | 'numeric' | 'lowercase' | 'roman';
  text: string;
  children: OutlineItem[];
}

export interface OutlineTreeProps {
  items: OutlineItem[];
  sectionCode: string;
  baseUrl: string;
  currentHref?: string;
}

/**
 * Renders a recursive outline tree. Top-level (major) items are expanded by default
 * and shown with a prominent badge. Sub-levels are collapsible.
 */
export default function OutlineTree({ items, sectionCode, baseUrl, currentHref }: OutlineTreeProps) {
  return (
    <nav aria-label={`Outline for section ${sectionCode}`} class="font-serif">
      <ul class="space-y-1" role="tree">
        {items.map((item, i) => (
          <OutlineNode
            key={`${sectionCode}-${item.level}-${i}`}
            item={item}
            depth={0}
            baseUrl={baseUrl}
            currentHref={currentHref}
          />
        ))}
      </ul>
    </nav>
  );
}

interface OutlineNodeProps {
  item: OutlineItem;
  depth: number;
  baseUrl: string;
  currentHref?: string;
}

function OutlineNode({ item, depth, baseUrl, currentHref }: OutlineNodeProps) {
  const isMajor = item.levelType === 'major';
  const hasChildren = item.children.length > 0;

  // Major (top-level) items default open; sub-items default closed
  const [isExpanded, setIsExpanded] = useState(isMajor);

  const toggle = () => {
    if (hasChildren) setIsExpanded((prev) => !prev);
  };

  // Indentation depth: each sub-level gets additional left padding
  const indentPx = depth * 20;

  // Badge / level indicator styling per type
  const badgeClasses = isMajor
    ? 'inline-flex items-center justify-center w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 font-mono text-xs font-bold flex-shrink-0'
    : 'inline-flex items-center justify-center w-5 h-5 font-mono text-xs text-gray-500 flex-shrink-0';

  return (
    <li role="treeitem" aria-expanded={hasChildren ? isExpanded : undefined}>
      <div
        class={`flex items-start gap-2 py-1 rounded hover:bg-gray-50 transition-colors ${hasChildren ? 'cursor-pointer' : ''}`}
        style={{ paddingLeft: `${indentPx}px` }}
        onClick={(e) => {
          if ((e.target as HTMLElement | null)?.closest('a')) return;
          toggle();
        }}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        }}
        tabIndex={hasChildren ? 0 : undefined}
        role={hasChildren ? 'button' : undefined}
      >
        {/* Tree line indicator for sub-items */}
        {depth > 0 && (
          <span class="inline-block w-3 flex-shrink-0 text-gray-300 select-none" aria-hidden="true">
            {hasChildren ? (isExpanded ? '\u2514' : '\u251C') : '\u2502'}
          </span>
        )}

        {/* Level badge */}
        <span class={badgeClasses}>{item.level}</span>

        {/* Text */}
        <span class={`${isMajor ? 'font-semibold text-gray-900' : 'text-gray-700'} text-sm leading-snug`}>
          <InlineReferenceText text={item.text} baseUrl={baseUrl} currentHref={currentHref} />
        </span>

        {/* Expand/collapse chevron */}
        {hasChildren && (
          <svg
            class={`h-3.5 w-3.5 mt-0.5 text-gray-400 transform transition-transform duration-150 flex-shrink-0 ${isExpanded ? 'rotate-90' : 'rotate-0'}`}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width={2}
            aria-hidden="true"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        )}
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <ul class="space-y-0.5" role="group">
          {item.children.map((child, i) => (
            <OutlineNode
              key={`${child.level}-${i}`}
              item={child}
              depth={depth + 1}
              baseUrl={baseUrl}
              currentHref={currentHref}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
