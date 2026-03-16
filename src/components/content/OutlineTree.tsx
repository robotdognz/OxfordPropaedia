import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import InlineReferenceText from './InlineReferenceText';
import { OUTLINE_VSI_SELECT_EVENT, type OutlineSelectionDetail } from '../../utils/vsiOutlineFilter';
import { outlineAnchorId } from '../../utils/helpers';

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
  useEffect(() => {
    const highlightTimers = new WeakMap<HTMLElement, number>();

    const flashTarget = (target: HTMLElement) => {
      const existingTimer = highlightTimers.get(target);
      if (existingTimer) {
        window.clearTimeout(existingTimer);
      }

      target.classList.remove('outline-target-flash');
      void target.offsetWidth;
      target.classList.add('outline-target-flash');

      const timer = window.setTimeout(() => {
        target.classList.remove('outline-target-flash');
        highlightTimers.delete(target);
      }, 2200);

      highlightTimers.set(target, timer);
    };

    const scrollToHashTarget = (behavior: ScrollBehavior = 'auto') => {
      const hash = decodeURIComponent(window.location.hash.replace(/^#/, ''));
      if (!hash) return;

      const scroll = () => {
        const target = document.getElementById(hash);
        if (target instanceof HTMLElement) {
          target.scrollIntoView({ behavior, block: 'start' });
          flashTarget(target);
        }
      };

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(scroll);
      });

      // Give nested outline branches time to expand after hydration.
      window.setTimeout(scroll, 80);
    };

    scrollToHashTarget();

    const handleHashChange = () => scrollToHashTarget('smooth');
    window.addEventListener('hashchange', handleHashChange);

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  return (
    <nav aria-label={`Outline for section ${sectionCode}`} class="font-serif">
      <ul class="space-y-1" role="tree">
        {items.map((item, i) => (
          <OutlineNode
            key={`${sectionCode}-${item.level}-${i}`}
            item={item}
            sectionCode={sectionCode}
            depth={0}
            baseUrl={baseUrl}
            currentHref={currentHref}
            pathSegments={[]}
          />
        ))}
      </ul>
    </nav>
  );
}

interface OutlineNodeProps {
  item: OutlineItem;
  sectionCode: string;
  depth: number;
  baseUrl: string;
  currentHref?: string;
  pathSegments: string[];
}

function OutlineNode({ item, sectionCode, depth, baseUrl, currentHref, pathSegments }: OutlineNodeProps) {
  const isMajor = item.levelType === 'major';
  const hasChildren = item.children.length > 0;
  const outlinePath = [...pathSegments, item.level].join('.');
  const anchorId = outlineAnchorId(sectionCode, outlinePath);
  const nodeRef = useRef<HTMLLIElement>(null);

  // Major (top-level) items default open; sub-items default closed
  const [isExpanded, setIsExpanded] = useState(isMajor);

  useEffect(() => {
    if (!hasChildren) return;

    const expandForHashTarget = () => {
      const hash = decodeURIComponent(window.location.hash.replace(/^#/, ''));
      if (!hash) return;

      const target = document.getElementById(hash);
      if (target && nodeRef.current?.contains(target)) {
        setIsExpanded(true);
      }
    };

    expandForHashTarget();
    window.addEventListener('hashchange', expandForHashTarget);

    return () => {
      window.removeEventListener('hashchange', expandForHashTarget);
    };
  }, [hasChildren]);

  const toggle = () => {
    if (hasChildren) setIsExpanded((prev) => !prev);
  };

  const selectOutlineItem = (event?: MouseEvent | KeyboardEvent) => {
    if ((event?.target as HTMLElement | null)?.closest('a, button')) return;
    if (typeof document === 'undefined') return;

    function collectChildrenText(items: OutlineItem[]): string[] {
      const texts: string[] = [];
      for (const child of items) {
        if (child.text) texts.push(child.text);
        texts.push(...collectChildrenText(child.children || []));
      }
      return texts;
    }

    const detail: OutlineSelectionDetail = {
      sectionCode,
      outlinePath,
      text: item.text,
      childrenText: collectChildrenText(item.children || []),
    };

    document.dispatchEvent(new CustomEvent<OutlineSelectionDetail>(OUTLINE_VSI_SELECT_EVENT, { detail }));
  };

  // Indentation depth: each sub-level gets additional left padding
  const indentPx = depth * 20;

  // Badge / level indicator styling per type
  const badgeClasses = isMajor
    ? 'inline-flex items-center justify-center w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 font-mono text-xs font-bold flex-shrink-0'
    : 'inline-flex items-center justify-center w-5 h-5 font-mono text-xs text-gray-500 flex-shrink-0';

  return (
    <li ref={nodeRef} role="treeitem" aria-expanded={hasChildren ? isExpanded : undefined}>
      <div
        id={anchorId}
        class="flex items-start gap-2 py-1 rounded scroll-mt-24 hover:bg-gray-50 transition-colors"
        style={{ paddingLeft: `${indentPx}px` }}
      >
        {/* Tree line indicator for sub-items */}
        {depth > 0 && (
          <span class="inline-block w-3 flex-shrink-0 text-gray-300 select-none" aria-hidden="true">
            {hasChildren ? (isExpanded ? '\u2514' : '\u251C') : '\u2502'}
          </span>
        )}

        <div
          class="flex min-w-0 flex-1 items-start gap-2 rounded-md px-1 py-0.5 transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-300 cursor-pointer"
          onClick={(event) => selectOutlineItem(event)}
          onKeyDown={(event: KeyboardEvent) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              selectOutlineItem(event);
            }

            if (hasChildren && event.key === 'ArrowRight') {
              event.preventDefault();
              setIsExpanded(true);
            }

            if (hasChildren && event.key === 'ArrowLeft') {
              event.preventDefault();
              setIsExpanded(false);
            }
          }}
          tabIndex={0}
          role="button"
          aria-label={`Show Oxford VSI recommendations for ${outlinePath}`}
        >
          {/* Level badge */}
          <span class={badgeClasses}>{item.level}</span>

          {/* Text */}
          <span class={`${isMajor ? 'font-semibold text-gray-900' : 'text-gray-700'} min-w-0 text-sm leading-snug`}>
            <InlineReferenceText text={item.text} baseUrl={baseUrl} currentHref={currentHref} />
          </span>
        </div>

        {/* Expand/collapse chevron */}
        {hasChildren && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              toggle();
            }}
            class="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} outline item ${outlinePath}`}
          >
            <svg
              class={`h-3.5 w-3.5 transform transition-transform duration-150 ${isExpanded ? 'rotate-90' : 'rotate-0'}`}
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width={2}
              aria-hidden="true"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>

      {/* Children */}
      {hasChildren && (
        <ul class={isExpanded ? 'space-y-0.5' : 'hidden space-y-0.5'} role="group">
          {item.children.map((child, i) => (
            <OutlineNode
              key={`${child.level}-${i}`}
              item={child}
              sectionCode={sectionCode}
              depth={depth + 1}
              baseUrl={baseUrl}
              currentHref={currentHref}
              pathSegments={[...pathSegments, item.level]}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
