import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

export interface CircleNavigatorPart {
  partNumber: number;
  partName: string;
  title: string;
  href: string;
  colorHex: string;
}

export interface SectionConnection {
  sourceSection: string;
  targetSection: string;
  sourcePath: string;
  targetPath: string;
}

export interface SectionMeta {
  title: string;
  partNumber: number;
  sectionCode: string;
}

export interface CircleNavigatorProps {
  parts: CircleNavigatorPart[];
  connections: Record<string, SectionConnection[]>;
  sectionMeta: Record<string, SectionMeta>;
  baseUrl: string;
}

const VIEWBOX_SIZE = 680;
const VIEWBOX_INSET = 30;
const CENTER = VIEWBOX_SIZE / 2;
const OUTER_RADIUS = 168;
const INNER_RADIUS = 96;
const LABEL_RADIUS = 250;
const CONNECTOR_RADIUS = 192;
const SEGMENT_COUNT = 9;
const SEGMENT_ANGLE = 360 / SEGMENT_COUNT;
const DEFAULT_CENTER_PART = 10;
const CENTER_DISC_RADIUS = INNER_RADIUS - 8;
const DRAG_DISTANCE_THRESHOLD = 6;
const CLICK_DURATION_THRESHOLD_MS = 250;
const CENTER_PREVIEW_THRESHOLD = CENTER_DISC_RADIUS + 2;
const CENTER_COMMIT_THRESHOLD = CENTER_DISC_RADIUS - 16;
const SELECTION_OUTLINE_WIDTH = 4;
const FOCUS_RING_WIDTH = 3;
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

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

const MORPH_DURATION_MS = 300;

function morphedDonutPath(
  cx: number,
  cy: number,
  srcInner: number,
  srcOuter: number,
  srcStartAngle: number,
  srcEndAngle: number,
  targetRadius: number,
  t: number
): string {
  const innerR = lerp(srcInner, 1, t);
  const outerR = lerp(srcOuter, targetRadius, t);
  const srcSpan = srcEndAngle - srcStartAngle;
  const span = lerp(srcSpan, 359.9, t);
  const srcMid = (srcStartAngle + srcEndAngle) / 2;
  const midAngle = lerp(srcMid, srcMid, t);
  const startA = midAngle - span / 2;
  const endA = midAngle + span / 2;
  return donutSlicePath(cx, cy, innerR, outerR, startA, endA);
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
  const vbSize = VIEWBOX_SIZE - VIEWBOX_INSET * 2;

  return {
    x: VIEWBOX_INSET + ((clientX - bounds.left) / bounds.width) * vbSize,
    y: VIEWBOX_INSET + ((clientY - bounds.top) / bounds.height) * vbSize,
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
  startTime: number;
  startX: number;
  startY: number;
  moved: boolean;
  readyForCenter: boolean;
  rotateOnly: boolean;
};

function getConnectionKey(a: number, b: number): string {
  return Math.min(a, b) + '-' + Math.max(a, b);
}

function summarizeConnections(
  connections: Record<string, SectionConnection[]>,
  sectionMeta: Record<string, SectionMeta>,
  centerPart: number,
  topPart: number
): { section: SectionMeta; refCount: number }[] {
  if (centerPart === topPart) return [];
  const key = getConnectionKey(centerPart, topPart);
  const refs = connections[key] || [];
  if (!refs.length) return [];

  // Count how many times each section appears as source or target
  const counts: Record<string, number> = {};
  refs.forEach((r) => {
    counts[r.sourceSection] = (counts[r.sourceSection] || 0) + 1;
    counts[r.targetSection] = (counts[r.targetSection] || 0) + 1;
  });

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([code, count]) => ({
      section: sectionMeta[code] || { title: code, partNumber: 0, sectionCode: code },
      refCount: count,
    }))
    .filter((s) => s.section.partNumber > 0);
}

