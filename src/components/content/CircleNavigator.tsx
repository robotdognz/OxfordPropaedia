import { h } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useCoverageLayerPreferenceState } from '../../hooks/useCoverageLayerPreferenceState';
import { useReadingChecklistState } from '../../hooks/useReadingChecklistState';
import { useReadingPreferenceState } from '../../hooks/useReadingPreferenceState';
import { fetchHomepageCoverageSource } from '../../utils/homepageCoverageSource';
import type { HomepageCoverageSource } from '../../utils/homepageCoverageTypes';
import { READING_TYPE_ORDER, type ReadingType } from '../../utils/readingPreference';
import {
  CenteredCircleNavigatorPanel,
  TopPartCircleNavigatorPanel,
} from './CircleNavigatorPanels';
import type {
  CircleNavigatorPart,
  CircleNavigatorProps,
  ConnectionSummary,
  SectionConnection,
  SectionMeta,
} from './circleNavigatorShared';
import { getConnectionKey } from './circleNavigatorShared';
import { roundedDonutSliceBoundaryPoints, roundedDonutSlicePath } from '../../utils/donutPaths';
import {
  CONTROL_CARD_CLASS,
  CONTROL_CARD_INTERACTIVE_CLASS,
  CONTROL_LABEL_CLASS,
  CONTROL_SURFACE_CLASS,
  CONTROL_TITLE_CLASS,
} from '../ui/controlTheme';

const VIEWBOX_SIZE = 680;
const VIEWBOX_INSET = 32;
const CENTER = VIEWBOX_SIZE / 2;
const OUTER_RADIUS = 188;
const INNER_RADIUS = 106;
const INTERACTIVE_RADIUS = 332; // Touch/click boundary - covers labels and surrounding area
const LABEL_BOX_WIDTH = 112;
const LABEL_WRAP_LENGTH = 16;
const LABEL_MAX_LINES = 2;
const LABEL_LINE_HEIGHT = 16;
const LABEL_CENTER_RADIUS = OUTER_RADIUS + 32 + LABEL_BOX_WIDTH / 2;
const FULL_SEGMENT_COUNT = 10;
const FULL_SEGMENT_ANGLE = 360 / FULL_SEGMENT_COUNT;
const RING_SEGMENT_COUNT = 9;
const RING_SEGMENT_ANGLE = 360 / RING_SEGMENT_COUNT;
const NO_CENTER_INNER_RADIUS = INNER_RADIUS;
const CENTER_DISC_RADIUS = INNER_RADIUS - 8;
const DRAG_DISTANCE_THRESHOLD = 6;
const CENTER_PREVIEW_THRESHOLD = CENTER_DISC_RADIUS + 2;
const CENTER_COMMIT_THRESHOLD = CENTER_DISC_RADIUS - 16;
const CENTER_EXIT_HYSTERESIS = 20;
const SELECTION_OUTLINE_WIDTH = 4;
const FOCUS_RING_WIDTH = 3;
const SEGMENT_GAP_PX = 7;
const SEGMENT_CORNER_RADIUS = 6;
const MORPH_POINT_COUNT = 40;
const STORAGE_KEY = 'propaedia-circle-navigator-v1';
const homepageCoverageSourceCache = new Map<ReadingType, HomepageCoverageSource>();

function joinBaseUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

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
const POST_SWAP_DURATION_MS = 400;
const POST_SWAP_SETTLE_T = 0.12;

function reverseAngularOffsets(offsets: Map<number, number>): Map<number, number> {
  return new Map(Array.from(offsets, ([partNumber, offset]) => [partNumber, -offset]));
}

function createPostSwapAnimationState(
  oldCenterPartNumber: number,
  oldSegAngle: number,
  angularOffsets: Map<number, number>
): PostSwapAnimationState {
  return { oldCenterPartNumber, oldSegAngle, angularOffsets };
}

function morphedDonutPath(
  cx: number,
  cy: number,
  srcInner: number,
  srcOuter: number,
  srcStartAngle: number,
  srcEndAngle: number,
  targetRadius: number,
  t: number,
  options: {
    gapPx?: number;
    cornerRadiusPx?: number;
    pointCount?: number;
  } = {}
): string {
  const sourcePoints = roundedDonutSliceBoundaryPoints(
    cx,
    cy,
    srcInner,
    srcOuter,
    srcStartAngle,
    srcEndAngle,
    { ...options, pointCount: options.pointCount ?? MORPH_POINT_COUNT }
  );

  if (sourcePoints.length === 0) return '';

  let path = '';
  const stepAngle = 360 / sourcePoints.length;

  for (let index = 0; index < sourcePoints.length; index += 1) {
    const point = sourcePoints[index];
    const target = polar(cx, cy, targetRadius, srcStartAngle + stepAngle * index);
    const x = lerp(point.x, target.x, t);
    const y = lerp(point.y, target.y, t);
    path += index === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
  }

  return `${path} Z`;
}

function normalizeDegrees(value: number): number {
  let nextValue = value;

  while (nextValue <= -180) nextValue += 360;
  while (nextValue > 180) nextValue -= 360;

  return nextValue;
}

function snapRotation(value: number, segAngle: number = RING_SEGMENT_ANGLE): number {
  return Math.round(value / segAngle) * segAngle;
}

function angularDistance(a: number, b: number): number {
  return Math.abs(normalizeDegrees(a - b));
}

function closestEquivalentRotation(target: number, reference: number): number {
  return reference + normalizeDegrees(target - reference);
}

