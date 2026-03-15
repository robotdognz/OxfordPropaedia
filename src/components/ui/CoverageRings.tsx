import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

export interface CoverageRingsProps {
  rings: { label: string; count: number; total: number; color: string }[];
  size?: number;
  ringWidth?: number;
  hideLegend?: boolean;
}

export default function CoverageRings({ rings, size = 160, ringWidth = 10, hideLegend = false }: CoverageRingsProps) {
  const center = size / 2;
  const gap = 3;
  const [animated, setAnimated] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Trigger animation after mount
    const timer = requestAnimationFrame(() => {
      requestAnimationFrame(() => setAnimated(true));
    });
    return () => cancelAnimationFrame(timer);
  }, []);

  // Re-animate when ring data changes
  useEffect(() => {
    setAnimated(false);
    const timer = requestAnimationFrame(() => {
      requestAnimationFrame(() => setAnimated(true));
    });
    return () => cancelAnimationFrame(timer);
  }, [rings.map(r => r.count).join(',')]);

  return (
    <div ref={ref} class="flex flex-col items-center">
      <svg viewBox={`0 0 ${size} ${size}`} class="w-28 h-28 sm:w-32 sm:h-32">
        {rings.map((ring, i) => {
          const radius = center - ringWidth / 2 - i * (ringWidth + gap);
          const circumference = 2 * Math.PI * radius;
          const fraction = ring.total > 0 ? ring.count / ring.total : 0;
          const dashLength = fraction * circumference;

          return (
            <g key={ring.label}>
              {/* Background track */}
              <circle
                cx={center} cy={center} r={radius}
                fill="none" stroke="#f1f5f9" stroke-width={ringWidth}
              />
              {/* Animated arc */}
              <circle
                cx={center} cy={center} r={radius}
                fill="none"
                stroke={ring.color}
                stroke-width={ringWidth}
                stroke-linecap="round"
                stroke-dasharray={`${circumference} ${circumference}`}
                stroke-dashoffset={animated ? circumference - dashLength : circumference}
                style={{
                  transform: 'rotate(-90deg)',
                  transformOrigin: `${center}px ${center}px`,
                  transition: 'stroke-dashoffset 0.8s ease-out',
                }}
              />
            </g>
          );
        })}
      </svg>
      {!hideLegend && (
        <div class="mt-3 space-y-1">
          {rings.map((ring) => (
            <div key={ring.label} class="flex items-center gap-2 text-xs text-gray-500">
              <span class="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: ring.color }} />
              <span>{ring.label}: {ring.count}/{ring.total}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
