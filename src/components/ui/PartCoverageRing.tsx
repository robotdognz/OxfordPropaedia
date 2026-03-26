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
 * Point on circle of radius r where a line parallel to the boundary radial
 * (offset by offsetPx perpendicular to it) intersects.
 * This gives truly parallel gap edges with constant pixel width.
 */
/**
 * Compute the angle on a circle of radius r where a line parallel to the
 * boundary radial (offset by offsetPx perpendicular to it) intersects.
 * Positive offset = clockwise from the radial.
 */
function offsetAngleDeg(r: number, boundaryDeg: number, offsetPx: number): number {
  // For small offsets relative to radius, asin gives the angular shift
  return boundaryDeg + Math.asin(Math.min(1, Math.max(-1, offsetPx / r))) * (180 / Math.PI);
}

/**
 * Donut-slice path with four subtly rounded corners and truly parallel gap edges.
 * Edge lines are perpendicular offsets from boundary radials, giving constant-width gaps.
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
  const startBoundary = centerDeg - segDeg / 2;
  const endBoundary = centerDeg + segDeg / 2;

  // Angles on each circle where the parallel-offset edge intersects
  const oStartDeg = offsetAngleDeg(outerR, startBoundary, halfGapPx);
  const oEndDeg = offsetAngleDeg(outerR, endBoundary, -halfGapPx);
  const iStartDeg = offsetAngleDeg(innerR, startBoundary, halfGapPx);
  const iEndDeg = offsetAngleDeg(innerR, endBoundary, -halfGapPx);

  const outerSweep = oEndDeg - oStartDeg;
  const innerSweep = iEndDeg - iStartDeg;
  if (outerSweep <= 0.01 || innerSweep <= 0.01) return '';

  // Corner points
  const pOS = polar(cx, cy, outerR, oStartDeg);
  const pOE = polar(cx, cy, outerR, oEndDeg);
  const pIS = polar(cx, cy, innerR, iStartDeg);
  const pIE = polar(cx, cy, innerR, iEndDeg);

  const thickness = outerR - innerR;
  const cr = Math.min(thickness * 0.15, 2);
  const crODeg = (cr / outerR) * (180 / Math.PI);
  const crIDeg = (cr / innerR) * (180 / Math.PI);

  // Too narrow for rounding — sharp corners
  if (outerSweep < crODeg * 4) {
    return [
      `M ${pIS.x} ${pIS.y}`,
      `L ${pOS.x} ${pOS.y}`,
      `A ${outerR} ${outerR} 0 ${outerSweep > 180 ? 1 : 0} 1 ${pOE.x} ${pOE.y}`,
      `L ${pIE.x} ${pIE.y}`,
      `A ${innerR} ${innerR} 0 ${innerSweep > 180 ? 1 : 0} 0 ${pIS.x} ${pIS.y}`,
      'Z',
    ].join(' ');
  }

  // Arc endpoints inset from corners for rounding
  const oS = polar(cx, cy, outerR, oStartDeg + crODeg);
  const oE = polar(cx, cy, outerR, oEndDeg - crODeg);
  const iS = polar(cx, cy, innerR, iStartDeg + crIDeg);
  const iE = polar(cx, cy, innerR, iEndDeg - crIDeg);

  // Points on the straight edges, inset radially from corners
  const edgeStartOuter = polar(cx, cy, outerR - cr, offsetAngleDeg(outerR - cr, startBoundary, halfGapPx));
  const edgeStartInner = polar(cx, cy, innerR + cr, offsetAngleDeg(innerR + cr, startBoundary, halfGapPx));
  const edgeEndOuter = polar(cx, cy, outerR - cr, offsetAngleDeg(outerR - cr, endBoundary, -halfGapPx));
  const edgeEndInner = polar(cx, cy, innerR + cr, offsetAngleDeg(innerR + cr, endBoundary, -halfGapPx));

  const mainOSweep = outerSweep - 2 * crODeg;
  const mainISweep = innerSweep - 2 * crIDeg;

  return [
    `M ${edgeStartInner.x} ${edgeStartInner.y}`,
    `L ${edgeStartOuter.x} ${edgeStartOuter.y}`,
    `Q ${pOS.x} ${pOS.y} ${oS.x} ${oS.y}`,
    `A ${outerR} ${outerR} 0 ${mainOSweep > 180 ? 1 : 0} 1 ${oE.x} ${oE.y}`,
    `Q ${pOE.x} ${pOE.y} ${edgeEndOuter.x} ${edgeEndOuter.y}`,
    `L ${edgeEndInner.x} ${edgeEndInner.y}`,
    `Q ${pIE.x} ${pIE.y} ${iE.x} ${iE.y}`,
    `A ${innerR} ${innerR} 0 ${mainISweep > 180 ? 1 : 0} 0 ${iS.x} ${iS.y}`,
    `Q ${pIS.x} ${pIS.y} ${edgeStartInner.x} ${edgeStartInner.y}`,
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
    // Trigger animation after mount — subsequent data changes
    // transition smoothly via CSS without resetting to zero
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setAnimated(true));
    });
    return () => cancelAnimationFrame(id);
  }, []);

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
        const centerDeg = i * segDeg;
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
