import { h, type ComponentChildren } from 'preact';
import { useRef, useState, useEffect, useCallback } from 'preact/hooks';

interface HorizontalCardScrollProps {
  children: ComponentChildren;
  cardMinWidth?: number;
}

const DRAG_THRESHOLD = 5;

export default function HorizontalCardScroll({
  children,
  cardMinWidth = 280,
}: HorizontalCardScrollProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [cardWidth, setCardWidth] = useState(cardMinWidth);

  const updateArrows = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  // Measure container and set card width responsively
  const [edgePad, setEdgePad] = useState(0);

  const updateCardWidth = useCallback(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const available = wrapper.clientWidth;
    const cw = Math.min(cardMinWidth, available - 12);
    setCardWidth(cw);
    // Add centering padding only if doing so results in exactly one card visible
    // (i.e. the gap between cards fills or exceeds the remaining space after centering)
    const GAP = 16;
    const halfPad = (available - cw) / 2;
    const secondCardPeeks = GAP < halfPad;
    const pad = secondCardPeeks ? 0 : Math.max(0, Math.floor(halfPad));
    setEdgePad(pad);
  }, [cardMinWidth]);

  useEffect(() => {
    const el = scrollRef.current;
    const wrapper = wrapperRef.current;
    if (!el || !wrapper) return;

    updateArrows();
    updateCardWidth();

    el.addEventListener('scroll', updateArrows, { passive: true });
    const ro = new ResizeObserver(() => {
      updateArrows();
      updateCardWidth();
    });
    ro.observe(wrapper);

    return () => {
      el.removeEventListener('scroll', updateArrows);
      ro.disconnect();
    };
  }, [updateArrows, updateCardWidth, children]);

  // Touch/mouse drag scrolling
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let pointerId: number | null = null;
    let startX = 0;
    let scrollStart = 0;
    let hasDragged = false;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest('a, button, input, label, select, textarea')) return;
      pointerId = e.pointerId;
      startX = e.clientX;
      scrollStart = el.scrollLeft;
      hasDragged = false;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (pointerId === null || e.pointerId !== pointerId) return;
      const dx = e.clientX - startX;
      if (!hasDragged && Math.abs(dx) < DRAG_THRESHOLD) return;
      if (!hasDragged) {
        hasDragged = true;
        el.setPointerCapture(e.pointerId);
        el.style.scrollBehavior = 'auto';
        el.style.cursor = 'grabbing';
      }
      el.scrollLeft = scrollStart - dx;
    };

    const onPointerUp = (e: PointerEvent) => {
      if (pointerId === null || e.pointerId !== pointerId) return;
      if (hasDragged) {
        el.releasePointerCapture(e.pointerId);
        el.style.scrollBehavior = '';
        el.style.cursor = '';
      }
      pointerId = null;
      hasDragged = false;
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);

    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
    };
  }, []);

  const scroll = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;

    const cards = Array.from(el.children) as HTMLElement[];
    if (cards.length === 0) return;

    const viewCenter = el.scrollLeft + el.clientWidth / 2;

    let anchorIdx = 0;
    let anchorDist = Infinity;
    cards.forEach((card, i) => {
      const cc = card.offsetLeft + card.offsetWidth / 2;
      const d = Math.abs(cc - viewCenter);
      if (d < anchorDist) { anchorDist = d; anchorIdx = i; }
    });

    const anchorCenter = cards[anchorIdx].offsetLeft + cards[anchorIdx].offsetWidth / 2;
    const alreadyCentered = Math.abs(anchorCenter - viewCenter) < 10;

    let targetIdx: number;
    if (alreadyCentered) {
      targetIdx = direction === 'right'
        ? Math.min(anchorIdx + 1, cards.length - 1)
        : Math.max(anchorIdx - 1, 0);
    } else {
      if (direction === 'right' && anchorCenter > viewCenter) {
        targetIdx = anchorIdx;
      } else if (direction === 'left' && anchorCenter < viewCenter) {
        targetIdx = anchorIdx;
      } else {
        targetIdx = direction === 'right'
          ? Math.min(anchorIdx + 1, cards.length - 1)
          : Math.max(anchorIdx - 1, 0);
      }
    }

    const max = el.scrollWidth - el.clientWidth;

    let scrollTarget: number;
    if (targetIdx === 0) {
      scrollTarget = 0;
    } else if (targetIdx === cards.length - 1) {
      scrollTarget = max;
    } else {
      const card = cards[targetIdx];
      const cc = card.offsetLeft + card.offsetWidth / 2;
      scrollTarget = Math.max(0, Math.min(cc - el.clientWidth / 2, max));
    }

    el.scrollTo({
      left: scrollTarget,
      behavior: 'smooth',
    });
  };

  return (
    <div ref={wrapperRef} class="relative">
      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scroll('left')}
          class="absolute -left-3 top-1/2 z-10 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white/90 shadow-lg text-gray-500 hover:text-gray-700 hover:bg-white transition-colors sm:-left-5"
          aria-label="Scroll left"
        >
          <svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width={2}>
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}
      {canScrollRight && (
        <button
          type="button"
          onClick={() => scroll('right')}
          class="absolute -right-3 top-1/2 z-10 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white/90 shadow-lg text-gray-500 hover:text-gray-700 hover:bg-white transition-colors sm:-right-5"
          aria-label="Scroll right"
        >
          <svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width={2}>
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}
      <div
        ref={scrollRef}
        class="flex gap-4 overflow-x-auto scroll-smooth pb-2 touch-pan-x"
        style={{ scrollbarWidth: 'thin', paddingLeft: `${edgePad}px`, paddingRight: `${edgePad}px` }}
      >
        {Array.isArray(children) ? children.map((child, i) => (
          <div key={i} class="shrink-0" style={{ width: `${cardWidth}px` }}>
            {child}
          </div>
        )) : (
          <div class="shrink-0" style={{ width: `${cardWidth}px` }}>
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
