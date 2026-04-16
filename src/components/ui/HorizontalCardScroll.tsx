import { h, type ComponentChildren } from 'preact';
import { useRef, useState, useEffect, useCallback, useLayoutEffect } from 'preact/hooks';

interface HorizontalCardScrollProps {
  children: ComponentChildren;
  cardMinWidth?: number;
  singleCardOnMobile?: boolean;
  resetKey?: string;
}

const DRAG_THRESHOLD = 5;
const MOBILE_BREAKPOINT = 540;
const MOBILE_CARD_GUTTER = 12;

export default function HorizontalCardScroll({
  children,
  cardMinWidth = 280,
  singleCardOnMobile = false,
  resetKey,
}: HorizontalCardScrollProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [cardWidth, setCardWidth] = useState(cardMinWidth);
  const [thumbLeft, setThumbLeft] = useState(0);
  const [thumbWidth, setThumbWidth] = useState(100);

  const updateArrows = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    // Update custom scrollbar thumb
    const ratio = el.clientWidth / el.scrollWidth;
    setThumbWidth(Math.max(ratio * 100, 10));
    const scrollFraction = el.scrollWidth > el.clientWidth
      ? el.scrollLeft / (el.scrollWidth - el.clientWidth)
      : 0;
    setThumbLeft(scrollFraction * (100 - ratio * 100));
  }, []);

  // Measure container and set card width responsively
  const [edgePad, setEdgePad] = useState(0);

  const updateCardWidth = useCallback(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const available = wrapper.clientWidth;
    const isSingleCardMobile = singleCardOnMobile && available < MOBILE_BREAKPOINT;
    if (isSingleCardMobile) {
      const inset = Math.max(0, Math.floor(MOBILE_CARD_GUTTER / 2));
      const cw = Math.max(0, available - MOBILE_CARD_GUTTER);
      setCardWidth(cw);
      setEdgePad(inset);
      return;
    }

    setCardWidth(Math.max(0, Math.min(cardMinWidth, available - 12)));
    setEdgePad(0);
  }, [cardMinWidth, singleCardOnMobile]);

  useLayoutEffect(() => {
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

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const resetScroll = () => {
      const current = scrollRef.current;
      if (!current) return;
      current.scrollTo({ left: 0, behavior: 'auto' });
      updateArrows();
    };

    resetScroll();
    const frame = requestAnimationFrame(() => {
      resetScroll();
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [resetKey, updateArrows]);

  // Touch/mouse drag scrolling
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let pointerId: number | null = null;
    let startX = 0;
    let scrollStart = 0;
    let hasDragged = false;

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
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
        class="hcs-noscroll flex gap-4 overflow-x-auto scroll-smooth touch-auto"
        style={{
          scrollbarWidth: 'none',
          paddingLeft: `${edgePad}px`,
          paddingRight: `${edgePad}px`,
          WebkitOverflowScrolling: 'touch',
          overflowAnchor: 'none',
        }}
      >
        <style>{`.hcs-noscroll::-webkit-scrollbar { display: none; }`}</style>
        {Array.isArray(children) ? children.map((child, i) => (
          <div key={i} class="shrink-0 [&>*]:h-full" style={{ width: `${cardWidth}px` }}>
            {child}
          </div>
        )) : (
          <div class="shrink-0 [&>*]:h-full" style={{ width: `${cardWidth}px` }}>
            {children}
          </div>
        )}
      </div>
      {thumbWidth < 100 && (
        <div class="mt-4 h-1 rounded-full bg-gray-200/70" style={{ marginLeft: `${edgePad}px`, marginRight: `${edgePad}px` }}>
          <div
            class="h-full rounded-full bg-gray-400/60 transition-[left,width] duration-150"
            style={{ width: `${thumbWidth}%`, marginLeft: `${thumbLeft}%` }}
          />
        </div>
      )}
    </div>
  );
}
