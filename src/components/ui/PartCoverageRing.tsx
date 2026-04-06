import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { PartCoverageSegment } from '../../utils/readingLibrary';
import { roundedDonutSlicePath } from '../../utils/donutPaths';

export interface PartCoverageRingProps {
  segments: PartCoverageSegment[];
  size?: number;
  innerRadius?: number;
  outerRadius?: number;
  gapPx?: number;
  freezeTransitions?: boolean;
  centerPercentage?: number;
}

let idCounter = 0;
const PERCENT_ANIMATION_DURATION_MS = 800;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export default function PartCoverageRing({
  segments,
  size = 100,
  innerRadius,
  outerRadius,
  gapPx = 2.5,
  freezeTransitions = false,
  centerPercentage,
}: PartCoverageRingProps) {
  const [animated, setAnimated] = useState(false);
  const [clipId] = useState(() => `pcr-${++idCounter}`);
  const [displayedPercentage, setDisplayedPercentage] = useState(centerPercentage ?? 0);
  const displayedPercentageRef = useRef(displayedPercentage);
  const percentageAnimationFrameRef = useRef<number | null>(null);

  const cx = size / 2;
  const cy = size / 2;
  const oR = outerRadius ?? size / 2 - 1;
  const iR = innerRadius ?? oR * 0.55;
  const segmentCount = segments.length || 10;
  const segDeg = 360 / segmentCount;

  useEffect(() => {
    // Trigger animation after mount - subsequent data changes
    // transition smoothly via CSS without resetting to zero
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setAnimated(true));
    });
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    displayedPercentageRef.current = displayedPercentage;
  }, [displayedPercentage]);

  useEffect(() => {
    if (percentageAnimationFrameRef.current !== null) {
      cancelAnimationFrame(percentageAnimationFrameRef.current);
      percentageAnimationFrameRef.current = null;
    }

    const targetPercentage = centerPercentage ?? 0;
    if (freezeTransitions) {
      displayedPercentageRef.current = targetPercentage;
      setDisplayedPercentage(targetPercentage);
      return;
    }

    const startPercentage = displayedPercentageRef.current;
    if (startPercentage === targetPercentage) return;

    let startTime: number | null = null;

    const step = (timestamp: number) => {
      if (startTime === null) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / PERCENT_ANIMATION_DURATION_MS, 1);
      const easedProgress = easeOutCubic(progress);
      const nextValue = Math.round(
        startPercentage + (targetPercentage - startPercentage) * easedProgress,
      );
      displayedPercentageRef.current = nextValue;
      setDisplayedPercentage(nextValue);

      if (progress < 1) {
        percentageAnimationFrameRef.current = requestAnimationFrame(step);
      } else {
        percentageAnimationFrameRef.current = null;
      }
    };

    percentageAnimationFrameRef.current = requestAnimationFrame(step);

    return () => {
      if (percentageAnimationFrameRef.current !== null) {
        cancelAnimationFrame(percentageAnimationFrameRef.current);
        percentageAnimationFrameRef.current = null;
      }
    };
  }, [centerPercentage, freezeTransitions]);

  return (
    <div class="relative w-28 h-28 sm:w-32 sm:h-32">
      <svg viewBox={`0 0 ${size} ${size}`} class="h-full w-full">
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
                    transition: freezeTransitions ? 'none' : 'r 0.8s ease-out',
                  }}
                />
              </clipPath>
            );
          })}
        </defs>

        {segments.map((seg, i) => {
          const centerDeg = i * segDeg;
          const segPath = roundedDonutSlicePath(
            cx,
            cy,
            iR,
            oR,
            centerDeg - segDeg / 2,
            centerDeg + segDeg / 2,
            {
              gapPx,
              cornerRadiusPx: 2,
            }
          );

          return (
            <g key={seg.partNumber}>
              {/* Background track - rounded, low opacity */}
              <path
                d={segPath}
                fill={seg.colorHex}
                fill-opacity="0.14"
              />
              {/* Fill - same shape, clipped by expanding circle from center */}
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
      {typeof centerPercentage === 'number' ? (
        <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div class="font-sans text-[15px] font-semibold tabular-nums tracking-tight text-slate-700 sm:text-[17px]">
            {displayedPercentage}%
          </div>
        </div>
      ) : null}
    </div>
  );
}
