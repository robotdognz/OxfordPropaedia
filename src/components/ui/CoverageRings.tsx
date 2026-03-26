import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

export interface CoverageRingsProps {
  rings: { label: string; count: number; total: number; color: string }[];
  size?: number;
  ringWidth?: number;
  hideLegend?: boolean;
  activeRingLabel?: string;
  onSelectRing?: (label: string) => void;
}

export default function CoverageRings({
  rings,
  size = 160,
  ringWidth = 10,
  hideLegend = false,
  activeRingLabel,
  onSelectRing,
}: CoverageRingsProps) {
  const center = size / 2;
  const gap = 3;
  const activeRingWidthBoost = 2;
  const outerEdgeInset = 1;
  const geometryTransition = 'r 180ms ease, stroke-width 180ms ease, stroke 180ms ease, stroke-opacity 180ms ease';
  const [animated, setAnimated] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // Track which rings should hide their arc (after transition to zero completes)
  const [hiddenArcs, setHiddenArcs] = useState<Set<string>>(new Set());
  const hideTimers = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    // Trigger animation after mount — subsequent data changes
    // transition smoothly via CSS without resetting to zero
    const timer = requestAnimationFrame(() => {
      requestAnimationFrame(() => setAnimated(true));
    });
    return () => cancelAnimationFrame(timer);
  }, []);

  // When a ring's fraction goes to 0, delay hiding it until the CSS transition finishes
  useEffect(() => {
    rings.forEach((ring) => {
      const fraction = ring.total > 0 ? ring.count / ring.total : 0;
      const existing = hideTimers.current.get(ring.label);

      if (fraction > 0) {
        // Show immediately
        if (existing) { clearTimeout(existing); hideTimers.current.delete(ring.label); }
        setHiddenArcs((prev) => { if (!prev.has(ring.label)) return prev; const next = new Set(prev); next.delete(ring.label); return next; });
      } else if (!hiddenArcs.has(ring.label) && !existing) {
        // Delay hide until after the 0.8s transition
        const id = window.setTimeout(() => {
          hideTimers.current.delete(ring.label);
          setHiddenArcs((prev) => new Set(prev).add(ring.label));
        }, 850);
        hideTimers.current.set(ring.label, id);
      }
    });
  }, [rings.map(r => `${r.label}:${r.count}/${r.total}`).join(',')]);

  const ringWidths = rings.map((ring) =>
    ring.label === activeRingLabel ? ringWidth + activeRingWidthBoost : ringWidth
  );
  const radii: number[] = [];
  rings.forEach((_, index) => {
    if (index === 0) {
      radii.push(center - outerEdgeInset - ringWidths[index] / 2);
      return;
    }

    radii.push(
      radii[index - 1] - ringWidths[index - 1] / 2 - gap - ringWidths[index] / 2
    );
  });

  function ringLabelForPointer(clientX: number, clientY: number): string | null {
    const svg = ref.current?.querySelector('svg');
    if (!(svg instanceof SVGSVGElement)) return null;

    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    const localX = ((clientX - rect.left) / rect.width) * size;
    const localY = ((clientY - rect.top) / rect.height) * size;
    const distance = Math.hypot(localX - center, localY - center);

    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;

    rings.forEach((_, index) => {
      const width = ringWidths[index];
      const radius = radii[index];
      const halfBand = width / 2 + gap / 2;
      const delta = Math.abs(distance - radius);
      if (delta <= halfBand && delta < bestDistance) {
        bestDistance = delta;
        bestIndex = index;
      }
    });

    return bestIndex >= 0 ? rings[bestIndex].label : null;
  }

  function updateSelectedRing(clientX: number, clientY: number) {
    if (!onSelectRing) return;
    const label = ringLabelForPointer(clientX, clientY);
    if (label) onSelectRing(label);
  }

  return (
    <div ref={ref} class="flex flex-col items-center">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        class={`w-28 h-28 sm:w-32 sm:h-32 ${onSelectRing ? 'cursor-pointer touch-none' : ''}`}
        onPointerDown={(event) => {
          if (!onSelectRing) return;
          const target = event.currentTarget as SVGSVGElement;
          target.setPointerCapture(event.pointerId);
          updateSelectedRing(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          if (!onSelectRing || (event.buttons & 1) !== 1) return;
          updateSelectedRing(event.clientX, event.clientY);
        }}
      >
        {rings.map((ring, i) => {
          const radius = radii[i];
          const width = ringWidths[i];
          const fraction = ring.total > 0 ? ring.count / ring.total : 0;
          const isActive = ring.label === activeRingLabel;

          return (
            <g key={ring.label}>
              {/* Background track */}
              <circle
                cx={center} cy={center} r={radius}
                fill="none"
                stroke={isActive ? '#cbd5e1' : '#e2e8f0'}
                stroke-opacity={isActive ? '0.78' : '0.72'}
                stroke-width={width}
                style={{
                  transition: geometryTransition,
                }}
              />
              {/* Animated arc — hidden after transition completes at zero to prevent round-cap dot on mobile */}
              <circle
                cx={center} cy={center} r={radius}
                fill="none"
                pathLength={1}
                stroke={ring.color}
                stroke-opacity={hiddenArcs.has(ring.label) ? '0' : (isActive ? '1' : '0.82')}
                stroke-width={width}
                stroke-linecap="round"
                stroke-dasharray="1 1"
                stroke-dashoffset={animated ? 1 - fraction : 1}
                style={{
                  transform: 'rotate(-90deg)',
                  transformOrigin: `${center}px ${center}px`,
                  transition: `stroke-dashoffset 0.8s ease-out, ${geometryTransition}`,
                }}
              />
            </g>
          );
        })}
      </svg>
      {!hideLegend && (
        <div class="mt-3 space-y-1">
          {rings.map((ring) => (
            <div
              key={ring.label}
              class={`flex items-center gap-2 text-xs ${
                ring.label === activeRingLabel ? 'font-medium text-gray-700' : 'text-gray-500'
              }`}
              onClick={() => onSelectRing?.(ring.label)}
            >
              <span class="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: ring.color }} />
              <span>{ring.label}: {ring.count}/{ring.total}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