function topPartNumberForRotation(parts: CircleNavigatorPart[], rotation: number, segAngle?: number): number {
  if (parts.length === 0) return 1;
  const angle = segAngle ?? 360 / parts.length;

  return parts.reduce(
    (best, part, index) => {
      const centerAngle = rotation + index * angle;
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getSegmentNumberRadius(innerRadius: number, outerRadius: number, emphasis = 0): number {
  const baseRatio = lerp(0.45, 0.49, emphasis);
  return lerp(innerRadius, outerRadius, baseRatio);
}

function getSegmentNumberFontSize(emphasis = 0): number {
  return lerp(25, 27, emphasis);
}

function getPartLabelFontSize(emphasis = 0): number {
  return lerp(14.75, 16.4, emphasis);
}

function getPartLabelFontWeight(emphasis = 0): '600' | '700' {
  return emphasis > 0.45 ? '700' : '600';
}

function getPartLabelLayout(angle: number, title: string) {
  const labelCenter = polar(CENTER, CENTER, LABEL_CENTER_RADIUS, angle);

  return {
    textAnchor: 'middle' as const,
    labelX: labelCenter.x,
    labelY: labelCenter.y,
    labelLines: wrapLabel(title, LABEL_WRAP_LENGTH, LABEL_MAX_LINES),
  };
}

function partLabelLineY(labelY: number, lineIndex: number, lineCount: number) {
  return labelY + (lineIndex - (lineCount - 1) / 2) * LABEL_LINE_HEIGHT;
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
  draggingFromCenter: boolean;
};

type PostSwapAnimationState = {
  oldCenterPartNumber: number;
  oldSegAngle: number;
  angularOffsets: Map<number, number>;
};

type PostSwapTransition = {
  state: PostSwapAnimationState;
  initialT: number;
};

type TransitionCommit = {
  nextCenterPartNumber: number | null;
  nextRotation: number;
  postSwap: PostSwapTransition | null;
};

function summarizeConnections(
  connections: Record<string, SectionConnection[]>,
  sectionMeta: Record<string, SectionMeta>,
  centerPart: number,
  topPart: number
): ConnectionSummary {
  if (centerPart === topPart) return { sections: [], isDirect: false, hasKeyword: false, hasConnectionData: false };
  const key = getConnectionKey(centerPart, topPart);
  const refs = connections[key] || [];

  if (refs.length > 0) {
    // Determine connection type: direct if none have 'via', 'sharedArticle', or 'keywordMatch'
    const hasDirect = refs.some((r) => !r.via && !r.sharedArticle && !(r as any).keywordMatch);
    const hasKeyword = refs.some((r) => (r as any).keywordMatch);
    const isDirect = hasDirect;

    const counts: Record<string, number> = {};
    refs.forEach((r) => {
      counts[r.sourceSection] = (counts[r.sourceSection] || 0) + 1;
      counts[r.targetSection] = (counts[r.targetSection] || 0) + 1;
    });

    const sections = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([code, count]) => ({
        section: sectionMeta[code] || { title: code, partNumber: 0, sectionCode: code },
        refCount: count,
      }))
      .filter((s) => s.section.partNumber > 0);
    return { sections, isDirect, hasKeyword, hasConnectionData: true };
  }

  // No connections at all: find the most cross-referenced sections from each part
  const allRefs = Object.values(connections).flat();
  const counts: Record<string, number> = {};
  allRefs.forEach((r) => {
    const sp = sectionMeta[r.sourceSection]?.partNumber;
    const tp = sectionMeta[r.targetSection]?.partNumber;
    if (sp === centerPart || sp === topPart) counts[r.sourceSection] = (counts[r.sourceSection] || 0) + 1;
    if (tp === centerPart || tp === topPart) counts[r.targetSection] = (counts[r.targetSection] || 0) + 1;
  });

  // Pick top 3 from each part
  const fromCenter = Object.entries(counts)
    .filter(([code]) => sectionMeta[code]?.partNumber === centerPart)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const fromTop = Object.entries(counts)
    .filter(([code]) => sectionMeta[code]?.partNumber === topPart)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const sections = [...fromCenter, ...fromTop]
    .map(([code, count]) => ({
      section: sectionMeta[code] || { title: code, partNumber: 0, sectionCode: code },
      refCount: count,
    }))
    .filter((s) => s.section.partNumber > 0);
  return { sections, isDirect: false, hasKeyword: false, hasConnectionData: sections.length > 0 };
}

export default function CircleNavigator({
  parts,
  connections,
  sectionMeta,
  baseUrl,
}: CircleNavigatorProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const [centerHasFocus, setCenterHasFocus] = useState(false);
  const checklistState = useReadingChecklistState();
  const readingPref = useReadingPreferenceState();
  const selectedCoverageLayer = useCoverageLayerPreferenceState();
  const [coverageSourceCache, setCoverageSourceCache] = useState<Partial<Record<ReadingType, HomepageCoverageSource>>>(() => {
    const initialCache: Partial<Record<ReadingType, HomepageCoverageSource>> = {};
    READING_TYPE_ORDER.forEach((type) => {
      const cached = homepageCoverageSourceCache.get(type);
      if (cached) {
        initialCache[type] = cached;
      }
    });
    return initialCache;
  });
  const [hasLoadedState, setHasLoadedState] = useState(false);
  const [centerPartNumber, setCenterPartNumber] = useState<number | null>(null);
  const [rotationDegrees, setRotationDegrees] = useState(0);
  const rotationDegreesRef = useRef(0);
  const coverageSourceCacheRef = useRef(coverageSourceCache);
  const coverageSourceLoadingRef = useRef<Set<ReadingType>>(new Set());
  // selectedPartNumber removed - focus is always topPart (no centre) or centerPart (with centre)
  const [centerPreviewPartNumber, setCenterPreviewPartNumber] = useState<number | null>(null);
  const [morphT, setMorphT] = useState(0);
  const morphTRef = useRef(0);
  const [morphPartNumber, setMorphPartNumber] = useState<number | null>(null);
  const morphAnimRef = useRef<number | null>(null);
  const morphStartTimeRef = useRef(0);
  const morphFromTRef = useRef(0);
  const centerCommitTimeoutRef = useRef<number | null>(null);

  const [postSwapT, setPostSwapT] = useState(0);
  const [postSwapState, setPostSwapState] = useState<PostSwapAnimationState | null>(null);
  const postSwapAnimRef = useRef<number | null>(null);
  const skipMorphReverseRef = useRef(false);
  const snapTargetRef = useRef<number | null>(null);
  const snapAnimRef = useRef<number | null>(null);

  const centerPreviewRotationRef = useRef<number>(0);

  const [centerRemovePreview, setCenterRemovePreview] = useState(false);
  const [removeMorphT, setRemoveMorphT] = useState(0);
  const removeMorphTRef = useRef(0);
  const removeMorphAnimRef = useRef<number | null>(null);
  const removeMorphFromTRef = useRef(0);
  const removeMorphStartTimeRef = useRef(0);

  coverageSourceCacheRef.current = coverageSourceCache;

  const setRotationDegreesState = (nextRotation: number) => {
    rotationDegreesRef.current = nextRotation;
    setRotationDegrees(nextRotation);
  };

  const setMorphProgress = (nextMorphT: number) => {
    morphTRef.current = nextMorphT;
    setMorphT(nextMorphT);
  };

  const setRemoveMorphProgress = (nextRemoveMorphT: number) => {
    removeMorphTRef.current = nextRemoveMorphT;
    setRemoveMorphT(nextRemoveMorphT);
  };

  const startMorphReverseAnimation = () => {
    if (morphAnimRef.current) {
      cancelAnimationFrame(morphAnimRef.current);
      morphAnimRef.current = null;
    }

    if (morphTRef.current < 0.01 || morphPartNumber === null) {
      setMorphProgress(0);
      setMorphPartNumber(null);
      return;
    }

    morphFromTRef.current = morphTRef.current;
    morphStartTimeRef.current = performance.now();
    const animate = (now: number) => {
      const elapsed = now - morphStartTimeRef.current;
      const rawT = Math.min(elapsed / (MORPH_DURATION_MS * 0.5), 1);
      const nextT = lerp(morphFromTRef.current, 0, easeOutCubic(rawT));
      setMorphProgress(nextT);
      if (rawT < 1) {
        morphAnimRef.current = requestAnimationFrame(animate);
      } else {
        morphAnimRef.current = null;
        setMorphProgress(0);
        setMorphPartNumber(null);
      }
    };
    morphAnimRef.current = requestAnimationFrame(animate);
  };

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
        setMorphProgress(nextT);
        if (rawT < 1) {
          morphAnimRef.current = requestAnimationFrame(animate);
        }
      };
      morphAnimRef.current = requestAnimationFrame(animate);
    } else if (skipMorphReverseRef.current) {
      skipMorphReverseRef.current = false;
    } else if (morphTRef.current < 0.01) {
      // Already at 0, no animation needed
    } else {
      startMorphReverseAnimation();
    }

    return () => {
      if (morphAnimRef.current) cancelAnimationFrame(morphAnimRef.current);
    };
  }, [centerPreviewPartNumber]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const preventTouchScrollWhileDragging = (event: TouchEvent) => {
      if (dragStateRef.current) event.preventDefault();
    };

    svg.addEventListener('touchmove', preventTouchScrollWhileDragging, { passive: false });

    return () => {
      svg.removeEventListener('touchmove', preventTouchScrollWhileDragging);
    };
  }, []);

  // Animate removeMorphT when center-remove preview toggles
  useEffect(() => {
    if (removeMorphAnimRef.current) {
      cancelAnimationFrame(removeMorphAnimRef.current);
      removeMorphAnimRef.current = null;
    }

    if (centerRemovePreview) {
      removeMorphFromTRef.current = removeMorphT;
      removeMorphStartTimeRef.current = performance.now();
      const animate = (now: number) => {
        const elapsed = now - removeMorphStartTimeRef.current;
        const rawT = Math.min(elapsed / MORPH_DURATION_MS, 1);
        const nextT = lerp(removeMorphFromTRef.current, 1, easeOutCubic(rawT));
        setRemoveMorphProgress(nextT);
        if (rawT < 1) {
          removeMorphAnimRef.current = requestAnimationFrame(animate);
        }
      };
      removeMorphAnimRef.current = requestAnimationFrame(animate);
    } else if (removeMorphT < 0.01) {
      // Already at 0
    } else {
      removeMorphFromTRef.current = removeMorphT;
      removeMorphStartTimeRef.current = performance.now();
      const animate = (now: number) => {
        const elapsed = now - removeMorphStartTimeRef.current;
        const rawT = Math.min(elapsed / (MORPH_DURATION_MS * 0.5), 1);
        const nextT = lerp(removeMorphFromTRef.current, 0, easeOutCubic(rawT));
        setRemoveMorphProgress(nextT);
        if (rawT < 1) {
          removeMorphAnimRef.current = requestAnimationFrame(animate);
        }
      };
      removeMorphAnimRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (removeMorphAnimRef.current) cancelAnimationFrame(removeMorphAnimRef.current);
    };
  }, [centerRemovePreview]);

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
      const rawCenter = parsed?.centerPartNumber;
      const nextCenterPartNumber = rawCenter === null || rawCenter === undefined ? null : Number(rawCenter);
      const nextRotationDegrees = Number(parsed?.rotationDegrees);
      const loadedHasCenter = nextCenterPartNumber !== null && knownParts.has(nextCenterPartNumber);
      if (loadedHasCenter) {
        setCenterPartNumber(nextCenterPartNumber);
      } else if (rawCenter === null) {
        setCenterPartNumber(null);
      }

      if (Number.isFinite(nextRotationDegrees)) {
        const loadedSegAngle = loadedHasCenter ? RING_SEGMENT_ANGLE : FULL_SEGMENT_ANGLE;
        setRotationDegreesState(snapRotation(nextRotationDegrees, loadedSegAngle));
      }
    } catch {
      // Ignore invalid stored state.
    } finally {
      setHasLoadedState(true);
    }
  }, [parts]);

  async function ensureCoverageSourceLoaded(type: ReadingType) {
    if (coverageSourceCacheRef.current[type]) return;
    if (coverageSourceLoadingRef.current.has(type)) return;

    coverageSourceLoadingRef.current.add(type);
    try {
      const cached = homepageCoverageSourceCache.get(type);
      const source = cached ?? await fetchHomepageCoverageSource(type, baseUrl);
      homepageCoverageSourceCache.set(type, source);
      setCoverageSourceCache((current) => {
        if (current[type]) return current;
        return {
          ...current,
          [type]: source,
        };
      });
    } catch {
      // Keep the panel interactive even if the auxiliary coverage source fails.
    } finally {
      coverageSourceLoadingRef.current.delete(type);
    }
  }

  useEffect(() => {
    void ensureCoverageSourceLoaded(readingPref);

    const preload = () => {
      READING_TYPE_ORDER.forEach((type) => {
        if (type !== readingPref) {
          void ensureCoverageSourceLoaded(type);
        }
      });
    };

    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(preload);
    } else {
      window.setTimeout(preload, 1000);
    }
  }, [baseUrl, readingPref]);

  useEffect(() => {
    if (!hasLoadedState || typeof window === 'undefined') return;

    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          centerPartNumber,
          rotationDegrees: snapRotation(rotationDegrees, segmentAngle),
        })
      );
    } catch {
      // Ignore storage failures and keep the UI interactive.
    }
  }, [centerPartNumber, hasLoadedState, rotationDegrees]);

  const hasCenter = centerPartNumber !== null;
  const centerPart = hasCenter ? (parts.find((part) => part.partNumber === centerPartNumber) ?? parts[0]) : null;
  const outerParts = hasCenter ? parts.filter((part) => part.partNumber !== centerPartNumber) : parts;
  const segmentAngle = 360 / outerParts.length;
  const topPartNumber = topPartNumberForRotation(outerParts, rotationDegrees, segmentAngle);
  const topPart = outerParts.find((part) => part.partNumber === topPartNumber) ?? outerParts[0];
  // Focus part: center part if one exists, otherwise the top part
  const focusPart = centerPart ?? topPart;
  const previewCenterPart = parts.find((part) => part.partNumber === centerPreviewPartNumber) ?? null;
  const centerDisplayPart = previewCenterPart ?? centerPart;
  const isCenterPreviewActive = centerPreviewPartNumber !== null;
  const isCenterSwapPreviewActive = hasCenter && centerPreviewPartNumber !== null;
  const isCenterSwapPreviewReversing = hasCenter && centerPreviewPartNumber === null && morphT > 0 && morphPartNumber !== null;
  const centerSwapReturnOpacity = isCenterSwapPreviewReversing
    ? Math.max(0, Math.min(1, (0.45 - morphT) / 0.45))
    : 1;
  const centerPreviewOutlineOpacity = isCenterSwapPreviewActive
    ? Math.max(0, Math.min(1, (morphT - 0.2) / 0.5))
    : 1;
  const dragMorphOutlineOpacity = isCenterSwapPreviewActive
    ? Math.max(0, 1 - centerPreviewOutlineOpacity)
    : isCenterSwapPreviewReversing
      ? 0
      : 1;
  const centerDiscOutlineOpacity = isCenterSwapPreviewActive
    ? centerPreviewOutlineOpacity
    : isCenterSwapPreviewReversing
      ? centerSwapReturnOpacity
      : 1;
  const centerDiscContentOpacity = isCenterSwapPreviewActive
    ? centerPreviewOutlineOpacity
    : isCenterSwapPreviewReversing
      ? centerSwapReturnOpacity
      : 1;
  const showCenterDiscOutline = removeMorphT === 0 && (
    isCenterSwapPreviewActive
    || ((hasCenter || (morphT > 0.9 && morphPartNumber !== null)) && !isCenterPreviewActive)
  );
  const centerTitleLines = centerDisplayPart ? wrapLabel(centerDisplayPart.title, 14, 2) : [];
  const connectionSummary = hasCenter ? summarizeConnections(connections, sectionMeta, centerPartNumber, topPartNumber) : null;
  const suggestedSections = connectionSummary?.sections ?? [];
  const effectiveInnerRadius = hasCenter ? INNER_RADIUS : NO_CENTER_INNER_RADIUS;

  // Pre-compute angular offsets for the remove-from-center preview
  const removePreviewOffsets = (() => {
    if (!hasCenter || !centerPart) return null;
    const fullOuter = parts;
    const fullSegAngle = 360 / fullOuter.length;
    const fullIndexMap = new Map(fullOuter.map((p, i) => [p.partNumber, i]));
    const curIndexMap = new Map(outerParts.map((p, i) => [p.partNumber, i]));
    const fullTopIdx = fullIndexMap.get(topPartNumber);
    const fullRotation = fullTopIdx !== undefined ? -fullTopIdx * fullSegAngle : 0;

    const offsets = new Map<number, number>();
    for (const p of outerParts) {
      const curIdx = curIndexMap.get(p.partNumber)!;
      const fullIdx = fullIndexMap.get(p.partNumber)!;
      const curAngle = rotationDegrees + curIdx * segmentAngle;
      const fullAngle = fullRotation + fullIdx * fullSegAngle;
      const shift = normalizeDegrees(fullAngle - curAngle);
      if (Math.abs(shift) > 0.01) offsets.set(p.partNumber, shift);
    }
    return { offsets, fullRotation, fullSegAngle };
  })();

  // Pre-compute angular offsets for the move-to-center preview
  // Use morphPartNumber as fallback so offsets persist during reverse animation
  // Use the locked snapped rotation so offsets stay stable while the snap animation runs
  const centerPreviewOffsets = (() => {
    const previewPN = centerPreviewPartNumber ?? (morphT > 0 ? morphPartNumber : null);
    if (previewPN === null) return null;

    // When swapping (center exists), new outer = current outer minus dragged + old center
    // When no center, new outer = current outer minus dragged
    const newOuterParts = hasCenter
      ? parts.filter((p) => p.partNumber !== previewPN)
      : outerParts.filter((p) => p.partNumber !== previewPN);
    if (newOuterParts.length === outerParts.length && !hasCenter) return null;
    const newSegAngle = 360 / newOuterParts.length;
    const curIndexMap = new Map(outerParts.map((p, i) => [p.partNumber, i]));
    const newIndexMap = new Map(newOuterParts.map((p, i) => [p.partNumber, i]));
    const stableRotation = centerPreviewRotationRef.current;
    let currentTopPN = topPartNumberForRotation(outerParts, stableRotation, segmentAngle);
    // If the top part is the one being moved to center, pick the next part in the ring
    if (currentTopPN === previewPN) {
      const topIdx = outerParts.findIndex((p) => p.partNumber === currentTopPN);
      const nextIdx = (topIdx + 1) % outerParts.length;
      currentTopPN = outerParts[nextIdx].partNumber;
    }
    const newTopIdx = newIndexMap.get(currentTopPN);
    const newRotation = newTopIdx !== undefined ? -newTopIdx * newSegAngle : snapRotation(stableRotation, newSegAngle);

    const offsets = new Map<number, number>();
    for (const p of outerParts) {
      if (p.partNumber === previewPN) continue; // this part is morphing to center
      const curIdx = curIndexMap.get(p.partNumber)!;
      const newIdx = newIndexMap.get(p.partNumber);
      if (newIdx === undefined) continue;
      const curAngle = stableRotation + curIdx * segmentAngle;
      const newAngle = newRotation + newIdx * newSegAngle;
      const shift = normalizeDegrees(newAngle - curAngle);
      if (Math.abs(shift) > 0.01) offsets.set(p.partNumber, shift);
    }

    // For the old center part (if swapping), compute its target position in the new ring
    let oldCenterTarget: { centerAngle: number; startAngle: number; endAngle: number } | null = null;
    if (hasCenter && centerPart) {
      const oldCIdx = newIndexMap.get(centerPart.partNumber);
      if (oldCIdx !== undefined) {
        const ca = newRotation + oldCIdx * newSegAngle;
        oldCenterTarget = { centerAngle: ca, startAngle: ca - newSegAngle / 2, endAngle: ca + newSegAngle / 2 };
      }
    }

    return { offsets, newSegAngle, newRotation, oldCenterTarget };
  })();

  const clearPostSwapAnimation = () => {
    if (postSwapAnimRef.current) {
      cancelAnimationFrame(postSwapAnimRef.current);
      postSwapAnimRef.current = null;
    }
    setPostSwapState(null);
    setPostSwapT(0);
  };

  const startPostSwapAnimation = (nextState: PostSwapAnimationState, initialT = 1) => {
    clearPostSwapAnimation();

    const clampedInitialT = Math.max(0, Math.min(1, initialT));
    if (clampedInitialT <= 0.001) {
      return;
    }

    setPostSwapState(nextState);
    setPostSwapT(clampedInitialT);

    const startTime = performance.now();
    const duration = Math.max(1, POST_SWAP_DURATION_MS * clampedInitialT);

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const rawT = Math.min(elapsed / duration, 1);
      const nextT = lerp(clampedInitialT, 0, easeOutCubic(rawT));
      setPostSwapT(nextT);

      if (rawT < 1) {
        postSwapAnimRef.current = requestAnimationFrame(animate);
      } else {
        postSwapAnimRef.current = null;
        setPostSwapState(null);
        setPostSwapT(0);
      }
    };

    postSwapAnimRef.current = requestAnimationFrame(animate);
  };

  const cancelCenterCommitTimeout = () => {
    if (centerCommitTimeoutRef.current !== null) {
      window.clearTimeout(centerCommitTimeoutRef.current);
      centerCommitTimeoutRef.current = null;
    }
  };

  const resetMoveToCenterPreviewState = (options: { skipReverse?: boolean } = {}) => {
    if (morphAnimRef.current) {
      cancelAnimationFrame(morphAnimRef.current);
      morphAnimRef.current = null;
    }
    setMorphProgress(0);
    setMorphPartNumber(null);
    if (options.skipReverse) skipMorphReverseRef.current = true;
    setCenterPreviewPartNumber(null);
  };

  const resetCenterRemovePreviewState = (options: { resetProgress?: boolean } = {}) => {
    if (removeMorphAnimRef.current) {
      cancelAnimationFrame(removeMorphAnimRef.current);
      removeMorphAnimRef.current = null;
    }
    setCenterRemovePreview(false);
    if (options.resetProgress) setRemoveMorphProgress(0);
  };

  const applyTransitionCommit = (commit: TransitionCommit) => {
    cancelCenterCommitTimeout();
    cancelSnapAnimation();
    setRotationDegreesState(commit.nextRotation);
    setCenterPartNumber(commit.nextCenterPartNumber);
    if (commit.postSwap) {
      startPostSwapAnimation(commit.postSwap.state, commit.postSwap.initialT);
    } else {
      clearPostSwapAnimation();
    }
  };

  const buildRemoveFromCenterCommit = (currentRotation: number, initialT = 1): TransitionCommit | null => {
    if (!hasCenter || centerPartNumber === null) return null;

    const removedPartNumber = centerPartNumber;
    const currentOuterParts = parts.filter((p) => p.partNumber !== removedPartNumber);
    const nextOuterParts = parts;
    const currentSegAngle = 360 / currentOuterParts.length;
    const nextSegAngle = 360 / nextOuterParts.length;
    const currentIndexMap = new Map(currentOuterParts.map((p, index) => [p.partNumber, index]));
    const nextIndexMap = new Map(nextOuterParts.map((p, index) => [p.partNumber, index]));
    const removedTopIdx = nextIndexMap.get(removedPartNumber);
    const nextRotation = removedTopIdx !== undefined ? -removedTopIdx * nextSegAngle : snapRotation(currentRotation, nextSegAngle);

    const angularOffsets = new Map<number, number>();
    for (const part of nextOuterParts) {
      const currentIdx = currentIndexMap.get(part.partNumber);
      const nextIdx = nextIndexMap.get(part.partNumber)!;
      if (currentIdx === undefined) continue;

      const currentAngle = currentRotation + currentIdx * currentSegAngle;
      const nextAngle = nextRotation + nextIdx * nextSegAngle;
      const shift = normalizeDegrees(currentAngle - nextAngle);
      if (Math.abs(shift) > 0.01) angularOffsets.set(part.partNumber, shift);
    }

    return {
      nextCenterPartNumber: null,
      nextRotation,
      postSwap: {
        state: createPostSwapAnimationState(removedPartNumber, currentSegAngle, angularOffsets),
        initialT,
      },
    };
  };

  const buildMoveToCenterCommit = (
    partToCenter: number,
    currentRotation: number,
    currentOuterParts: CircleNavigatorPart[],
    postSwap: PostSwapTransition | null = null
  ): TransitionCommit => {
    const nextOuterParts = hasCenter
      ? parts.filter((p) => p.partNumber !== partToCenter)
      : currentOuterParts.filter((p) => p.partNumber !== partToCenter);
    const currentSegAngle = 360 / currentOuterParts.length;
    const nextSegAngle = 360 / nextOuterParts.length;
    let currentTopPN = topPartNumberForRotation(currentOuterParts, currentRotation, currentSegAngle);

    if (currentTopPN === partToCenter) {
      const topIdx = currentOuterParts.findIndex((p) => p.partNumber === currentTopPN);
      const nextIdx = (topIdx + 1) % currentOuterParts.length;
      currentTopPN = currentOuterParts[nextIdx].partNumber;
    }

    const nextTopIdx = nextOuterParts.findIndex((p) => p.partNumber === currentTopPN);
    const nextRotation = nextTopIdx >= 0 ? -nextTopIdx * nextSegAngle : snapRotation(currentRotation, nextSegAngle);

    return {
      nextCenterPartNumber: partToCenter,
      nextRotation,
      postSwap,
    };
  };

  const buildDragRemoveFromCenterCommit = (): TransitionCommit | null => {
    if (!hasCenter || !centerPart || !removePreviewOffsets) return null;

    return {
      nextCenterPartNumber: null,
      nextRotation: removePreviewOffsets.fullRotation,
      postSwap: {
        state: createPostSwapAnimationState(
          centerPart.partNumber,
          segmentAngle,
          reverseAngularOffsets(removePreviewOffsets.offsets)
        ),
        initialT: Math.max(0, 1 - removeMorphTRef.current),
      },
    };
  };

  const buildDragMoveToCenterCommit = (partToCenter: number): TransitionCommit => {
    const oldCenterPartNumber = centerPart?.partNumber ?? null;
    const postSwap = hasCenter && oldCenterPartNumber !== null && centerPreviewOffsets
      ? {
          state: createPostSwapAnimationState(
            oldCenterPartNumber,
            segmentAngle,
            reverseAngularOffsets(centerPreviewOffsets.offsets)
          ),
          initialT: Math.max(0, 1 - morphTRef.current),
        }
      : null;

    return buildMoveToCenterCommit(partToCenter, rotationDegreesRef.current, outerParts, postSwap);
  };

  useEffect(() => {
    return () => {
      cancelCenterCommitTimeout();
    };
  }, []);

  const animateToCenter = (partNumber: number) => {
    if (partNumber === centerPartNumber) return;
    const currentRotation = rotationDegreesRef.current;
    const snapped = snapRotation(currentRotation, segmentAngle);
    if (Math.abs(snapped - currentRotation) > 0.5) {
      animateSnapRotation(currentRotation, snapped);
    }
    centerPreviewRotationRef.current = snapped;
    setCenterPreviewPartNumber(partNumber);
    // After morph preview completes, commit silently - the preview already
    // showed the rearrangement, so no post-swap animation needed
    cancelCenterCommitTimeout();
    centerCommitTimeoutRef.current = window.setTimeout(() => {
      centerCommitTimeoutRef.current = null;
      resetMoveToCenterPreviewState({ skipReverse: true });
      applyTransitionCommit(buildMoveToCenterCommit(partNumber, snapped, outerParts));
    }, MORPH_DURATION_MS);
  };

  const rotateLeft = () => {
    const currentRotation = rotationDegreesRef.current;
    const target = snapRotation(currentRotation + segmentAngle, segmentAngle);
    animateSnapRotation(currentRotation, target);
  };

  const rotateRight = () => {
    const currentRotation = rotationDegreesRef.current;
    const target = snapRotation(currentRotation - segmentAngle, segmentAngle);
    animateSnapRotation(currentRotation, target);
  };

  const rotatePartToTop = (partNumber: number) => {
    const partIndex = outerParts.findIndex((part) => part.partNumber === partNumber);
    if (partIndex === -1) return;
    const currentRotation = rotationDegreesRef.current;
    const target = closestEquivalentRotation(-partIndex * segmentAngle, currentRotation);
    animateSnapRotation(currentRotation, target);
  };

  const removeFromCenter = () => {
    const commit = buildRemoveFromCenterCommit(rotationDegreesRef.current, 1);
    if (!commit) return;

    resetMoveToCenterPreviewState();
    resetCenterRemovePreviewState({ resetProgress: true });
    applyTransitionCommit(commit);
  };

  const cancelSnapAnimation = () => {
    if (snapAnimRef.current) {
      cancelAnimationFrame(snapAnimRef.current);
      snapAnimRef.current = null;
      if (snapTargetRef.current !== null) {
        setRotationDegreesState(snapTargetRef.current);
        snapTargetRef.current = null;
      }
    }
  };

  const animateSnapRotation = (from: number, to: number) => {
    cancelSnapAnimation();
    const resolvedTo = closestEquivalentRotation(to, from);
    const distance = Math.abs(resolvedTo - from);
    snapTargetRef.current = resolvedTo;
    if (distance < 0.5) {
      if (from !== resolvedTo) setRotationDegreesState(resolvedTo);
      snapTargetRef.current = null;
      return;
    }
    const startTime = performance.now();
    const duration = Math.min(260, Math.max(100, distance * 7));
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const rawT = Math.min(elapsed / duration, 1);
      setRotationDegreesState(lerp(from, resolvedTo, easeOutCubic(rawT)));
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

    if (dragState.draggingFromCenter && centerRemovePreview) {
      // Dragged center disc outward past threshold - commit removal without replay animation
      // Snap directly to the 10-part layout (preview already showed the transition)
      const commit = buildDragRemoveFromCenterCommit();
      if (commit) {
        resetCenterRemovePreviewState({ resetProgress: true });
        applyTransitionCommit(commit);
      }
    } else if (dragState.draggingFromCenter) {
      // Dragged center disc but returned - cancel
      resetCenterRemovePreviewState();
    } else if (!dragState.rotateOnly && dragState.readyForCenter) {
      // Preview already showed the rearrangement - snap directly without replay animation
      const partToCenter = dragState.activePartNumber;
      const commit = buildDragMoveToCenterCommit(partToCenter);
      resetMoveToCenterPreviewState({ skipReverse: true });
      applyTransitionCommit(commit);
    } else if (!dragState.moved && !dragState.rotateOnly) {
      if (dragState.activePartNumber !== topPartNumber) {
        rotatePartToTop(dragState.activePartNumber);
      } else {
        const currentRotation = rotationDegreesRef.current;
        animateSnapRotation(currentRotation, snapRotation(currentRotation, segmentAngle));
      }
    } else {
      const currentRotation = rotationDegreesRef.current;
      const nextRotation = snapRotation(currentRotation, segmentAngle);
      animateSnapRotation(currentRotation, nextRotation);
    }

    if (svgRef.current?.hasPointerCapture(pointerId)) {
      svgRef.current.releasePointerCapture(pointerId);
    }

    // Always clean up morph state if we didn't commit to centre.
    const committedToCenter = dragState.readyForCenter && !dragState.rotateOnly;
    const shouldReverseMovePreview = morphTRef.current > 0 && morphPartNumber !== null && !committedToCenter;
    if (shouldReverseMovePreview && centerPreviewPartNumber === null) {
      startMorphReverseAnimation();
    }

    dragStateRef.current = null;
    if (centerPreviewPartNumber !== null) setCenterPreviewPartNumber(null);
    if (centerRemovePreview) setCenterRemovePreview(false);
  };

  const handleSegmentPointerDown = (partNumber: number) => (event: h.JSX.TargetedPointerEvent<SVGElement>) => {
    if (!svgRef.current) return;

    const point = svgPoint(svgRef.current, event.clientX, event.clientY);
    const radius = distanceFromCenter(point.x, point.y);
    // Ignore touches beyond the label radius (outside the circle's interactive zone)
    if (radius > INTERACTIVE_RADIUS) return;

    cancelSnapAnimation();
    event.stopPropagation();

    const startAngle = angleFromPoint(point.x, point.y);

    dragStateRef.current = {
      pointerId: event.pointerId,
      activePartNumber: partNumber,
      startAngle,
      startRotation: rotationDegreesRef.current,
      startTime: Date.now(),
      startX: point.x,
      startY: point.y,
      moved: false,
      readyForCenter: false,
      rotateOnly: false,
      draggingFromCenter: false,
    };

    svgRef.current.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handleInteractiveTouchStart = (event: h.JSX.TargetedTouchEvent<SVGElement>) => {
    if (event.cancelable) event.preventDefault();
  };

  const handleBackgroundPointerDown = (event: h.JSX.TargetedPointerEvent<SVGSVGElement>) => {
    if (dragStateRef.current || !svgRef.current) return;

    const point = svgPoint(svgRef.current, event.clientX, event.clientY);
    const radius = distanceFromCenter(point.x, point.y);

    // Ignore touches inside centre disc or outside the label radius
    if (radius <= CENTER_PREVIEW_THRESHOLD) return;
    if (radius > INTERACTIVE_RADIUS) return;

    cancelSnapAnimation();

    const startAngle = angleFromPoint(point.x, point.y);

    dragStateRef.current = {
      pointerId: event.pointerId,
      activePartNumber: topPartNumber,
      startAngle,
      startRotation: rotationDegreesRef.current,
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

    // Center disc drag: toggle remove preview based on distance
    if (dragState.draggingFromCenter) {
      if (nextRadius > CENTER_PREVIEW_THRESHOLD) {
        if (!centerRemovePreview) setCenterRemovePreview(true);
        dragState.moved = true;
      } else {
        if (centerRemovePreview) setCenterRemovePreview(false);
      }
      return; // Don't rotate when dragging center disc
    }

    if (!dragState.moved && (angularTravelled > 2 || (travelled > DRAG_DISTANCE_THRESHOLD && nextRadius <= CENTER_COMMIT_THRESHOLD))) {
      dragState.moved = true;
      dragState.startAngle = angleFromPoint(point.x, point.y);
      dragState.startRotation = rotationDegreesRef.current;
    }

    if (!dragState.moved) return;

    // Use hysteresis: entering the center zone requires crossing CENTER_COMMIT_THRESHOLD,
    // but exiting requires moving past CENTER_COMMIT_THRESHOLD + CENTER_EXIT_HYSTERESIS.
    // This prevents finger jitter on mobile from rapidly toggling the preview.
    const centerZoneThreshold = dragState.readyForCenter
      ? CENTER_COMMIT_THRESHOLD + CENTER_EXIT_HYSTERESIS
      : CENTER_COMMIT_THRESHOLD;

    if (!dragState.rotateOnly && (!hasCenter || dragState.activePartNumber !== centerPartNumber) && nextRadius <= centerZoneThreshold) {
      if (!dragState.readyForCenter) {
        // First entry into center zone - snap rotation and show preview
        const currentRotation = rotationDegreesRef.current;
        const snapped = snapRotation(currentRotation, segmentAngle);
        centerPreviewRotationRef.current = snapped;
        if (Math.abs(snapped - currentRotation) > 0.5) {
          animateSnapRotation(currentRotation, snapped);
        }
        dragState.startRotation = snapped;
        dragState.startAngle = angleFromPoint(point.x, point.y);
        setCenterPreviewPartNumber(dragState.activePartNumber);
        dragState.readyForCenter = true;
      }
      return;
    }

    // If we just exited the center zone, reset the drag reference
    // so rotation continues smoothly from the current position
    if (dragState.readyForCenter || centerPreviewPartNumber !== null) {
      dragState.startAngle = angleFromPoint(point.x, point.y);
      dragState.startRotation = rotationDegreesRef.current;
    }

    dragState.readyForCenter = false;
    setCenterPreviewPartNumber(null);

    const nextAngle = angleFromPoint(point.x, point.y);
    const delta = normalizeDegrees(nextAngle - dragState.startAngle);
    const currentRotation = dragState.startRotation + delta;
    setRotationDegreesState(currentRotation);

    // Update activePartNumber to whichever segment the pointer is nearest
    if (!dragState.rotateOnly && nextRadius <= LABEL_RADIUS) {
      const pointerAngle = nextAngle;
      let bestPart = dragState.activePartNumber;
      let bestDist = Infinity;
      for (let i = 0; i < outerParts.length; i++) {
        const segAngle = currentRotation + i * segmentAngle;
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

  const centerActionTitle = hasCenter ? 'Return to ring' : 'Move to centre';
  const centerActionAriaLabel = hasCenter
    ? 'Remove the current centre part and return to ring view'
    : `Move ${topPart.title} to the centre`;
  const handleCenterAction = hasCenter
    ? removeFromCenter
    : () => animateToCenter(topPart.partNumber);
  const readyStyle = hasLoadedState
    ? undefined
    : { opacity: 0, pointerEvents: 'none' as const };

  return (
    <div
      class="space-y-3 sm:space-y-4"
      style={readyStyle}
      aria-busy={hasLoadedState ? 'false' : 'true'}
    >
      <div class={`${CONTROL_SURFACE_CLASS} p-2.5 sm:rounded-2xl sm:p-3`}>
        <div class="grid gap-2 sm:gap-2.5">
          <a
            href={focusPart.href}
            class={`group flex h-14 max-w-full items-center gap-3 rounded-[1rem] px-3 text-left sm:h-16 sm:px-4 ${CONTROL_CARD_CLASS} ${CONTROL_CARD_INTERACTIVE_CLASS}`}
          >
            <span
              class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-sans text-sm font-bold leading-none text-white shadow-sm sm:h-10 sm:w-10"
              style={{ backgroundColor: focusPart.colorHex }}
            >
              {focusPart.partNumber}
            </span>
            <span class="min-w-0 flex-1">
              <span class={`block ${CONTROL_LABEL_CLASS}`}>
                Active field
              </span>
              <span class={`mt-0.5 block truncate font-serif text-sm font-bold sm:text-[15px] ${CONTROL_TITLE_CLASS}`}>
                {focusPart.title}
              </span>
            </span>
            <span class="hidden text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300 sm:block">
              Open
            </span>
          </a>
          <div class="grid h-14 grid-cols-[3rem_minmax(0,1fr)_3rem] gap-2 sm:h-16 sm:grid-cols-[3.25rem_minmax(0,1fr)_3.25rem] sm:gap-2.5">
            <button
              type="button"
              onClick={rotateLeft}
              class={`inline-flex h-full w-full items-center justify-center rounded-[1rem] text-slate-700 active:scale-[0.98] ${CONTROL_CARD_CLASS} ${CONTROL_CARD_INTERACTIVE_CLASS}`}
              aria-label="Rotate left"
            >
              <svg class="h-4 w-4 sm:h-4.5 sm:w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.75">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={handleCenterAction}
              aria-label={centerActionAriaLabel}
              class={`inline-flex h-full items-center gap-2 rounded-[1rem] px-2.5 text-left text-slate-700 active:scale-[0.99] sm:gap-3 sm:px-4 ${CONTROL_CARD_CLASS} ${CONTROL_CARD_INTERACTIVE_CLASS}`}
            >
              <span class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-slate-500 ring-1 ring-inset ring-slate-200/80 sm:h-10 sm:w-10">
                {hasCenter ? (
                  <svg class="h-4 w-4 sm:h-4.5 sm:w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.25">
                    <circle cx="12" cy="12" r="6.5" />
                    <path stroke-linecap="round" d="M9 12h6" />
                  </svg>
                ) : (
                  <svg class="h-4 w-4 sm:h-4.5 sm:w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.25">
                    <circle cx="12" cy="12" r="6.5" />
                    <path stroke-linecap="round" d="M12 9v6M9 12h6" />
                  </svg>
                )}
              </span>
              <span class="min-w-0 flex-1">
                <span class="block text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400 sm:text-[10px] sm:tracking-[0.16em]">
                  Centre mode
                </span>
                <span class="mt-0.5 block truncate text-[13px] font-medium text-slate-900 sm:text-[14px]">
                  {centerActionTitle}
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={rotateRight}
              class={`inline-flex h-full w-full items-center justify-center rounded-[1rem] text-slate-700 active:scale-[0.98] ${CONTROL_CARD_CLASS} ${CONTROL_CARD_INTERACTIVE_CLASS}`}
              aria-label="Rotate right"
            >
              <svg class="h-4 w-4 sm:h-4.5 sm:w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.75">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div class="sm:rounded-lg sm:border sm:border-slate-200 sm:bg-slate-50 sm:p-6">
        <svg
          ref={svgRef}
          viewBox={`${VIEWBOX_INSET} ${VIEWBOX_INSET} ${VIEWBOX_SIZE - VIEWBOX_INSET * 2} ${VIEWBOX_SIZE - VIEWBOX_INSET * 2}`}
          class="mx-auto aspect-square w-full max-w-[50rem] cursor-default select-none sm:max-w-[56rem] lg:max-w-[60rem]"
          style={{ overflow: 'visible', touchAction: 'auto' }}
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
          {/* Invisible interactive ring for grab cursor - only within drag zone */}
          <path
            d={donutSlicePath(CENTER, CENTER, hasCenter ? CENTER_DISC_RADIUS : effectiveInnerRadius, INTERACTIVE_RADIUS, 0, 359.9)}
            fill="transparent"
            class="cursor-grab active:cursor-grabbing"
            style={{ touchAction: 'none' }}
            onTouchStart={handleInteractiveTouchStart}
            onPointerDown={handleBackgroundPointerDown}
          />

          {/* Render non-top segments first, top segment last so it paints on top */}
          {[...outerParts].sort((a, b) => {
            if (a.partNumber === topPartNumber) return 1;
            if (b.partNumber === topPartNumber) return -1;
            return 0;
          }).map((part) => {
            const index = outerParts.findIndex((p) => p.partNumber === part.partNumber);
            const swapOffset = postSwapState && postSwapT > 0
              ? (postSwapState.angularOffsets.get(part.partNumber) ?? 0) * postSwapT
              : 0;
            const removeOffset = removeMorphT > 0 && removePreviewOffsets
              ? (removePreviewOffsets.offsets.get(part.partNumber) ?? 0) * removeMorphT
              : 0;
            const isMorphingToCenter = part.partNumber === morphPartNumber && morphT > 0;
            const centerMoveOffset = morphT > 0 && centerPreviewOffsets && part.partNumber !== morphPartNumber
              ? (centerPreviewOffsets.offsets.get(part.partNumber) ?? 0) * morphT
              : 0;
            const isPostSwapMorphing = postSwapState?.oldCenterPartNumber === part.partNumber && postSwapT > 0;
            const postSwapRevealProgress = isPostSwapMorphing
              ? Math.max(0, Math.min(1, (POST_SWAP_SETTLE_T - postSwapT) / POST_SWAP_SETTLE_T))
              : 0;
            const postSwapContentOpacity = isPostSwapMorphing ? Math.max(0, 1 - postSwapT) : 1;
            const centerAngle = rotationDegrees + index * segmentAngle + swapOffset + removeOffset + centerMoveOffset;
            const effectiveSpan = postSwapState && postSwapT > 0
              ? lerp(segmentAngle, postSwapState.oldSegAngle, postSwapT)
              : removeMorphT > 0 && removePreviewOffsets
                ? lerp(segmentAngle, removePreviewOffsets.fullSegAngle, removeMorphT)
                : morphT > 0 && centerPreviewOffsets && part.partNumber !== morphPartNumber
                  ? lerp(segmentAngle, centerPreviewOffsets.newSegAngle, morphT)
                  : segmentAngle;
            const startAngle = centerAngle - effectiveSpan / 2;
            const endAngle = centerAngle + effectiveSpan / 2;
            const isTop = topPart.partNumber === part.partNumber;
            const distFromTop = angularDistance(centerAngle, 0);
            const topWeight = Math.max(0, 1 - distFromTop / effectiveSpan);
            const segmentInnerRadius = lerp(effectiveInnerRadius, effectiveInnerRadius - 10, topWeight);
            const segmentOuterRadius = lerp(OUTER_RADIUS, OUTER_RADIUS + 12, topWeight);
            const numberPosition = polar(
              CENTER,
              CENTER,
              getSegmentNumberRadius(segmentInnerRadius, segmentOuterRadius, topWeight),
              centerAngle,
            );
            const { labelY, labelLines, textAnchor, labelX } = getPartLabelLayout(centerAngle, part.title);
            const baseSegmentOpacity = lerp(0.94, 1, topWeight);

            return (
              <g key={part.partNumber}>
                <path
                  d={donutSlicePath(CENTER, CENTER, segmentInnerRadius, segmentOuterRadius + 10, startAngle, endAngle)}
                  fill="transparent"
                  class="cursor-grab active:cursor-grabbing"
                  style={{ touchAction: 'none' }}
                  onTouchStart={handleInteractiveTouchStart}
                  onPointerDown={handleSegmentPointerDown(part.partNumber)}
                />
                <path
                  d={donutSlicePath(CENTER, CENTER, segmentOuterRadius + 6, INTERACTIVE_RADIUS, startAngle, endAngle)}
                  fill="transparent"
                  class="cursor-grab active:cursor-grabbing"
                  style={{ touchAction: 'none' }}
                  onTouchStart={handleInteractiveTouchStart}
                  onPointerDown={handleSegmentPointerDown(part.partNumber)}
                />
                <path
                  d={roundedDonutSlicePath(
                    CENTER,
                    CENTER,
                    segmentInnerRadius,
                    segmentOuterRadius,
                    startAngle,
                    endAngle,
                    {
                      gapPx: SEGMENT_GAP_PX,
                      cornerRadiusPx: SEGMENT_CORNER_RADIUS,
                    }
                  )}
                  fill={part.colorHex}
                  stroke="none"
                  stroke-width={0}
                  stroke-linejoin="round"
                  paint-order="stroke fill"
                  opacity={
                    part.partNumber === morphPartNumber && morphT > 0
                      ? Math.max(0, 1 - morphT * 1.5)
                      : isPostSwapMorphing
                        ? baseSegmentOpacity * postSwapRevealProgress
                        : baseSegmentOpacity
                  }
                  class="cursor-grab active:cursor-grabbing"
                  style={{ touchAction: 'none' }}
                  onTouchStart={handleInteractiveTouchStart}
                  onPointerDown={handleSegmentPointerDown(part.partNumber)}
                />

                {/* Focus outline on the top part when no centre */}
                {isTop && !hasCenter && !isMorphingToCenter && !(morphT > 0 && morphPartNumber !== null) && (
                  <path
                    d={roundedDonutSlicePath(
                      CENTER,
                      CENTER,
                      segmentInnerRadius,
                      segmentOuterRadius,
                      startAngle,
                      endAngle,
                      {
                        gapPx: SEGMENT_GAP_PX,
                        cornerRadiusPx: SEGMENT_CORNER_RADIUS,
                      }
                    )}
                    fill="none"
                    stroke="#0f172a"
                    stroke-width={SELECTION_OUTLINE_WIDTH}
                    stroke-linejoin="round"
                    opacity={isPostSwapMorphing ? postSwapRevealProgress : 1}
                    pointer-events="none"
                  />
                )}

                <text
                  x={numberPosition.x}
                  y={numberPosition.y}
                  fill="white"
                  font-size={getSegmentNumberFontSize(topWeight)}
                  font-family="Inter, sans-serif"
                  font-weight="700"
                  text-anchor="middle"
                  dominant-baseline="middle"
                  pointer-events="none"
                  opacity={isMorphingToCenter ? Math.max(0, 1 - morphT * 1.5) : postSwapContentOpacity}
                >
                  {part.partNumber}
                </text>

                <g
                  pointer-events="none"
                  opacity={isMorphingToCenter ? Math.max(0, 1 - morphT * 1.5) : postSwapContentOpacity}
                >
                  <text
                    x={labelX}
                    fill={topWeight > 0.5 ? '#0f172a' : '#334155'}
                    font-size={`${getPartLabelFontSize(topWeight)}`}
                    font-family="Inter, sans-serif"
                    font-weight={getPartLabelFontWeight(topWeight)}
                    letter-spacing="0"
                    text-anchor={textAnchor}
                    dominant-baseline="middle"
                  >
                    {labelLines.map((line, lineIndex) => (
                      <tspan
                        x={labelX}
                        y={partLabelLineY(labelY, lineIndex, labelLines.length)}
                        font-size={`${getPartLabelFontSize(topWeight)}`}
                        font-weight={getPartLabelFontWeight(topWeight)}
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

          {postSwapState && postSwapT > 0 && (() => {
            const oldCP = parts.find((p) => p.partNumber === postSwapState.oldCenterPartNumber);
            if (!oldCP) return null;
            const pIndex = outerParts.findIndex((p) => p.partNumber === oldCP.partNumber);
            if (pIndex === -1) return null;

            const pOffset = (postSwapState.angularOffsets.get(oldCP.partNumber) ?? 0) * postSwapT;
            const pCenterAngle = rotationDegrees + pIndex * segmentAngle + pOffset;
            const pStartAngle = pCenterAngle - segmentAngle / 2;
            const pEndAngle = pCenterAngle + segmentAngle / 2;
            const pDistFromTop = angularDistance(pCenterAngle, 0);
            const pTopWeight = Math.max(0, 1 - pDistFromTop / segmentAngle);
            const pInner = lerp(effectiveInnerRadius, effectiveInnerRadius - 10, pTopWeight);
            const pOuter = lerp(OUTER_RADIUS, OUTER_RADIUS + 12, pTopWeight);
            const postSwapPath = morphedDonutPath(
              CENTER,
              CENTER,
              pInner,
              pOuter,
              pStartAngle,
              pEndAngle,
              CENTER_DISC_RADIUS,
              postSwapT,
              { gapPx: SEGMENT_GAP_PX, cornerRadiusPx: SEGMENT_CORNER_RADIUS }
            );
            const postSwapGhostOpacity = postSwapT > POST_SWAP_SETTLE_T ? 1 : postSwapT / POST_SWAP_SETTLE_T;

            return (
              <path
                d={postSwapPath}
                fill={oldCP.colorHex}
                stroke="#0f172a"
                stroke-width={SELECTION_OUTLINE_WIDTH}
                stroke-linejoin="round"
                opacity={postSwapGhostOpacity}
                pointer-events="none"
              />
            );
          })()}

          {morphT > 0 && morphPartNumber !== null && (() => {
            const mPart = outerParts.find((p) => p.partNumber === morphPartNumber);
            if (!mPart) return null;
            const mIndex = outerParts.findIndex((p) => p.partNumber === morphPartNumber);
            const mCenterAngle = rotationDegrees + mIndex * segmentAngle;
            const mStartAngle = mCenterAngle - segmentAngle / 2;
            const mEndAngle = mCenterAngle + segmentAngle / 2;
            const mDistFromTop = angularDistance(mCenterAngle, 0);
            const mTopWeight = Math.max(0, 1 - mDistFromTop / segmentAngle);
            const mInner = lerp(effectiveInnerRadius, effectiveInnerRadius - 10, mTopWeight);
            const mOuter = lerp(OUTER_RADIUS, OUTER_RADIUS + 12, mTopWeight);
            const morphPath = morphedDonutPath(
              CENTER,
              CENTER,
              mInner,
              mOuter,
              mStartAngle,
              mEndAngle,
              CENTER_DISC_RADIUS,
              morphT,
              { gapPx: SEGMENT_GAP_PX, cornerRadiusPx: SEGMENT_CORNER_RADIUS }
            );
            return (
              <path
                d={morphPath}
                fill={mPart.colorHex}
                stroke="#0f172a"
                stroke-width={SELECTION_OUTLINE_WIDTH}
                stroke-linejoin="round"
                stroke-opacity={dragMorphOutlineOpacity}
                pointer-events="none"
              />
            );
          })()}

          {/* Old center morphing out to ring during swap preview */}
          {morphT > 0 && hasCenter && centerPart && centerPreviewOffsets?.oldCenterTarget && (() => {
            const target = centerPreviewOffsets.oldCenterTarget;
            const oldCenterGhostOpacity = isCenterSwapPreviewActive
              ? morphT
              : isCenterSwapPreviewReversing
                ? 1 - centerSwapReturnOpacity
                : morphT;
            const tDistFromTop = angularDistance(target.centerAngle, 0);
            const tSegAngle = centerPreviewOffsets.newSegAngle;
            const tTopWeight = Math.max(0, 1 - tDistFromTop / tSegAngle);
            const tInner = lerp(INNER_RADIUS, INNER_RADIUS - 10, tTopWeight);
            const tOuter = lerp(OUTER_RADIUS, OUTER_RADIUS + 12, tTopWeight);
            const tNumberPos = polar(
              CENTER,
              CENTER,
              getSegmentNumberRadius(tInner, tOuter, tTopWeight),
              target.centerAngle,
            );
            const {
              labelY: tLabelY,
              textAnchor: tTextAnchor,
              labelX: tLabelX,
              labelLines: tLabelLines,
            } = getPartLabelLayout(target.centerAngle, centerPart.title);
            return (
              <g opacity={oldCenterGhostOpacity} pointer-events="none">
                <path
                  d={morphedDonutPath(
                    CENTER, CENTER,
                    tInner, tOuter,
                    target.startAngle, target.endAngle,
                    CENTER_DISC_RADIUS,
                    1 - morphT,
                    { gapPx: SEGMENT_GAP_PX, cornerRadiusPx: SEGMENT_CORNER_RADIUS }
                  )}
                  fill={centerPart.colorHex}
                  opacity={1 / Math.max(oldCenterGhostOpacity, 0.01)}
                />
                <text
                  x={tNumberPos.x}
                  y={tNumberPos.y}
                  fill="white"
                  font-size={getSegmentNumberFontSize(tTopWeight)}
                  font-family="Inter, sans-serif"
                  font-weight="700"
                  text-anchor="middle"
                  dominant-baseline="middle"
                >
                  {centerPart.partNumber}
                </text>
                <text
                  x={tLabelX}
                  fill={tTopWeight > 0.5 ? '#0f172a' : '#334155'}
                  font-size={`${getPartLabelFontSize(tTopWeight)}`}
                  font-family="Inter, sans-serif"
                  font-weight={getPartLabelFontWeight(tTopWeight)}
                  letter-spacing="0"
                  text-anchor={tTextAnchor}
                  dominant-baseline="middle"
                >
                  {tLabelLines.map((line, lineIndex) => (
                    <tspan
                      x={tLabelX}
                      y={partLabelLineY(tLabelY, lineIndex, tLabelLines.length)}
                      font-size={`${getPartLabelFontSize(tTopWeight)}`}
                      font-weight={getPartLabelFontWeight(tTopWeight)}
                      letter-spacing="0"
                    >
                      {line}
                    </tspan>
                  ))}
                </text>
              </g>
            );
          })()}

          {removeMorphT > 0 && hasCenter && centerPart && (() => {
            // Compute where the center part would go in the full 10-part ring
            const fullOuter = parts;
            const fullSegAngle = 360 / fullOuter.length;
            const fullTopIdx = fullOuter.findIndex((p) => p.partNumber === topPartNumber);
            const fullRotation = fullTopIdx >= 0 ? -fullTopIdx * fullSegAngle : 0;
            const rmIndex = fullOuter.findIndex((p) => p.partNumber === centerPart.partNumber);
            if (rmIndex === -1) return null;
            const rmCenterAngle = fullRotation + rmIndex * fullSegAngle;
            const rmStartAngle = rmCenterAngle - fullSegAngle / 2;
            const rmEndAngle = rmCenterAngle + fullSegAngle / 2;
            const rmDistFromTop = angularDistance(rmCenterAngle, 0);
            const rmTopWeight = Math.max(0, 1 - rmDistFromTop / fullSegAngle);
            const rmInner = lerp(INNER_RADIUS, INNER_RADIUS - 10, rmTopWeight);
            const rmOuter = lerp(OUTER_RADIUS, OUTER_RADIUS + 12, rmTopWeight);
            const removeMorphPath = morphedDonutPath(
              CENTER,
              CENTER,
              rmInner,
              rmOuter,
              rmStartAngle,
              rmEndAngle,
              CENTER_DISC_RADIUS,
              1 - removeMorphT,
              { gapPx: SEGMENT_GAP_PX, cornerRadiusPx: SEGMENT_CORNER_RADIUS }
            );
            const numberPos = polar(
              CENTER,
              CENTER,
              getSegmentNumberRadius(rmInner, rmOuter, rmTopWeight),
              rmCenterAngle,
            );
            const {
              labelY: rmLabelY,
              textAnchor: rmTextAnchor,
              labelX: rmLabelX,
              labelLines: rmLabelLines,
            } = getPartLabelLayout(rmCenterAngle, centerPart.title);
            return (
              <g opacity={removeMorphT} pointer-events="none">
                <path
                  d={removeMorphPath}
                  fill={centerPart.colorHex}
                  opacity={1 / removeMorphT}
                  stroke="#0f172a"
                  stroke-width={SELECTION_OUTLINE_WIDTH}
                  stroke-linejoin="round"
                />
                <text
                  x={numberPos.x}
                  y={numberPos.y}
                  fill="white"
                  font-size={getSegmentNumberFontSize(rmTopWeight)}
                  font-family="Inter, sans-serif"
                  font-weight="700"
                  text-anchor="middle"
                  dominant-baseline="middle"
                >
                  {centerPart.partNumber}
                </text>
                <text
                  x={rmLabelX}
                  fill={rmTopWeight > 0.5 ? '#0f172a' : '#334155'}
                  font-size={`${getPartLabelFontSize(rmTopWeight)}`}
                  font-family="Inter, sans-serif"
                  font-weight={getPartLabelFontWeight(rmTopWeight)}
                  letter-spacing="0"
                  text-anchor={rmTextAnchor}
                  dominant-baseline="middle"
                >
                  {rmLabelLines.map((line, lineIndex) => (
                    <tspan
                      x={rmLabelX}
                      y={partLabelLineY(rmLabelY, lineIndex, rmLabelLines.length)}
                      font-size={`${getPartLabelFontSize(rmTopWeight)}`}
                      font-weight={getPartLabelFontWeight(rmTopWeight)}
                      letter-spacing="0"
                    >
                      {line}
                    </tspan>
                  ))}
                </text>
              </g>
            );
          })()}

          {!centerDisplayPart && morphT === 0 && removeMorphT === 0 && (
            <g pointer-events="none" aria-hidden="true">
              <text
                x={CENTER}
                y={CENTER - 8}
                fill="#64748b"
                font-size="13"
                font-family="Inter, sans-serif"
                font-weight="600"
                text-anchor="middle"
                letter-spacing="0.08em"
              >
                DRAG A PART HERE
              </text>
              <text
                x={CENTER}
                y={CENTER + 12}
                fill="#94a3b8"
                font-size="12"
                font-family="Inter, sans-serif"
                font-weight="500"
                text-anchor="middle"
              >
                to bridge fields
              </text>
            </g>
          )}

          {centerDisplayPart && (
            <g
              role="button"
              tabIndex={0}
              class="cursor-grab active:cursor-grabbing"
              style={{ outline: 'none', touchAction: 'none' }}
              onTouchStart={handleInteractiveTouchStart}
              onPointerDown={(event) => {
                event.preventDefault();
                setCenterHasFocus(false);
                if (hasCenter && centerPart && svgRef.current) {
                  event.stopPropagation();
                  const point = svgPoint(svgRef.current, event.clientX, event.clientY);
                  dragStateRef.current = {
                    pointerId: event.pointerId,
                    activePartNumber: centerPart.partNumber,
                    startAngle: angleFromPoint(point.x, point.y),
                    startRotation: rotationDegreesRef.current,
                    startTime: Date.now(),
                    startX: point.x,
                    startY: point.y,
                    moved: false,
                    readyForCenter: false,
                    rotateOnly: false,
                    draggingFromCenter: true,
                  };
                  svgRef.current.setPointerCapture(event.pointerId);
                }
              }}
              onFocus={() => {
                setCenterHasFocus(true);
              }}
              onBlur={() => setCenterHasFocus(false)}
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
                opacity={
                  removeMorphT > 0
                    ? Math.max(0, 1 - removeMorphT * 1.5)
                    : isCenterPreviewActive
                      ? 0
                      : isCenterSwapPreviewReversing
                        ? Math.max(0, Math.min(1, 1 - morphT))
                        : 1
                }
              />
              {/* Focus outline on centre disc - show when centre exists, or when morph preview is nearly complete */}
              {showCenterDiscOutline && (
                <circle
                  cx={CENTER}
                  cy={CENTER}
                  r={CENTER_DISC_RADIUS - SELECTION_OUTLINE_WIDTH / 2}
                  fill="none"
                  stroke="#0f172a"
                  stroke-width={SELECTION_OUTLINE_WIDTH}
                  opacity={centerDiscOutlineOpacity}
                  pointer-events="none"
                />
              )}
              <g
                opacity={
                  removeMorphT > 0
                    ? Math.max(0, 1 - removeMorphT * 1.5)
                    : centerDiscContentOpacity
                }
              >
                <text
                  x={CENTER}
                  y={CENTER - 30}
                  fill="white"
                  font-size="46"
                  font-family="Inter, sans-serif"
                  font-weight="700"
                  text-anchor="middle"
                  dominant-baseline="middle"
                >
                  {centerDisplayPart.partNumber}
                </text>
                <text
                  x={CENTER}
                  y={CENTER + 8}
                  fill="white"
                  font-size="14"
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
                    y={CENTER + 34 + index * 15}
                    fill="white"
                    font-size="13"
                    font-family="Inter, sans-serif"
                    font-weight="600"
                    text-anchor="middle"
                  >
                    {line}
                  </text>
                ))}
              </g>
            </g>
          )}
        </svg>

        {hasCenter && centerPart ? (
          <CenteredCircleNavigatorPanel
            parts={parts}
            centerPart={centerPart}
            centerPartNumber={centerPartNumber}
            topPart={topPart}
            connectionSummary={connectionSummary}
            suggestedSections={suggestedSections}
            readingPref={readingPref}
            activeLayer={selectedCoverageLayer}
            checklistState={checklistState}
            baseUrl={baseUrl}
            coverageSources={coverageSourceCache}
          />
        ) : (
          <TopPartCircleNavigatorPanel
            topPart={topPart}
            topPartNumber={topPartNumber}
            readingPref={readingPref}
            activeLayer={selectedCoverageLayer}
            checklistState={checklistState}
            baseUrl={baseUrl}
            coverageSources={coverageSourceCache}
          />
        )}
      </div>

    </div>
  );
}
