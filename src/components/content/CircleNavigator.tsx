import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

export interface CircleNavigatorPart {
  partNumber: number;
  partName: string;
  title: string;
  href: string;
  colorHex: string;
}

export interface CircleNavigatorProps {
  parts: CircleNavigatorPart[];
}

const VIEWBOX_SIZE = 680;
const CENTER = VIEWBOX_SIZE / 2;
const OUTER_RADIUS = 168;
const INNER_RADIUS = 96;
const LABEL_RADIUS = 268;
const CONNECTOR_RADIUS = 192;
const SEGMENT_COUNT = 9;
const SEGMENT_ANGLE = 360 / SEGMENT_COUNT;
const DEFAULT_CENTER_PART = 10;
const DRAG_DISTANCE_THRESHOLD = 6;
const CENTER_PREVIEW_THRESHOLD = INNER_RADIUS + 20;
const CENTER_COMMIT_THRESHOLD = INNER_RADIUS - 10;
const STORAGE_KEY = 'propaedia-circle-navigator-v1';

function polar(cx: number, cy: number, radius: number, degrees: number) {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}

function donutSlicePath(
  cx: number,
  cy: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number
) {
  const startOuter = polar(cx, cy, outerRadius, startAngle);
  const endOuter = polar(cx, cy, outerRadius, endAngle);
  const startInner = polar(cx, cy, innerRadius, startAngle);
  const endInner = polar(cx, cy, innerRadius, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${endOuter.x} ${endOuter.y}`,
    `L ${endInner.x} ${endInner.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${startInner.x} ${startInner.y}`,
    'Z',
  ].join(' ');
}

function normalizeDegrees(value: number): number {
  let nextValue = value;

  while (nextValue <= -180) nextValue += 360;
  while (nextValue > 180) nextValue -= 360;

  return nextValue;
}

function snapRotation(value: number): number {
  return Math.round(value / SEGMENT_ANGLE) * SEGMENT_ANGLE;
}

function angularDistance(a: number, b: number): number {
  return Math.abs(normalizeDegrees(a - b));
}

function topPartNumberForRotation(parts: CircleNavigatorPart[], rotation: number): number {
  if (parts.length === 0) return DEFAULT_CENTER_PART;

  return parts.reduce(
    (best, part, index) => {
      const centerAngle = rotation + index * SEGMENT_ANGLE;
      const distance = angularDistance(centerAngle, 0);

      if (!best || distance < best.distance) {
        return { partNumber: part.partNumber, distance };
      }

      return best;
    },
    null as { partNumber: number; distance: number } | null
  )?.partNumber ?? parts[0].partNumber;
}

function wrapLabel(title: string, maxLength = 17, maxLines = 3): string[] {
  const words = title.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = '';

  words.forEach((word) => {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;

    if (nextLine.length <= maxLength || currentLine.length === 0) {
      currentLine = nextLine;
      return;
    }

    lines.push(currentLine);
    currentLine = word;
  });

  if (currentLine) lines.push(currentLine);

  if (lines.length <= maxLines) return lines;

  const nextLines = lines.slice(0, maxLines);
  nextLines[maxLines - 1] = `${nextLines[maxLines - 1]}...`;
  return nextLines;
}

function distanceFromCenter(x: number, y: number): number {
  return Math.hypot(x - CENTER, y - CENTER);
}

function angleFromPoint(x: number, y: number): number {
  return (Math.atan2(y - CENTER, x - CENTER) * 180) / Math.PI + 90;
}

function svgPoint(svg: SVGSVGElement, clientX: number, clientY: number) {
  const bounds = svg.getBoundingClientRect();

  return {
    x: ((clientX - bounds.left) / bounds.width) * VIEWBOX_SIZE,
    y: ((clientY - bounds.top) / bounds.height) * VIEWBOX_SIZE,
  };
}

function textAnchorForAngle(angle: number) {
  const radians = ((angle - 90) * Math.PI) / 180;
  const horizontal = Math.cos(radians);

  if (horizontal > 0.3) return 'start';
  if (horizontal < -0.3) return 'end';
  return 'middle';
}

type DragState = {
  pointerId: number;
  activePartNumber: number;
  startAngle: number;
  startRotation: number;
  startX: number;
  startY: number;
  moved: boolean;
  readyForCenter: boolean;
};

export default function CircleNavigator({ parts }: CircleNavigatorProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const [centerHasFocus, setCenterHasFocus] = useState(false);
  const [hasLoadedState, setHasLoadedState] = useState(false);
  const [centerPartNumber, setCenterPartNumber] = useState(DEFAULT_CENTER_PART);
  const [rotationDegrees, setRotationDegrees] = useState(0);
  const [selectedPartNumber, setSelectedPartNumber] = useState(DEFAULT_CENTER_PART);
  const [centerPreviewPartNumber, setCenterPreviewPartNumber] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setHasLoadedState(true);
        return;
      }

      const parsed = JSON.parse(raw);
      const knownParts = new Set(parts.map((part) => part.partNumber));
      const nextCenterPartNumber = Number(parsed?.centerPartNumber);
      const nextRotationDegrees = Number(parsed?.rotationDegrees);
      const nextSelectedPartNumber = Number(parsed?.selectedPartNumber);

      if (knownParts.has(nextCenterPartNumber)) {
        setCenterPartNumber(nextCenterPartNumber);
      }

      if (Number.isFinite(nextRotationDegrees)) {
        setRotationDegrees(snapRotation(nextRotationDegrees));
      }

      if (knownParts.has(nextSelectedPartNumber)) {
        setSelectedPartNumber(nextSelectedPartNumber);
      }
    } catch {
      // Ignore invalid stored state.
    } finally {
      setHasLoadedState(true);
    }
  }, [parts]);

  useEffect(() => {
    if (!hasLoadedState || typeof window === 'undefined') return;

    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          centerPartNumber,
          rotationDegrees: snapRotation(rotationDegrees),
          selectedPartNumber,
        })
      );
    } catch {
      // Ignore storage failures and keep the UI interactive.
    }
  }, [centerPartNumber, hasLoadedState, rotationDegrees, selectedPartNumber]);

  const centerPart = parts.find((part) => part.partNumber === centerPartNumber) ?? parts[0];
  const outerParts = parts.filter((part) => part.partNumber !== centerPartNumber);
  const topPartNumber = topPartNumberForRotation(outerParts, rotationDegrees);
  const topPart = outerParts.find((part) => part.partNumber === topPartNumber) ?? outerParts[0];
  const selectedPart = parts.find((part) => part.partNumber === selectedPartNumber) ?? centerPart;
  const previewCenterPart = parts.find((part) => part.partNumber === centerPreviewPartNumber) ?? null;
  const centerDisplayPart = previewCenterPart ?? centerPart;
  const centerTitleLines = wrapLabel(centerDisplayPart.title, 14, 2);
  const emphasisSummary = `Centered on ${centerPart.title}, with ${topPart.title} emphasized at the top.`;

  const rotatePartToTop = (partNumber: number) => {
    const partIndex = outerParts.findIndex((part) => part.partNumber === partNumber);
    if (partIndex === -1) return;

    setRotationDegrees(-partIndex * SEGMENT_ANGLE);
    setSelectedPartNumber(partNumber);
  };

  const movePartToCenter = (partNumber: number) => {
    if (partNumber === centerPartNumber) return;
    setRotationDegrees(snapRotation(rotationDegrees));
    setCenterPartNumber(partNumber);
    setSelectedPartNumber(partNumber);
    setCenterPreviewPartNumber(null);
  };

  const finishDrag = (pointerId: number) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== pointerId) return;

    if (dragState.readyForCenter) {
      movePartToCenter(dragState.activePartNumber);
    } else {
      const nextRotation = snapRotation(rotationDegrees);
      setRotationDegrees(nextRotation);

      if (!dragState.moved) {
        setSelectedPartNumber(dragState.activePartNumber);
      } else if (topPart) {
        const nextTopPartNumber = topPartNumberForRotation(outerParts, nextRotation);
        const nextTopPart = outerParts.find((part) => part.partNumber === nextTopPartNumber) ?? topPart;
        setSelectedPartNumber(nextTopPart.partNumber);
      }
    }

    if (svgRef.current?.hasPointerCapture(pointerId)) {
      svgRef.current.releasePointerCapture(pointerId);
    }

    dragStateRef.current = null;
    setCenterPreviewPartNumber(null);
  };

  const handleSegmentPointerDown = (partNumber: number) => (event: h.JSX.TargetedPointerEvent<SVGPathElement>) => {
    if (!svgRef.current) return;

    const point = svgPoint(svgRef.current, event.clientX, event.clientY);
    const startAngle = angleFromPoint(point.x, point.y);

    setSelectedPartNumber(partNumber);
    dragStateRef.current = {
      pointerId: event.pointerId,
      activePartNumber: partNumber,
      startAngle,
      startRotation: rotationDegrees,
      startX: point.x,
      startY: point.y,
      moved: false,
      readyForCenter: false,
    };

    svgRef.current.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handlePointerMove = (event: h.JSX.TargetedPointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;

    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    const point = svgPoint(svgRef.current, event.clientX, event.clientY);
    const nextRadius = distanceFromCenter(point.x, point.y);
    const travelled = Math.hypot(point.x - dragState.startX, point.y - dragState.startY);

    if (travelled > DRAG_DISTANCE_THRESHOLD) {
      dragState.moved = true;
    }

    if (dragState.activePartNumber !== centerPartNumber && nextRadius <= CENTER_PREVIEW_THRESHOLD) {
      setCenterPreviewPartNumber(dragState.activePartNumber);
      dragState.readyForCenter = nextRadius <= CENTER_COMMIT_THRESHOLD;
      return;
    }

    dragState.readyForCenter = false;
    setCenterPreviewPartNumber(null);

    const nextAngle = angleFromPoint(point.x, point.y);
    const delta = normalizeDegrees(nextAngle - dragState.startAngle);
    setRotationDegrees(dragState.startRotation + delta);
  };

  const handlePointerUp = (event: h.JSX.TargetedPointerEvent<SVGSVGElement>) => {
    finishDrag(event.pointerId);
  };

  const handlePointerCancel = (event: h.JSX.TargetedPointerEvent<SVGSVGElement>) => {
    finishDrag(event.pointerId);
  };

  return (
    <div class="grid gap-5 sm:gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)] xl:items-start">
      <div class="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-3 sm:rounded-[1.75rem] sm:p-6">
        <div class="mb-4 rounded-[1.1rem] border border-slate-200 bg-white/95 px-4 py-3 shadow-sm sm:mb-5 sm:px-5">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div class="min-w-0">
              <p class="text-[0.68rem] font-sans font-semibold uppercase tracking-[0.2em] text-slate-500 sm:text-sm sm:tracking-[0.18em]">
                Current emphasis
              </p>
              <p class="mt-1 text-sm font-serif font-semibold leading-6 text-slate-900 sm:text-base sm:leading-7">
                {emphasisSummary}
              </p>
            </div>

            <div class="flex flex-wrap gap-2 text-xs font-medium text-slate-700 sm:text-sm">
              <span class="rounded-full bg-slate-100 px-3 py-1.5">
                Centre: {centerPart.partName}
              </span>
              <span class="rounded-full bg-slate-100 px-3 py-1.5">
                Top: {topPart.partName}
              </span>
            </div>
          </div>
          <p class="mt-2 text-xs leading-5 text-slate-500 sm:text-sm sm:leading-6">
            Use the centre to set the main field of study, and the top to choose the strongest secondary emphasis.
          </p>
        </div>

        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
          class="mx-auto aspect-square w-full max-w-[38rem] touch-none select-none sm:max-w-[42rem]"
          style={{ overflow: 'visible' }}
          role="img"
          aria-label="Interactive circle navigation for the ten parts of the Propaedia"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onPointerLeave={(event) => {
            if (dragStateRef.current?.pointerId === event.pointerId) finishDrag(event.pointerId);
          }}
        >
          <title>Interactive circle navigation for the Propaedia</title>

          <circle cx={CENTER} cy={CENTER} r={OUTER_RADIUS + 22} fill="#f8fafc" />

          {outerParts.map((part, index) => {
            const centerAngle = rotationDegrees + index * SEGMENT_ANGLE;
            const startAngle = centerAngle - SEGMENT_ANGLE / 2;
            const endAngle = centerAngle + SEGMENT_ANGLE / 2;
            const labelPosition = polar(CENTER, CENTER, LABEL_RADIUS, centerAngle);
            const labelLines = wrapLabel(part.title);
            const textAnchor = textAnchorForAngle(centerAngle);
            const labelX =
              labelPosition.x + (textAnchor === 'start' ? -30 : textAnchor === 'end' ? 30 : 0);
            const isSelected = selectedPartNumber === part.partNumber;
            const isTop = topPart.partNumber === part.partNumber;
            const segmentInnerRadius = isTop ? INNER_RADIUS - 8 : INNER_RADIUS;
            const segmentOuterRadius = isTop ? OUTER_RADIUS + 12 : OUTER_RADIUS;
            const numberPosition = polar(CENTER, CENTER, isTop ? 138 : 134, centerAngle);
            const connectorStart = polar(CENTER, CENTER, segmentOuterRadius + 6, centerAngle);
            const connectorEnd = polar(CENTER, CENTER, isTop ? CONNECTOR_RADIUS + 8 : CONNECTOR_RADIUS, centerAngle);

            return (
              <g key={part.partNumber}>
                <path
                  d={donutSlicePath(CENTER, CENTER, segmentInnerRadius, segmentOuterRadius, startAngle, endAngle)}
                  fill={part.colorHex}
                  stroke={isSelected ? '#ffffff' : isTop ? '#e2e8f0' : '#ffffff'}
                  stroke-width={isSelected ? 6 : isTop ? 5 : 2}
                  opacity={isSelected || isTop ? 1 : 0.94}
                  class="cursor-grab active:cursor-grabbing transition-opacity"
                  onPointerDown={handleSegmentPointerDown(part.partNumber)}
                  onMouseEnter={() => setSelectedPartNumber(part.partNumber)}
                />

                <text
                  x={numberPosition.x}
                  y={numberPosition.y}
                  fill="white"
                  font-size="24"
                  font-family="Inter, sans-serif"
                  font-weight="700"
                  text-anchor="middle"
                  dominant-baseline="middle"
                  pointer-events="none"
                >
                  {part.partNumber}
                </text>

                <a
                  href={part.href}
                  onMouseEnter={() => setSelectedPartNumber(part.partNumber)}
                  onFocus={() => setSelectedPartNumber(part.partNumber)}
                >
                  <line
                    x1={connectorStart.x}
                    y1={connectorStart.y}
                    x2={connectorEnd.x}
                    y2={connectorEnd.y}
                    stroke={isSelected || isTop ? part.colorHex : '#cbd5e1'}
                    stroke-width={isSelected || isTop ? 2.5 : 1.5}
                  />
                  <circle cx={connectorEnd.x} cy={connectorEnd.y} r={3.5} fill={part.colorHex} />
                  <text
                    x={labelX}
                    y={labelPosition.y - (labelLines.length * 8)}
                    fill={isSelected || isTop ? '#0f172a' : '#334155'}
                    font-size={isTop ? '12' : '11'}
                    font-family="Inter, sans-serif"
                    font-weight="700"
                    letter-spacing="0.12em"
                    text-anchor={textAnchor}
                  >
                    <tspan x={labelX} dy="0">
                      {part.partName.toUpperCase()}
                    </tspan>
                    {labelLines.map((line, lineIndex) => (
                      <tspan
                        x={labelX}
                        dy={lineIndex === 0 ? 16 : 14}
                        font-size={isTop ? '14' : '13'}
                        font-weight={isSelected || isTop ? '700' : '600'}
                        letter-spacing="0"
                      >
                        {line}
                      </tspan>
                    ))}
                  </text>
                </a>
              </g>
            );
          })}

          {previewCenterPart && (
            <>
              <circle
                cx={CENTER}
                cy={CENTER}
                r={INNER_RADIUS + 10}
                fill="none"
                stroke={previewCenterPart.colorHex}
                stroke-width="6"
                stroke-dasharray="8 8"
                class="animate-pulse"
                opacity="0.9"
              />
            </>
          )}

          <g
            role="button"
            tabIndex={0}
            class="cursor-pointer"
            style={{ outline: 'none' }}
            onPointerDown={(event) => {
              event.preventDefault();
              setCenterHasFocus(false);
              setSelectedPartNumber(centerPart.partNumber);
            }}
            onClick={() => setSelectedPartNumber(centerPart.partNumber)}
            onMouseEnter={() => setSelectedPartNumber(centerPart.partNumber)}
            onFocus={() => {
              setCenterHasFocus(true);
              setSelectedPartNumber(centerPart.partNumber);
            }}
            onBlur={() => setCenterHasFocus(false)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setSelectedPartNumber(centerPart.partNumber);
              }
            }}
          >
            {centerHasFocus && (
              <circle
                cx={CENTER}
                cy={CENTER}
                r={INNER_RADIUS + 4}
                fill="none"
                stroke="#0f172a"
                stroke-width="4"
                opacity="0.35"
                pointer-events="none"
              />
            )}
            <circle
              cx={CENTER}
              cy={CENTER}
              r={INNER_RADIUS - 8}
              fill={centerDisplayPart.colorHex}
              stroke={selectedPartNumber === centerPart.partNumber ? '#0f172a' : 'white'}
              stroke-width={selectedPartNumber === centerPart.partNumber ? '5' : '4'}
            />
            <text
              x={CENTER}
              y={CENTER - 30}
              fill="white"
              font-size="42"
              font-family="Inter, sans-serif"
              font-weight="700"
              text-anchor="middle"
              dominant-baseline="middle"
            >
              {centerDisplayPart.partNumber}
            </text>
            <text
              x={CENTER}
              y={CENTER + 2}
              fill="white"
              font-size="13"
              font-family="Inter, sans-serif"
              font-weight="700"
              text-anchor="middle"
              letter-spacing="0.12em"
            >
              {centerDisplayPart.partName.toUpperCase()}
            </text>
            {centerTitleLines.map((line, index) => (
              <text
                key={`${centerDisplayPart.partNumber}-${line}-${index}`}
                x={CENTER}
                y={CENTER + 26 + index * 14}
                fill="white"
                font-size="12"
                font-family="Inter, sans-serif"
                font-weight="600"
                text-anchor="middle"
              >
                {line}
              </text>
            ))}
          </g>
        </svg>

        <div class="mt-3 min-h-[2rem] text-center text-sm font-semibold text-slate-700 sm:mt-4 sm:min-h-[2.5rem]">
          {previewCenterPart ? (
            <span>
              Release to place {previewCenterPart.partName}: {previewCenterPart.title} at the center.
            </span>
          ) : (
            <span class="text-slate-500">Drag the ring to rotate, or pull a part inward to move it to the center.</span>
          )}
        </div>
      </div>

      <div class="space-y-3 sm:space-y-4">
        <div class="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm sm:rounded-[1.75rem] sm:p-6">
          <p class="text-sm font-sans font-semibold uppercase tracking-[0.18em] text-slate-500">
            Selected Part
          </p>
          <h3 class="mt-2 text-xl font-serif font-bold text-slate-900 sm:mt-3 sm:text-2xl">
            {selectedPart.partName}: {selectedPart.title}
          </h3>

          <div class="mt-4 space-y-2 text-sm leading-6 text-slate-600 sm:mt-5 sm:space-y-3 sm:leading-7">
            <p>
              <span class="font-semibold text-slate-800">At the top:</span> {topPart.partName}: {topPart.title}
            </p>
            <p>
              <span class="font-semibold text-slate-800">At the centre:</span> {centerPart.partName}: {centerPart.title}
            </p>
          </div>

          <div class="mt-5 grid gap-2 sm:mt-6 sm:flex sm:flex-wrap">
            <a
              href={selectedPart.href}
              class="inline-flex w-full items-center justify-center rounded-full bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 sm:w-auto sm:py-2"
            >
              Open {selectedPart.partName}
            </a>

            {selectedPart.partNumber !== centerPartNumber && (
              <button
                type="button"
                onClick={() => movePartToCenter(selectedPart.partNumber)}
                class="inline-flex w-full items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 sm:w-auto sm:py-2"
              >
                Move to centre
              </button>
            )}

            {selectedPart.partNumber !== centerPartNumber && selectedPart.partNumber !== topPart.partNumber && (
              <button
                type="button"
                onClick={() => rotatePartToTop(selectedPart.partNumber)}
                class="inline-flex w-full items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 sm:w-auto sm:py-2"
              >
                Rotate to top
              </button>
            )}
          </div>
        </div>

        <div class="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm sm:rounded-[1.75rem] sm:p-6">
          <p class="text-sm font-sans font-semibold uppercase tracking-[0.18em] text-slate-500">
            How to use the circle
          </p>
          <ul class="mt-3 space-y-3 text-sm leading-6 text-slate-600 sm:mt-4 sm:leading-7">
            <li>Rotate the ring to change which part stands at the top, so you can see the same outline with a different emphasis.</li>
            <li>Pull a part inward to place it at the centre when you want that field to act as the organising focus for everything around it.</li>
            <li>Use the floating labels or the selected-part controls to move from this conceptual map straight into the part you want to study.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
