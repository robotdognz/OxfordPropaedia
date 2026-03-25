import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { PartCoverageSegment } from '../../utils/readingLibrary';

export interface PartCoverageRingProps {
  segments: PartCoverageSegment[];
  size?: number;
  innerRadius?: number;
  outerRadius?: number;
  gapPx?: number;
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/**
 * Convert a pixel gap to an angular inset at a given radius.
 * Half the gap on each side, so the total gap between adjacent segments = gapPx.
 */
function gapInsetDeg(halfGapPx: number, radius: number): number {
  return (halfGapPx / radius) * (180 / Math.PI);
}

/**
 * Donut-slice path with semicircular end caps and parallel-edge gaps.
 * The gap is specified in pixels so inner and outer edges stay parallel.
 */
function roundedSegmentPath(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  centerDeg: number,
  segDeg: number,
  halfGapPx: number,
): string {
  // Compute per-radius angular insets for parallel gaps
  const outerGapDeg = gapInsetDeg(halfGapPx, outerR);
  const innerGapDeg = gapInsetDeg(halfGapPx, innerR);

  const outerStart = centerDeg - segDeg / 2 + outerGapDeg;
  const outerEnd = centerDeg + segDeg / 2 - outerGapDeg;
  const innerStart = centerDeg - segDeg / 2 + innerGapDeg;
  const innerEnd = centerDeg + segDeg / 2 - innerGapDeg;

  const outerSweep = outerEnd - outerStart;
  const innerSweep = innerEnd - innerStart;
  if (outerSweep <= 0.01 || innerSweep <= 0.01) return '';

  const thickness = outerR - innerR;
  const capR = thickness / 2;
  const capInsetOuter = (capR / outerR) * (180 / Math.PI);
  const capInsetInner = (capR / innerR) * (180 / Math.PI);

  // If too narrow for caps, draw without rounding
  if (outerSweep < capInsetOuter * 2.5 || innerSweep < capInsetInner * 2.5) {
    const oS = polar(cx, cy, outerR, outerStart);
    const oE = polar(cx, cy, outerR, outerEnd);
    const iE = polar(cx, cy, innerR, innerEnd);
    const iS = polar(cx, cy, innerR, innerStart);
    return [
      `M ${oS.x} ${oS.y}`,
      `A ${outerR} ${outerR} 0 ${outerSweep > 180 ? 1 : 0} 1 ${oE.x} ${oE.y}`,
      `L ${iE.x} ${iE.y}`,
      `A ${innerR} ${innerR} 0 ${innerSweep > 180 ? 1 : 0} 0 ${iS.x} ${iS.y}`,
      'Z',
    ].join(' ');
  }

  // Inset points for rounded caps
  const oS = polar(cx, cy, outerR, outerStart + capInsetOuter);
  const oE = polar(cx, cy, outerR, outerEnd - capInsetOuter);
  const iS = polar(cx, cy, innerR, innerStart + capInsetInner);
  const iE = polar(cx, cy, innerR, innerEnd - capInsetInner);

  const mainOuterSweep = outerSweep - 2 * capInsetOuter;
  const mainInnerSweep = innerSweep - 2 * capInsetInner;

  return [
    `M ${iS.x} ${iS.y}`,
    `A ${capR} ${capR} 0 0 1 ${oS.x} ${oS.y}`,
    `A ${outerR} ${outerR} 0 ${mainOuterSweep > 180 ? 1 : 0} 1 ${oE.x} ${oE.y}`,
    `A ${capR} ${capR} 0 0 1 ${iE.x} ${iE.y}`,
    `A ${innerR} ${innerR} 0 ${mainInnerSweep > 180 ? 1 : 0} 0 ${iS.x} ${iS.y}`,
    'Z',
  ].join(' ');
}

let idCounter = 0;

export default function PartCoverageRing({
  segments,
  size = 100,
  innerRadius,
  outerRadius,
  gapPx = 2.5,
}: PartCoverageRingProps) {
  const [animated, setAnimated] = useState(false);
  const [clipId] = useState(() => `pcr-${++idCounter}`);

  const cx = size / 2;
  const cy = size / 2;
  const oR = outerRadius ?? size / 2 - 1;
  const iR = innerRadius ?? oR * 0.55;
  const segmentCount = segments.length || 10;
  const segDeg = 360 / segmentCount;
  const halfGapPx = gapPx / 2;

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
        const centerDeg = (i + 0.5) * segDeg;
        const segPath = roundedSegmentPath(cx, cy, iR, oR, centerDeg, segDeg, halfGapPx);

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