export default function CircleNavigator({ parts, connections, sectionMeta, baseUrl }: CircleNavigatorProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const [centerHasFocus, setCenterHasFocus] = useState(false);
  const [hasLoadedState, setHasLoadedState] = useState(false);
  const [centerPartNumber, setCenterPartNumber] = useState(DEFAULT_CENTER_PART);
  const [rotationDegrees, setRotationDegrees] = useState(0);
  const [selectedPartNumber, setSelectedPartNumber] = useState(DEFAULT_CENTER_PART);
  const [centerPreviewPartNumber, setCenterPreviewPartNumber] = useState<number | null>(null);
  const [morphT, setMorphT] = useState(0);
  const [morphPartNumber, setMorphPartNumber] = useState<number | null>(null);
  const morphAnimRef = useRef<number | null>(null);
  const morphStartTimeRef = useRef(0);
  const morphFromTRef = useRef(0);

  const [postSwapT, setPostSwapT] = useState(0);
  const [postSwapState, setPostSwapState] = useState<{
    oldCenterPartNumber: number;
    angularOffsets: Map<number, number>;
  } | null>(null);
  const postSwapAnimRef = useRef<number | null>(null);
  const skipMorphReverseRef = useRef(false);
  const snapTargetRef = useRef<number | null>(null);
  const snapAnimRef = useRef<number | null>(null);

  useEffect(() => {
    if (morphAnimRef.current) {
      cancelAnimationFrame(morphAnimRef.current);
      morphAnimRef.current = null;
    }

    if (centerPreviewPartNumber !== null) {
      setMorphPartNumber(centerPreviewPartNumber);
      morphFromTRef.current = morphT;
      morphStartTimeRef.current = performance.now();
      const animate = (now: number) => {
        const elapsed = now - morphStartTimeRef.current;
        const rawT = Math.min(elapsed / MORPH_DURATION_MS, 1);
        const nextT = lerp(morphFromTRef.current, 1, easeOutCubic(rawT));
        setMorphT(nextT);
        if (rawT < 1) {
          morphAnimRef.current = requestAnimationFrame(animate);
        }
      };
      morphAnimRef.current = requestAnimationFrame(animate);
    } else if (skipMorphReverseRef.current) {
      skipMorphReverseRef.current = false;
    } else if (morphT < 0.01) {
      // Already at 0, no animation needed
    } else {
      morphFromTRef.current = morphT;
      morphStartTimeRef.current = performance.now();
      const animate = (now: number) => {
        const elapsed = now - morphStartTimeRef.current;
        const rawT = Math.min(elapsed / (MORPH_DURATION_MS * 0.5), 1);
        const nextT = lerp(morphFromTRef.current, 0, easeOutCubic(rawT));
        setMorphT(nextT);
        if (rawT < 1) {
          morphAnimRef.current = requestAnimationFrame(animate);
        }
      };
      morphAnimRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (morphAnimRef.current) cancelAnimationFrame(morphAnimRef.current);
    };
  }, [centerPreviewPartNumber]);

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
  const selectedOuterPart = outerParts.find((part) => part.partNumber === selectedPartNumber) ?? null;
  const previewCenterPart = parts.find((part) => part.partNumber === centerPreviewPartNumber) ?? null;
  const centerDisplayPart = previewCenterPart ?? centerPart;
  const centerTitleLines = wrapLabel(centerDisplayPart.title, 14, 2);
  const suggestedSections = summarizeConnections(connections, sectionMeta, centerPartNumber, topPartNumber);

  const rotatePartToTop = (partNumber: number) => {
    const partIndex = outerParts.findIndex((part) => part.partNumber === partNumber);
    if (partIndex === -1) return;

    setRotationDegrees(-partIndex * SEGMENT_ANGLE);
    setSelectedPartNumber(partNumber);
  };

  const movePartToCenter = (partNumber: number) => {
    if (partNumber === centerPartNumber) return;

    // Compute old and new outer parts to find angular shifts
    const oldOuter = parts.filter((p) => p.partNumber !== centerPartNumber);
    const newOuter = parts.filter((p) => p.partNumber !== partNumber);
    const oldIndexMap = new Map(oldOuter.map((p, i) => [p.partNumber, i]));
    const newIndexMap = new Map(newOuter.map((p, i) => [p.partNumber, i]));

    // Keep the current top part at the top after the swap
    const currentTopPN = topPartNumberForRotation(oldOuter, rotationDegrees);
    const newTopIdx = newIndexMap.get(currentTopPN);
    const newRotation = newTopIdx !== undefined ? -newTopIdx * SEGMENT_ANGLE : snapRotation(rotationDegrees);

    // Use actual current rotation (not snapped) so the visual transition is continuous
    const currentRotation = rotationDegrees;
    const offsets = new Map<number, number>();
    for (const p of newOuter) {
      const oldIdx = oldIndexMap.get(p.partNumber);
      const newIdx = newIndexMap.get(p.partNumber)!;
      if (oldIdx !== undefined) {
        const oldAngle = currentRotation + oldIdx * SEGMENT_ANGLE;
        const newAngle = newRotation + newIdx * SEGMENT_ANGLE;
        const shift = normalizeDegrees(oldAngle - newAngle);
        if (Math.abs(shift) > 0.01) offsets.set(p.partNumber, shift);
      }
    }

    const oldCenter = centerPartNumber;

    // Cancel any in-flight animations
    if (postSwapAnimRef.current) cancelAnimationFrame(postSwapAnimRef.current);
    if (morphAnimRef.current) cancelAnimationFrame(morphAnimRef.current);
    cancelSnapAnimation();
    setMorphT(0);
    setMorphPartNumber(null);
    skipMorphReverseRef.current = true;

    // Apply the state change
    setRotationDegrees(newRotation);
    setCenterPartNumber(partNumber);
    setCenterPreviewPartNumber(null);

    // Start post-swap animation
    setPostSwapState({ oldCenterPartNumber: oldCenter, angularOffsets: offsets });
    setPostSwapT(1);

    const startTime = performance.now();
    const POST_SWAP_DURATION = 400;
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const rawT = Math.min(elapsed / POST_SWAP_DURATION, 1);
      setPostSwapT(Math.max(0, 1 - easeOutCubic(rawT)));
      if (rawT < 1) {
        postSwapAnimRef.current = requestAnimationFrame(animate);
      } else {
        setPostSwapState(null);
        setPostSwapT(0);
      }
    };
    postSwapAnimRef.current = requestAnimationFrame(animate);
  };

  const cancelSnapAnimation = () => {
    if (snapAnimRef.current) {
      cancelAnimationFrame(snapAnimRef.current);
      snapAnimRef.current = null;
      if (snapTargetRef.current !== null) {
        setRotationDegrees(snapTargetRef.current);
        snapTargetRef.current = null;
      }
    }
  };

  const animateSnapRotation = (from: number, to: number) => {
    cancelSnapAnimation();
    snapTargetRef.current = to;
    if (Math.abs(from - to) < 0.5) {
      if (from !== to) setRotationDegrees(to);
      snapTargetRef.current = null;
      return;
    }
    const startTime = performance.now();
    const duration = Math.min(200, Math.abs(from - to) * 8);
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const rawT = Math.min(elapsed / duration, 1);
      setRotationDegrees(lerp(from, to, easeOutCubic(rawT)));
      if (rawT < 1) {
        snapAnimRef.current = requestAnimationFrame(animate);
      } else {
        snapAnimRef.current = null;
        snapTargetRef.current = null;
      }
    };
    snapAnimRef.current = requestAnimationFrame(animate);
  };

  const finishDrag = (pointerId: number) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== pointerId) return;

    if (!dragState.rotateOnly && dragState.readyForCenter) {
      movePartToCenter(dragState.activePartNumber);
    } else {
      const nextRotation = snapRotation(rotationDegrees);
      animateSnapRotation(rotationDegrees, nextRotation);

      const isQuickClick =
        !dragState.rotateOnly && !dragState.moved && Date.now() - dragState.startTime <= CLICK_DURATION_THRESHOLD_MS;

      if (isQuickClick) {
        setSelectedPartNumber(dragState.activePartNumber);
      }
    }

    if (svgRef.current?.hasPointerCapture(pointerId)) {
      svgRef.current.releasePointerCapture(pointerId);
    }

    dragStateRef.current = null;
    if (centerPreviewPartNumber !== null) setCenterPreviewPartNumber(null);
  };

  const handleSegmentPointerDown = (partNumber: number) => (event: h.JSX.TargetedPointerEvent<SVGElement>) => {
    if (!svgRef.current) return;
    cancelSnapAnimation();

    event.stopPropagation();

    const point = svgPoint(svgRef.current, event.clientX, event.clientY);
    const startAngle = angleFromPoint(point.x, point.y);

    dragStateRef.current = {
      pointerId: event.pointerId,
      activePartNumber: partNumber,
      startAngle,
      startRotation: rotationDegrees,
      startTime: Date.now(),
      startX: point.x,
      startY: point.y,
      moved: false,
      readyForCenter: false,
      rotateOnly: false,
    };

    svgRef.current.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handleBackgroundPointerDown = (event: h.JSX.TargetedPointerEvent<SVGSVGElement>) => {
    if (dragStateRef.current || !svgRef.current) return;
    cancelSnapAnimation();

    const point = svgPoint(svgRef.current, event.clientX, event.clientY);
    const radius = distanceFromCenter(point.x, point.y);

    if (radius <= CENTER_PREVIEW_THRESHOLD) return;

    const startAngle = angleFromPoint(point.x, point.y);

    dragStateRef.current = {
      pointerId: event.pointerId,
      activePartNumber: topPartNumber,
      startAngle,
      startRotation: rotationDegrees,
      startTime: Date.now(),
      startX: point.x,
      startY: point.y,
      moved: false,
      readyForCenter: false,
      rotateOnly: true,
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
    const angularTravelled = angularDistance(angleFromPoint(point.x, point.y), dragState.startAngle);

    if (!dragState.moved && (angularTravelled > 2 || (travelled > DRAG_DISTANCE_THRESHOLD && nextRadius <= CENTER_COMMIT_THRESHOLD))) {
      dragState.moved = true;
      dragState.startAngle = angleFromPoint(point.x, point.y);
      dragState.startRotation = rotationDegrees;
    }

    if (!dragState.moved) return;

    if (!dragState.rotateOnly && dragState.activePartNumber !== centerPartNumber && nextRadius <= CENTER_COMMIT_THRESHOLD) {
      setCenterPreviewPartNumber(dragState.activePartNumber);
      dragState.readyForCenter = true;
      return;
    }

    // If we just exited the center zone, reset the drag reference
    // so rotation continues smoothly from the current position
    if (dragState.readyForCenter || centerPreviewPartNumber !== null) {
      dragState.startAngle = angleFromPoint(point.x, point.y);
      dragState.startRotation = rotationDegrees;
    }

    dragState.readyForCenter = false;
    setCenterPreviewPartNumber(null);

    const nextAngle = angleFromPoint(point.x, point.y);
    const delta = normalizeDegrees(nextAngle - dragState.startAngle);
    const currentRotation = dragState.startRotation + delta;
    setRotationDegrees(currentRotation);

    // Update activePartNumber to whichever segment the pointer is nearest
    if (!dragState.rotateOnly && nextRadius <= LABEL_RADIUS) {
      const pointerAngle = nextAngle;
      let bestPart = dragState.activePartNumber;
      let bestDist = Infinity;
      for (let i = 0; i < outerParts.length; i++) {
        const segAngle = currentRotation + i * SEGMENT_ANGLE;
        const dist = angularDistance(pointerAngle, segAngle);
        if (dist < bestDist) {
          bestDist = dist;
          bestPart = outerParts[i].partNumber;
        }
      }
      dragState.activePartNumber = bestPart;
    }
  };

  const handlePointerUp = (event: h.JSX.TargetedPointerEvent<SVGSVGElement>) => {
    finishDrag(event.pointerId);
  };

  const handlePointerCancel = (event: h.JSX.TargetedPointerEvent<SVGSVGElement>) => {
    finishDrag(event.pointerId);
  };

  return (
    <div class="grid gap-3 sm:gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)] xl:items-start">
      <div class="sm:rounded-[1.75rem] sm:border sm:border-slate-200 sm:bg-slate-50 sm:p-6">
        <svg
          ref={svgRef}
          viewBox={`${VIEWBOX_INSET} ${VIEWBOX_INSET} ${VIEWBOX_SIZE - VIEWBOX_INSET * 2} ${VIEWBOX_SIZE - VIEWBOX_INSET * 2}`}
          class="mx-auto aspect-square w-full max-w-[38rem] cursor-grab touch-none select-none active:cursor-grabbing sm:max-w-[42rem]"
          style={{ overflow: 'visible' }}
          role="img"
          aria-label="Interactive circle navigation for the ten parts of the Propaedia"
          onPointerDown={handleBackgroundPointerDown}
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
            const swapOffset = postSwapState && postSwapT > 0
              ? (postSwapState.angularOffsets.get(part.partNumber) ?? 0) * postSwapT
              : 0;
            const isPostSwapMorphing = postSwapState?.oldCenterPartNumber === part.partNumber && postSwapT > 0;
            const centerAngle = rotationDegrees + index * SEGMENT_ANGLE + swapOffset;
            const startAngle = centerAngle - SEGMENT_ANGLE / 2;
            const endAngle = centerAngle + SEGMENT_ANGLE / 2;
            const labelPosition = polar(CENTER, CENTER, LABEL_RADIUS, centerAngle);
            const labelLines = wrapLabel(part.title);
            const textAnchor = textAnchorForAngle(centerAngle);
            const labelX =
              labelPosition.x + (textAnchor === 'start' ? -30 : textAnchor === 'end' ? 30 : 0);
            const isSelected = selectedPartNumber === part.partNumber;
            const isTop = topPart.partNumber === part.partNumber;
            const distFromTop = angularDistance(centerAngle, 0);
            const topWeight = Math.max(0, 1 - distFromTop / SEGMENT_ANGLE);
            const segmentInnerRadius = lerp(INNER_RADIUS, INNER_RADIUS - 10, topWeight);
            const segmentOuterRadius = lerp(OUTER_RADIUS, OUTER_RADIUS + 12, topWeight);
            const numberPosition = polar(CENTER, CENTER, lerp(134, 138, topWeight), centerAngle);
            const connectorStart = polar(CENTER, CENTER, segmentOuterRadius + 6, centerAngle);
            const connectorEnd = polar(CENTER, CENTER, lerp(CONNECTOR_RADIUS, CONNECTOR_RADIUS + 8, topWeight), centerAngle);

            return (
              <g key={part.partNumber}>
                <path
                  d={donutSlicePath(CENTER, CENTER, segmentInnerRadius, LABEL_RADIUS, startAngle, endAngle)}
                  fill="transparent"
                  class="cursor-pointer"
                  onPointerDown={handleSegmentPointerDown(part.partNumber)}
                />
                <path
                  d={donutSlicePath(CENTER, CENTER, segmentInnerRadius, segmentOuterRadius, startAngle - 0.3, endAngle + 0.3)}
                  fill={part.colorHex}
                  stroke="none"
                  stroke-width={0}
                  stroke-linejoin="round"
                  paint-order="stroke fill"
                  opacity={
                    part.partNumber === morphPartNumber && morphT > 0
                      ? Math.max(0, 1 - morphT * 1.5)
                      : isPostSwapMorphing
                        ? 0
                        : (isSelected ? 1 : lerp(0.94, 1, topWeight))
                  }
                  class="cursor-grab active:cursor-grabbing"
                  onPointerDown={handleSegmentPointerDown(part.partNumber)}
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

                <g
                  class="cursor-pointer"
                  onPointerDown={handleSegmentPointerDown(part.partNumber)}
                >
                  <line
                    x1={connectorStart.x}
                    y1={connectorStart.y}
                    x2={connectorEnd.x}
                    y2={connectorEnd.y}
                    stroke={isSelected || topWeight > 0.5 ? part.colorHex : '#cbd5e1'}
                    stroke-width={isSelected ? 2.5 : lerp(1.5, 2.5, topWeight)}
                  />
                  <circle cx={connectorEnd.x} cy={connectorEnd.y} r={3.5} fill={part.colorHex} />
                  <text
                    x={labelX}
                    y={labelPosition.y - (labelLines.length * 8)}
                    fill={isSelected || topWeight > 0.5 ? '#0f172a' : '#334155'}
                    font-size={`${lerp(11, 12, topWeight)}`}
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
                        font-size={`${lerp(13, 14, topWeight)}`}
                        font-weight={isSelected || topWeight > 0.5 ? '700' : '600'}
                        letter-spacing="0"
                      >
                        {line}
                      </tspan>
                    ))}
                  </text>
                </g>
              </g>
            );
          })}

          {selectedOuterPart && (() => {
            const selectedIndex = outerParts.findIndex((part) => part.partNumber === selectedOuterPart.partNumber);
            const selSwapOffset = postSwapState && postSwapT > 0
              ? (postSwapState.angularOffsets.get(selectedOuterPart.partNumber) ?? 0) * postSwapT
              : 0;
            const centerAngle = rotationDegrees + selectedIndex * SEGMENT_ANGLE + selSwapOffset;
            const startAngle = centerAngle - SEGMENT_ANGLE / 2;
            const endAngle = centerAngle + SEGMENT_ANGLE / 2;
            const selDistFromTop = angularDistance(centerAngle, 0);
            const selTopWeight = Math.max(0, 1 - selDistFromTop / SEGMENT_ANGLE);
            const segmentInnerRadius = lerp(INNER_RADIUS, INNER_RADIUS - 10, selTopWeight);
            const segmentOuterRadius = lerp(OUTER_RADIUS, OUTER_RADIUS + 12, selTopWeight);
            const outlineInset = SELECTION_OUTLINE_WIDTH / 2;
            const outlineInner = Math.max(segmentInnerRadius + outlineInset, CENTER_DISC_RADIUS + outlineInset);
            const isMorphing = morphPartNumber === selectedOuterPart.partNumber && morphT > 0;
            const isPostSwapPart = postSwapState?.oldCenterPartNumber === selectedOuterPart.partNumber && postSwapT > 0;

            return (
              <path
                d={isMorphing
                  ? morphedDonutPath(
                      CENTER, CENTER,
                      outlineInner, segmentOuterRadius - outlineInset,
                      startAngle, endAngle,
                      CENTER_DISC_RADIUS - outlineInset,
                      morphT
                    )
                  : donutSlicePath(
                      CENTER, CENTER,
                      outlineInner, segmentOuterRadius - outlineInset,
                      startAngle, endAngle
                    )
                }
                fill="none"
                stroke="#0f172a"
                stroke-width={SELECTION_OUTLINE_WIDTH}
                stroke-linejoin="round"
                pointer-events="none"
                opacity={isMorphing ? Math.max(0, 1 - morphT * 1.5) : isPostSwapPart ? 0 : 1}
              />
            );
          })()}

          {postSwapState && postSwapT > 0 && (() => {
            const oldCP = parts.find((p) => p.partNumber === postSwapState.oldCenterPartNumber);
            if (!oldCP) return null;
            const pIndex = outerParts.findIndex((p) => p.partNumber === oldCP.partNumber);
            if (pIndex === -1) return null;
            const pOffset = (postSwapState.angularOffsets.get(oldCP.partNumber) ?? 0) * postSwapT;
            const pCenterAngle = rotationDegrees + pIndex * SEGMENT_ANGLE + pOffset;
            const pStartAngle = pCenterAngle - SEGMENT_ANGLE / 2;
            const pEndAngle = pCenterAngle + SEGMENT_ANGLE / 2;
            const pDistFromTop = angularDistance(pCenterAngle, 0);
            const pTopWeight = Math.max(0, 1 - pDistFromTop / SEGMENT_ANGLE);
            const pInner = lerp(INNER_RADIUS, INNER_RADIUS - 10, pTopWeight);
            const pOuter = lerp(OUTER_RADIUS, OUTER_RADIUS + 12, pTopWeight);

            const outlineInset = SELECTION_OUTLINE_WIDTH / 2;
            const pOutlineInner = Math.max(pInner + outlineInset, CENTER_DISC_RADIUS + outlineInset);

            return (
              <>
                <path
                  d={morphedDonutPath(
                    CENTER, CENTER,
                    pInner, pOuter,
                    pStartAngle, pEndAngle,
                    CENTER_DISC_RADIUS,
                    postSwapT
                  )}
                  fill={oldCP.colorHex}
                  pointer-events="none"
                />
                {selectedPartNumber === oldCP.partNumber && (
                  <path
                    d={morphedDonutPath(
                      CENTER, CENTER,
                      pOutlineInner, pOuter - outlineInset,
                      pStartAngle, pEndAngle,
                      CENTER_DISC_RADIUS - outlineInset,
                      postSwapT
                    )}
                    fill="none"
                    stroke="#0f172a"
                    stroke-width={SELECTION_OUTLINE_WIDTH}
                    stroke-linejoin="round"
                    pointer-events="none"
                  />
                )}
              </>
            );
          })()}

          {morphT > 0 && morphPartNumber !== null && (() => {
            const mPart = outerParts.find((p) => p.partNumber === morphPartNumber);
            if (!mPart) return null;
            const mIndex = outerParts.findIndex((p) => p.partNumber === morphPartNumber);
            const mCenterAngle = rotationDegrees + mIndex * SEGMENT_ANGLE;
            const mStartAngle = mCenterAngle - SEGMENT_ANGLE / 2;
            const mEndAngle = mCenterAngle + SEGMENT_ANGLE / 2;
            const mDistFromTop = angularDistance(mCenterAngle, 0);
            const mTopWeight = Math.max(0, 1 - mDistFromTop / SEGMENT_ANGLE);
            const mInner = lerp(INNER_RADIUS, INNER_RADIUS - 10, mTopWeight);
            const mOuter = lerp(OUTER_RADIUS, OUTER_RADIUS + 12, mTopWeight);

            return (
              <path
                d={morphedDonutPath(
                  CENTER, CENTER,
                  mInner, mOuter,
                  mStartAngle, mEndAngle,
                  CENTER_DISC_RADIUS,
                  morphT
                )}
                fill={mPart.colorHex}
                pointer-events="none"
              />
            );
          })()}

          <g
            role="button"
            tabIndex={0}
            class="cursor-pointer"
            style={{ outline: 'none' }}
            onPointerDown={(event) => {
              event.preventDefault();
              setCenterHasFocus(false);
            }}
            onClick={() => setSelectedPartNumber(centerPart.partNumber)}
            onFocus={() => {
              setCenterHasFocus(true);
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
                r={CENTER_DISC_RADIUS - FOCUS_RING_WIDTH / 2}
                fill="none"
                stroke="#0f172a"
                stroke-width={FOCUS_RING_WIDTH}
                opacity="0.35"
                pointer-events="none"
              />
            )}
            <circle
              cx={CENTER}
              cy={CENTER}
              r={CENTER_DISC_RADIUS}
              fill={centerDisplayPart.colorHex}
              opacity={1}
            />
            {(selectedPartNumber === centerPart.partNumber && !(morphT > 0 && morphPartNumber !== null)) || (morphPartNumber === selectedPartNumber && morphT > 0.95) ? (
              <circle
                cx={CENTER}
                cy={CENTER}
                r={CENTER_DISC_RADIUS - SELECTION_OUTLINE_WIDTH / 2}
                fill="none"
                stroke="#0f172a"
                stroke-width={SELECTION_OUTLINE_WIDTH}
                pointer-events="none"
              />
            ) : null}
            <g opacity={
              1
            }>
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
          </g>
        </svg>

        <div class="mt-2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-sm sm:mt-5 sm:rounded-[1.1rem] sm:px-5 sm:py-3">
          <p class="text-[0.68rem] font-sans font-semibold uppercase tracking-[0.2em] text-slate-500 sm:text-sm sm:tracking-[0.18em]">
            Current emphasis
          </p>
          <p class="mt-1 text-sm font-serif leading-6 text-slate-700 sm:text-base sm:leading-7">
            Your curriculum is built around {centerPart.title.toLowerCase()} with {topPart.title.toLowerCase()} as the secondary emphasis.
          </p>
          <div class="mt-3 border-t border-slate-200 pt-3">
            <p class="text-[0.68rem] font-sans font-semibold uppercase tracking-[0.2em] text-slate-500 sm:text-xs">
              Where these fields connect
            </p>
            {suggestedSections.length > 0 ? (
              <ul class="mt-2 space-y-1">
                {suggestedSections.map((s) => {
                  const part = parts.find((p) => p.partNumber === s.section.partNumber);
                  return (
                    <li key={s.section.sectionCode}>
                      <a
                        href={`${baseUrl}/section/${s.section.sectionCode.replace(/\//g, '-')}`}
                        class="group flex items-start gap-1.5 rounded px-1 py-1 text-xs transition hover:bg-slate-50 sm:text-sm"
                      >
                        <span
                          class="mt-1 inline-block h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: part?.colorHex || '#94a3b8' }}
                        />
                        <span class="text-slate-700 group-hover:text-indigo-700">{s.section.title}</span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p class="mt-1 text-xs leading-5 text-slate-400 sm:text-sm">
                No direct cross-references between these two parts.
              </p>
            )}
          </div>
        </div>
      </div>

      <div class="space-y-2 sm:space-y-4">
        <div class="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm sm:rounded-[1.75rem] sm:p-6">
          <p class="text-sm font-sans font-semibold uppercase tracking-[0.18em] text-slate-500">
            Selected Part
          </p>
          <h3 class="mt-2 text-xl font-serif font-bold text-slate-900 sm:mt-3 sm:text-2xl">
            {selectedPart.partName}: {selectedPart.title}
          </h3>

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

        <div class="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm sm:rounded-[1.75rem] sm:p-6">
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
