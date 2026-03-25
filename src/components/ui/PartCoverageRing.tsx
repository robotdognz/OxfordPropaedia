import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { PartCoverageSegment } from '../../utils/readingLibrary';

export interface PartCoverageRingProps {
  segments: PartCoverageSegment[];
  size?: number;
  innerRadius?: number;
  outerRadius?: number;
  gapDegrees?: number;
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/**
 * Donut-slice path with semicircular end caps.
 * Cap radius = half the ring thickness, drawn as arcs connecting
 * inner and outer edges at each end of the segment.
 */
function roundedSegmentPath(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  startDeg: number,
  endDeg: number,
): string {
  const sweep = endDeg - startDeg;
  if (sweep <= 0.01) return '';

  const thickness = outerR - innerR;
  const capR = thickness / 2;
  const outerInsetDeg = (capR / outerR) * (180 / Math.PI);
  const innerInsetDeg = (capR / innerR) * (180 / Math.PI);

  // If too narrow for caps, draw without rounding
  if (sweep < (outerInsetDeg + innerInsetDeg) * 2) {
    const largeArc = sweep > 180 ? 1 : 0;
    const oS = polar(cx, cy, outerR, startDeg);
    const oE = polar(cx, cy, outerR, endDeg);
    const iE = polar(cx, cy, innerR, endDeg);
    const iS = polar(cx, cy, innerR, startDeg);
    return `M ${oS.x} ${oS.y} A ${outerR} ${outerR} 0 ${largeArc} 1 ${oE.x} ${oE.y} L ${iE.x} ${iE.y} A ${innerR} ${innerR} 0 ${largeArc} 0 ${iS.x} ${iS.y} Z`;
  }

  // Inset points for the main arcs
  const oS = polar(cx, cy, outerR, startDeg + outerInsetDeg);
  const oE = polar(cx, cy, outerR, endDeg - outerInsetDeg);
  const iS = polar(cx, cy, innerR, startDeg + innerInsetDeg);
  const iE = polar(cx, cy, innerR, endDeg - innerInsetDeg);

  const outerSweep = sweep - 2 * outerInsetDeg;
  const innerSweep = sweep - 2 * innerInsetDeg;

  return [
    // Start at inner-start, cap arc to outer-start
    `M ${iS.x} ${iS.y}`,
    `A ${capR} ${capR} 0 0 1 ${oS.x} ${oS.y}`,
    // Outer arc to outer-end
    `A ${outerR} ${outerR} 0 ${outerSweep > 180 ? 1 : 0} 1 ${oE.x} ${oE.y}`,
    // End cap arc to inner-end
    `A ${capR} ${capR} 0 0 1 ${iE.x} ${iE.y}`,
    // Inner arc back to inner-start
    `A ${innerR} ${innerR} 0 ${innerSweep > 180 ? 1 : 0} 0 ${iS.x} ${iS.y}`,
    'Z',
  ].join(' ');
}

let idCounter = 0;

export default function PartCoverageRing({
  segments,
  size = 100,
  innerRadius,
  outerRadius,
  gapDegrees = 3,
}: PartCoverageRingProps) {
  const [animated, setAnimated] = useState(false);
  const [clipId] = useState(() => `pcr-${++idCounter}`);

  const cx = size / 2;
  const cy = size / 2;
  const oR = outerRadius ?? size / 2 - 1;
  const iR = innerRadius ?? oR * 0.55;
  const segmentCount = segments.length || 10;
  const segDeg = 360 / segmentCount;
  const halfGap = gapDegrees / 2;

  useEffect(() => {
    setAnimated(false);
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setAnimated(true));
    });
    return () => cancelAnimationFrame(id);
  }, [segments.map((s) => s.fraction).join(',')]);

  return (
    <svg viewBox={`0 0 ${size} ${size}`} class="w-28 h-28 sm:w-32 sm:h-32">
      <defs>
        {segments.map((seg, i) => {
          // Clip circle: radius grows from innerR (empty) to outerR (full)
          const fillR = animated ? iR + seg.fraction * (oR - iR) : iR;
          return (
            <clipPath key={i} id={`${clipId}-${i}`}>
              <circle
                cx={cx}
                cy={cy}
                r={fillR}
                style={{
                  transition: 'r 0.8s ease-out',
                }}
              />
            </clipPath>
          );
        })}
      </defs>

      {segments.map((seg, i) => {
        const startDeg = i * segDeg + halfGap;
        const endDeg = (i + 1) * segDeg - halfGap;
        const segPath = roundedSegmentPath(cx, cy, iR, oR, startDeg, endDeg);

        return (
          <g key={seg.partNumber}>
            {/* Background track — rounded, low opacity */}
            <path
              d={segPath}
              fill={seg.colorHex}
              fill-opacity="0.14"
            />
            {/* Fill — same shape, clipped by expanding circle from center */}
            <path
              d={segPath}
              fill={seg.colorHex}
              fill-opacity="0.85"
              clip-path={`url(#${clipId}-${i})`}
            />
          </g>
        );
      })}
    </svg>
  );
}
