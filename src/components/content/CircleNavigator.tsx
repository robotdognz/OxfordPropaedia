import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  readChecklistState,
  subscribeChecklistState,
  writeChecklistState,
  vsiChecklistKey,
  wikipediaChecklistKey,
  macropaediaChecklistKey,
} from '../../utils/readingChecklist';
import Accordion from '../ui/Accordion';
import TopReadings from './TopReadings';
import {
  getReadingPreference,
  subscribeReadingPreference,
  type ReadingType,
} from '../../utils/readingPreference';

export interface CircleNavigatorDivision {
  divisionId: string;
  romanNumeral: string;
  title: string;
}

export interface CircleNavigatorPart {
  partNumber: number;
  partName: string;
  title: string;
  href: string;
  colorHex: string;
  divisions: CircleNavigatorDivision[];
}

export interface SectionConnection {
  sourceSection: string;
  targetSection: string;
  sourcePath: string;
  targetPath: string;
  via?: string;
  sharedArticle?: string;
}

export interface SectionMeta {
  title: string;
  partNumber: number;
  sectionCode: string;
}

export interface BridgeItem {
  t: string;   // title
  a?: string;  // author (VSI only)
  ca: number;  // section count in lower-numbered part
  cb: number;  // section count in higher-numbered part
  r?: number;  // precomputed relevance percentage (0-100)
}

export interface BridgePair {
  totalVsi: number;
  totalWiki: number;
  totalMacro: number;
  vsi?: BridgeItem[];
  wiki?: BridgeItem[];
  macro?: BridgeItem[];
}

export interface PartReadingItem {
  title: string;
  author?: string;
  count: number;
}

export interface PartReadings {
  vsi?: PartReadingItem[];
  wiki?: PartReadingItem[];
  macro?: PartReadingItem[];
}

export interface CircleNavigatorProps {
  parts: CircleNavigatorPart[];
  connections: Record<string, SectionConnection[]>;
  sectionMeta: Record<string, SectionMeta>;
  bridgeRecommendations: Record<string, BridgePair>;
  partReadings: Record<string, PartReadings>;
  baseUrl: string;
}

const VIEWBOX_SIZE = 680;
const VIEWBOX_INSET = 30;
const CENTER = VIEWBOX_SIZE / 2;
const OUTER_RADIUS = 168;
const INNER_RADIUS = 96;
const LABEL_RADIUS = 250;
const CONNECTOR_RADIUS = 192;
const INTERACTIVE_RADIUS = 320; // Touch/click boundary — covers labels and surrounding area
const FULL_SEGMENT_COUNT = 10;
const FULL_SEGMENT_ANGLE = 360 / FULL_SEGMENT_COUNT;
const RING_SEGMENT_COUNT = 9;
const RING_SEGMENT_ANGLE = 360 / RING_SEGMENT_COUNT;
const NO_CENTER_INNER_RADIUS = INNER_RADIUS;
const CENTER_DISC_RADIUS = INNER_RADIUS - 8;
const DRAG_DISTANCE_THRESHOLD = 6;
const CLICK_DURATION_THRESHOLD_MS = 250;
const CENTER_PREVIEW_THRESHOLD = CENTER_DISC_RADIUS + 2;
const CENTER_COMMIT_THRESHOLD = CENTER_DISC_RADIUS - 16;
const CENTER_EXIT_HYSTERESIS = 20;
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

function snapRotation(value: number, segAngle: number = RING_SEGMENT_ANGLE): number {
  return Math.round(value / segAngle) * segAngle;
}

function angularDistance(a: number, b: number): number {
  return Math.abs(normalizeDegrees(a - b));
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
  draggingFromCenter: boolean;
};

function getConnectionKey(a: number, b: number): string {
  return Math.min(a, b) + '-' + Math.max(a, b);
}

interface ConnectionSummary {
  sections: { section: SectionMeta; refCount: number }[];
  isDirect: boolean;
  hasKeyword: boolean;
  hasConnectionData: boolean;
}

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

export default function CircleNavigator({ parts, connections, sectionMeta, bridgeRecommendations, partReadings, baseUrl }: CircleNavigatorProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const [centerHasFocus, setCenterHasFocus] = useState(false);
  const [checklistState, setChecklistState] = useState<Record<string, boolean>>({});
  const [readingPref, setReadingPref] = useState<ReadingType>('vsi');

  useEffect(() => {
    setChecklistState(readChecklistState());
    setReadingPref(getReadingPreference());
    const unsubChecklist = subscribeChecklistState(() => setChecklistState(readChecklistState()));
    const unsubPref = subscribeReadingPreference((type) => setReadingPref(type));
    return () => { unsubChecklist(); unsubPref(); };
  }, []);
  const [hasLoadedState, setHasLoadedState] = useState(false);
  const [centerPartNumber, setCenterPartNumber] = useState<number | null>(null);
  const [rotationDegrees, setRotationDegrees] = useState(0);
  // selectedPartNumber removed — focus is always topPart (no centre) or centerPart (with centre)
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

  const centerPreviewRotationRef = useRef<number>(0);

  const [centerRemovePreview, setCenterRemovePreview] = useState(false);
  const [removeMorphT, setRemoveMorphT] = useState(0);
  const removeMorphAnimRef = useRef<number | null>(null);
  const removeMorphFromTRef = useRef(0);
  const removeMorphStartTimeRef = useRef(0);

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
        } else {
          // Ensure clean state after reverse completes
          setMorphT(0);
          setMorphPartNumber(null);
        }
      };
      morphAnimRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (morphAnimRef.current) cancelAnimationFrame(morphAnimRef.current);
    };
  }, [centerPreviewPartNumber]);

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
        setRemoveMorphT(nextT);
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
        setRemoveMorphT(nextT);
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
        setRotationDegrees(snapRotation(nextRotationDegrees, loadedSegAngle));
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

  const animateToCenter = (partNumber: number) => {
    if (partNumber === centerPartNumber) return;
    const snapped = snapRotation(rotationDegrees, segmentAngle);
    if (Math.abs(snapped - rotationDegrees) > 0.5) {
      animateSnapRotation(rotationDegrees, snapped);
    }
    centerPreviewRotationRef.current = snapped;
    setCenterPreviewPartNumber(partNumber);
    // After morph preview completes, commit silently — the preview already
    // showed the rearrangement, so no post-swap animation needed
    setTimeout(() => {
      if (morphAnimRef.current) cancelAnimationFrame(morphAnimRef.current);
      setMorphT(0);
      setMorphPartNumber(null);
      skipMorphReverseRef.current = true;
      setCenterPreviewPartNumber(null);

      // Compute the final rotation for the new layout
      const oldOuter = hasCenter ? parts.filter((p) => p.partNumber !== centerPartNumber) : parts;
      const newOuter = parts.filter((p) => p.partNumber !== partNumber);
      const newSegAngle = 360 / newOuter.length;
      const oldSegAngle = 360 / oldOuter.length;
      let currentTopPN = topPartNumberForRotation(oldOuter, snapped, oldSegAngle);
      // If the top part is the one being moved to center, pick the next part in the ring
      if (currentTopPN === partNumber) {
        const topIdx = oldOuter.findIndex((p) => p.partNumber === currentTopPN);
        const nextIdx = (topIdx + 1) % oldOuter.length;
        currentTopPN = oldOuter[nextIdx].partNumber;
      }
      const newIndexMap = new Map(newOuter.map((p, i) => [p.partNumber, i]));
      const newTopIdx = newIndexMap.get(currentTopPN);
      const newRotation = newTopIdx !== undefined ? -newTopIdx * newSegAngle : snapRotation(snapped, newSegAngle);

      if (postSwapAnimRef.current) cancelAnimationFrame(postSwapAnimRef.current);
      cancelSnapAnimation();
      setRotationDegrees(newRotation);
      setCenterPartNumber(partNumber);
    }, MORPH_DURATION_MS);
  };

  const rotateLeft = () => {
    const target = snapRotation(rotationDegrees + segmentAngle, segmentAngle);
    animateSnapRotation(rotationDegrees, target);
  };

  const rotateRight = () => {
    const target = snapRotation(rotationDegrees - segmentAngle, segmentAngle);
    animateSnapRotation(rotationDegrees, target);
  };

  const movePartToCenter = (partNumber: number) => {
    if (partNumber === centerPartNumber) return;

    // Compute old and new outer parts to find angular shifts
    const oldOuter = hasCenter ? parts.filter((p) => p.partNumber !== centerPartNumber) : parts;
    const newOuter = parts.filter((p) => p.partNumber !== partNumber);
    const oldSegAngle = 360 / oldOuter.length;
    const newSegAngle = 360 / newOuter.length;
    const oldIndexMap = new Map(oldOuter.map((p, i) => [p.partNumber, i]));
    const newIndexMap = new Map(newOuter.map((p, i) => [p.partNumber, i]));

    // Keep the current top part at the top after the swap
    let currentTopPN = topPartNumberForRotation(oldOuter, rotationDegrees, oldSegAngle);
    // If the top part is the one being moved to center, pick the next part in the ring
    if (currentTopPN === partNumber) {
      const topIdx = oldOuter.findIndex((p) => p.partNumber === currentTopPN);
      const nextIdx = (topIdx + 1) % oldOuter.length;
      currentTopPN = oldOuter[nextIdx].partNumber;
    }
    const newTopIdx = newIndexMap.get(currentTopPN);
    const newRotation = newTopIdx !== undefined ? -newTopIdx * newSegAngle : snapRotation(rotationDegrees, newSegAngle);

    // Use actual current rotation (not snapped) so the visual transition is continuous
    const currentRotation = rotationDegrees;
    const offsets = new Map<number, number>();
    for (const p of newOuter) {
      const oldIdx = oldIndexMap.get(p.partNumber);
      const newIdx = newIndexMap.get(p.partNumber)!;
      if (oldIdx !== undefined) {
        const oldAngle = currentRotation + oldIdx * oldSegAngle;
        const newAngle = newRotation + newIdx * newSegAngle;
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

    // Start post-swap animation (only if there was a previous center to animate out)
    if (oldCenter !== null) {
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
    } else {
      // Animate rearrangement when going from no-center to center
      setPostSwapState({ oldCenterPartNumber: -1, angularOffsets: offsets });
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
    }
  };

  const removeFromCenter = () => {
    if (!hasCenter || centerPartNumber === null) return;

    const removedPartNumber = centerPartNumber;
    const oldOuter = parts.filter((p) => p.partNumber !== centerPartNumber);
    const newOuter = parts;
    const oldSegAngle = 360 / oldOuter.length;
    const newSegAngle = 360 / newOuter.length;
    const oldIndexMap = new Map(oldOuter.map((p, i) => [p.partNumber, i]));
    const newIndexMap = new Map(newOuter.map((p, i) => [p.partNumber, i]));

    // After removing from centre, the removed part should become the top part
    const removedTopIdx = newIndexMap.get(removedPartNumber);
    const newRotation = removedTopIdx !== undefined ? -removedTopIdx * newSegAngle : snapRotation(rotationDegrees, newSegAngle);

    const currentRotation = rotationDegrees;
    const offsets = new Map<number, number>();
    for (const p of newOuter) {
      const oldIdx = oldIndexMap.get(p.partNumber);
      const newIdx = newIndexMap.get(p.partNumber)!;
      if (oldIdx !== undefined) {
        const oldAngle = currentRotation + oldIdx * oldSegAngle;
        const newAngle = newRotation + newIdx * newSegAngle;
        const shift = normalizeDegrees(oldAngle - newAngle);
        if (Math.abs(shift) > 0.01) offsets.set(p.partNumber, shift);
      }
    }

    if (postSwapAnimRef.current) cancelAnimationFrame(postSwapAnimRef.current);
    if (morphAnimRef.current) cancelAnimationFrame(morphAnimRef.current);
    cancelSnapAnimation();
    setMorphT(0);
    setMorphPartNumber(null);
    skipMorphReverseRef.current = true;

    setRotationDegrees(newRotation);
    setCenterPartNumber(null);
    setCenterPreviewPartNumber(null);

    setPostSwapState({ oldCenterPartNumber: removedPartNumber, angularOffsets: offsets });
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

    if (dragState.draggingFromCenter && centerRemovePreview) {
      // Dragged center disc outward past threshold — commit removal without replay animation
      setCenterRemovePreview(false);
      if (removeMorphAnimRef.current) cancelAnimationFrame(removeMorphAnimRef.current);
      setRemoveMorphT(0);

      // Snap directly to the 10-part layout (preview already showed the transition)
      if (hasCenter && removePreviewOffsets) {
        const newRotation = removePreviewOffsets.fullRotation;
        setCenterPartNumber(null);
        setCenterPreviewPartNumber(null);
        setRotationDegrees(newRotation);
      }
    } else if (dragState.draggingFromCenter) {
      // Dragged center disc but returned — cancel
      setCenterRemovePreview(false);
    } else if (!dragState.rotateOnly && dragState.readyForCenter) {
      // Preview already showed the rearrangement — snap directly without replay animation
      const partToCenter = dragState.activePartNumber;
      if (morphAnimRef.current) cancelAnimationFrame(morphAnimRef.current);
      setMorphT(0);
      setMorphPartNumber(null);
      skipMorphReverseRef.current = true;
      setCenterPreviewPartNumber(null);

      // Compute the final rotation for the new layout
      // When swapping, new outer includes old center; when no center, just remove dragged part
      const newOuter = hasCenter
        ? parts.filter((p) => p.partNumber !== partToCenter)
        : outerParts.filter((p) => p.partNumber !== partToCenter);
      const newSegAngle = 360 / newOuter.length;
      let curTopPN = topPartNumberForRotation(outerParts, rotationDegrees, segmentAngle);
      // If the top part is the one being moved to center, pick the next part in the ring
      if (curTopPN === partToCenter) {
        const topIdx = outerParts.findIndex((p) => p.partNumber === curTopPN);
        const nextIdx = (topIdx + 1) % outerParts.length;
        curTopPN = outerParts[nextIdx].partNumber;
      }
      const newTopIdx = newOuter.findIndex((p) => p.partNumber === curTopPN);
      const newRotation = newTopIdx >= 0 ? -newTopIdx * newSegAngle : snapRotation(rotationDegrees, newSegAngle);

      setCenterPartNumber(partToCenter);
      setRotationDegrees(newRotation);
    } else {
      const nextRotation = snapRotation(rotationDegrees, segmentAngle);
      animateSnapRotation(rotationDegrees, nextRotation);
    }

    if (svgRef.current?.hasPointerCapture(pointerId)) {
      svgRef.current.releasePointerCapture(pointerId);
    }

    // Always clean up morph state if we didn't commit to centre
    // (the commit branch handles its own cleanup at lines 845-848)
    if (morphT > 0 && morphPartNumber !== null && !(dragState.readyForCenter && !dragState.rotateOnly)) {
      if (morphAnimRef.current) {
        cancelAnimationFrame(morphAnimRef.current);
        morphAnimRef.current = null;
      }
      morphFromTRef.current = morphT;
      morphStartTimeRef.current = performance.now();
      const reverseAnimate = (now: number) => {
        const elapsed = now - morphStartTimeRef.current;
        const rawT = Math.min(elapsed / (MORPH_DURATION_MS * 0.5), 1);
        const nextT = lerp(morphFromTRef.current, 0, easeOutCubic(rawT));
        setMorphT(nextT);
        if (rawT < 1) {
          morphAnimRef.current = requestAnimationFrame(reverseAnimate);
        } else {
          setMorphT(0);
          setMorphPartNumber(null);
        }
      };
      morphAnimRef.current = requestAnimationFrame(reverseAnimate);
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
      startRotation: rotationDegrees,
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
      dragState.startRotation = rotationDegrees;
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
        // First entry into center zone — snap rotation and show preview
        const snapped = snapRotation(rotationDegrees, segmentAngle);
        centerPreviewRotationRef.current = snapped;
        if (Math.abs(snapped - rotationDegrees) > 0.5) {
          animateSnapRotation(rotationDegrees, snapped);
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

  return (
    <div class="space-y-3 sm:space-y-4">
      <div class="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm sm:rounded-2xl sm:px-4 sm:py-2.5">
        <div class="flex items-center gap-3">
          <span
            class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-sans text-xs font-bold leading-none text-white"
            style={{ backgroundColor: focusPart.colorHex }}
          >
            {focusPart.partNumber}
          </span>
          <a
            href={focusPart.href}
            class="min-w-0 truncate text-sm font-serif font-bold text-slate-900 hover:text-indigo-700 transition-colors sm:text-base"
          >
            {focusPart.title}
          </a>
        </div>
        <div class="mt-1.5 flex h-7 items-center gap-1.5">
          <button
            type="button"
            onClick={rotateLeft}
            class="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
            aria-label="Rotate left"
          >
            <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          {hasCenter ? (
            <button
              type="button"
              onClick={removeFromCenter}
              class="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
            >
              Remove from centre
            </button>
          ) : (
            <button
              type="button"
              onClick={() => animateToCenter(topPart.partNumber)}
              class="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
            >
              Move to centre
            </button>
          )}
          <button
            type="button"
            onClick={rotateRight}
            class="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
            aria-label="Rotate right"
          >
            <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      <div class="sm:rounded-lg sm:border sm:border-slate-200 sm:bg-slate-50 sm:p-6">
        <svg
          ref={svgRef}
          viewBox={`${VIEWBOX_INSET} ${VIEWBOX_INSET} ${VIEWBOX_SIZE - VIEWBOX_INSET * 2} ${VIEWBOX_SIZE - VIEWBOX_INSET * 2}`}
          class="mx-auto aspect-square w-full max-w-[38rem] cursor-default touch-none select-none sm:max-w-[42rem]"
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
          {/* Invisible interactive ring for grab cursor — only within drag zone */}
          <path
            d={donutSlicePath(CENTER, CENTER, hasCenter ? CENTER_DISC_RADIUS : effectiveInnerRadius, INTERACTIVE_RADIUS, 0, 359.9)}
            fill="transparent"
            class="cursor-grab active:cursor-grabbing"
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
            const centerAngle = rotationDegrees + index * segmentAngle + swapOffset + removeOffset + centerMoveOffset;
            const effectiveSpan = removeMorphT > 0 && removePreviewOffsets
              ? lerp(segmentAngle, removePreviewOffsets.fullSegAngle, removeMorphT)
              : morphT > 0 && centerPreviewOffsets && part.partNumber !== morphPartNumber
                ? lerp(segmentAngle, centerPreviewOffsets.newSegAngle, morphT)
                : segmentAngle;
            const startAngle = centerAngle - effectiveSpan / 2;
            const endAngle = centerAngle + effectiveSpan / 2;
            const labelPosition = polar(CENTER, CENTER, LABEL_RADIUS, centerAngle);
            const labelLines = wrapLabel(part.title);
            const textAnchor = textAnchorForAngle(centerAngle);
            const labelX =
              labelPosition.x + (textAnchor === 'start' ? -30 : textAnchor === 'end' ? 30 : 0);
            const isTop = topPart.partNumber === part.partNumber;
            const distFromTop = angularDistance(centerAngle, 0);
            const topWeight = Math.max(0, 1 - distFromTop / effectiveSpan);
            const segmentInnerRadius = lerp(effectiveInnerRadius, effectiveInnerRadius - 10, topWeight);
            const segmentOuterRadius = lerp(OUTER_RADIUS, OUTER_RADIUS + 12, topWeight);
            const numberPosition = polar(CENTER, CENTER, lerp(134, 138, topWeight), centerAngle);
            const connectorStart = polar(CENTER, CENTER, segmentOuterRadius + 6, centerAngle);
            const connectorEnd = polar(CENTER, CENTER, lerp(CONNECTOR_RADIUS, CONNECTOR_RADIUS + 8, topWeight), centerAngle);

            return (
              <g key={part.partNumber}>
                <path
                  d={donutSlicePath(CENTER, CENTER, segmentInnerRadius, segmentOuterRadius + 10, startAngle, endAngle)}
                  fill="transparent"
                  class="cursor-grab active:cursor-grabbing"
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
                        : lerp(0.94, 1, topWeight)
                  }
                  class="cursor-grab active:cursor-grabbing"
                  onPointerDown={handleSegmentPointerDown(part.partNumber)}
                />

                {/* Focus outline on the top part when no centre */}
                {isTop && !hasCenter && !isMorphingToCenter && !isPostSwapMorphing && !(morphT > 0 && morphPartNumber !== null) && (
                  <path
                    d={donutSlicePath(CENTER, CENTER, segmentInnerRadius + 2, segmentOuterRadius - 2, startAngle, endAngle)}
                    fill="none"
                    stroke="#0f172a"
                    stroke-width={SELECTION_OUTLINE_WIDTH}
                    stroke-linejoin="round"
                    pointer-events="none"
                  />
                )}

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
                  opacity={isMorphingToCenter ? Math.max(0, 1 - morphT * 1.5) : 1}
                >
                  {part.partNumber}
                </text>

                <g
                  pointer-events="none"
                  opacity={isMorphingToCenter ? Math.max(0, 1 - morphT * 1.5) : 1}
                >
                  <line
                    x1={connectorStart.x}
                    y1={connectorStart.y}
                    x2={connectorEnd.x}
                    y2={connectorEnd.y}
                    stroke={topWeight > 0.5 ? part.colorHex : '#cbd5e1'}
                    stroke-width={lerp(1.5, 2.5, topWeight)}
                  />
                  <circle cx={connectorEnd.x} cy={connectorEnd.y} r={3.5} fill={part.colorHex} />
                  <text
                    x={labelX}
                    y={labelPosition.y - (labelLines.length * 8)}
                    fill={topWeight > 0.5 ? '#0f172a' : '#334155'}
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
                        font-weight={topWeight > 0.5 ? '700' : '600'}
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
            const outlineInset = SELECTION_OUTLINE_WIDTH / 2;
            const pOutlineInner = hasCenter ? Math.max(pInner + outlineInset, CENTER_DISC_RADIUS + outlineInset) : pInner + outlineInset;

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
              </>
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
            const outlineInset = SELECTION_OUTLINE_WIDTH / 2;
            const mOutlineInner = Math.max(mInner + outlineInset, CENTER_DISC_RADIUS + outlineInset);
            return (
              <>
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
                <path
                  d={morphedDonutPath(
                    CENTER, CENTER,
                    mOutlineInner, mOuter - outlineInset,
                    mStartAngle, mEndAngle,
                    CENTER_DISC_RADIUS - outlineInset,
                    morphT
                  )}
                  fill="none"
                  stroke="#0f172a"
                  stroke-width={SELECTION_OUTLINE_WIDTH}
                  stroke-linejoin="round"
                  pointer-events="none"
                />
              </>
            );
          })()}

          {/* Old center morphing out to ring during swap preview */}
          {morphT > 0 && hasCenter && centerPart && centerPreviewOffsets?.oldCenterTarget && (() => {
            const target = centerPreviewOffsets.oldCenterTarget;
            const tDistFromTop = angularDistance(target.centerAngle, 0);
            const tSegAngle = centerPreviewOffsets.newSegAngle;
            const tTopWeight = Math.max(0, 1 - tDistFromTop / tSegAngle);
            const tInner = lerp(INNER_RADIUS, INNER_RADIUS - 10, tTopWeight);
            const tOuter = lerp(OUTER_RADIUS, OUTER_RADIUS + 12, tTopWeight);
            const tOutlineInset = SELECTION_OUTLINE_WIDTH / 2;
            const tOutlineInner = Math.max(tInner + tOutlineInset, CENTER_DISC_RADIUS + tOutlineInset);
            const tNumberPos = polar(CENTER, CENTER, lerp(134, 138, tTopWeight), target.centerAngle);
            const tConnStart = polar(CENTER, CENTER, tOuter + 6, target.centerAngle);
            const tConnEnd = polar(CENTER, CENTER, lerp(CONNECTOR_RADIUS, CONNECTOR_RADIUS + 8, tTopWeight), target.centerAngle);
            const tLabelPos = polar(CENTER, CENTER, LABEL_RADIUS, target.centerAngle);
            const tTextAnchor = textAnchorForAngle(target.centerAngle);
            const tLabelX = tLabelPos.x + (tTextAnchor === 'start' ? -30 : tTextAnchor === 'end' ? 30 : 0);
            const tLabelLines = wrapLabel(centerPart.title);
            return (
              <g opacity={morphT} pointer-events="none">
                <path
                  d={morphedDonutPath(
                    CENTER, CENTER,
                    tInner, tOuter,
                    target.startAngle, target.endAngle,
                    CENTER_DISC_RADIUS,
                    1 - morphT
                  )}
                  fill={centerPart.colorHex}
                  opacity={1 / Math.max(morphT, 0.01)}
                />
                <path
                  d={morphedDonutPath(
                    CENTER, CENTER,
                    tOutlineInner, tOuter - tOutlineInset,
                    target.startAngle, target.endAngle,
                    CENTER_DISC_RADIUS - tOutlineInset,
                    1 - morphT
                  )}
                  fill="none"
                  stroke="#0f172a"
                  stroke-width={SELECTION_OUTLINE_WIDTH}
                  stroke-linejoin="round"
                />
                <text
                  x={tNumberPos.x}
                  y={tNumberPos.y}
                  fill="white"
                  font-size="24"
                  font-family="Inter, sans-serif"
                  font-weight="700"
                  text-anchor="middle"
                  dominant-baseline="middle"
                >
                  {centerPart.partNumber}
                </text>
                <line
                  x1={tConnStart.x}
                  y1={tConnStart.y}
                  x2={tConnEnd.x}
                  y2={tConnEnd.y}
                  stroke={tTopWeight > 0.5 ? centerPart.colorHex : '#cbd5e1'}
                  stroke-width={lerp(1.5, 2.5, tTopWeight)}
                />
                <circle cx={tConnEnd.x} cy={tConnEnd.y} r={3.5} fill={centerPart.colorHex} />
                <text
                  x={tLabelX}
                  y={tLabelPos.y - (tLabelLines.length * 8)}
                  fill={tTopWeight > 0.5 ? '#0f172a' : '#334155'}
                  font-size={`${lerp(11, 12, tTopWeight)}`}
                  font-family="Inter, sans-serif"
                  font-weight="700"
                  letter-spacing="0.12em"
                  text-anchor={tTextAnchor}
                >
                  <tspan x={tLabelX} dy="0">
                    {centerPart.partName.toUpperCase()}
                  </tspan>
                  {tLabelLines.map((line, lineIndex) => (
                    <tspan
                      x={tLabelX}
                      dy={lineIndex === 0 ? 16 : 14}
                      font-size={`${lerp(13, 14, tTopWeight)}`}
                      font-weight={tTopWeight > 0.5 ? '700' : '600'}
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
            const rmOutlineInset = SELECTION_OUTLINE_WIDTH / 2;
            const rmOutlineInner = Math.max(rmInner + rmOutlineInset, CENTER_DISC_RADIUS + rmOutlineInset);

            const numberPos = polar(CENTER, CENTER, lerp(134, 138, rmTopWeight), rmCenterAngle);
            const rmConnectorStart = polar(CENTER, CENTER, rmOuter + 6, rmCenterAngle);
            const rmConnectorEnd = polar(CENTER, CENTER, lerp(CONNECTOR_RADIUS, CONNECTOR_RADIUS + 8, rmTopWeight), rmCenterAngle);
            const rmLabelPos = polar(CENTER, CENTER, LABEL_RADIUS, rmCenterAngle);
            const rmTextAnchor = textAnchorForAngle(rmCenterAngle);
            const rmLabelX = rmLabelPos.x + (rmTextAnchor === 'start' ? -30 : rmTextAnchor === 'end' ? 30 : 0);
            const rmLabelLines = wrapLabel(centerPart.title);

            return (
              <g opacity={removeMorphT} pointer-events="none">
                <path
                  d={morphedDonutPath(
                    CENTER, CENTER,
                    rmInner, rmOuter,
                    rmStartAngle, rmEndAngle,
                    CENTER_DISC_RADIUS,
                    1 - removeMorphT
                  )}
                  fill={centerPart.colorHex}
                  opacity={1 / removeMorphT}
                />
                <path
                  d={morphedDonutPath(
                    CENTER, CENTER,
                    rmOutlineInner, rmOuter - rmOutlineInset,
                    rmStartAngle, rmEndAngle,
                    CENTER_DISC_RADIUS - rmOutlineInset,
                    1 - removeMorphT
                  )}
                  fill="none"
                  stroke="#0f172a"
                  stroke-width={SELECTION_OUTLINE_WIDTH}
                  stroke-linejoin="round"
                />
                <text
                  x={numberPos.x}
                  y={numberPos.y}
                  fill="white"
                  font-size="24"
                  font-family="Inter, sans-serif"
                  font-weight="700"
                  text-anchor="middle"
                  dominant-baseline="middle"
                >
                  {centerPart.partNumber}
                </text>
                <line
                  x1={rmConnectorStart.x}
                  y1={rmConnectorStart.y}
                  x2={rmConnectorEnd.x}
                  y2={rmConnectorEnd.y}
                  stroke={rmTopWeight > 0.5 ? centerPart.colorHex : '#cbd5e1'}
                  stroke-width={lerp(1.5, 2.5, rmTopWeight)}
                />
                <circle cx={rmConnectorEnd.x} cy={rmConnectorEnd.y} r={3.5} fill={centerPart.colorHex} />
                <text
                  x={rmLabelX}
                  y={rmLabelPos.y - (rmLabelLines.length * 8)}
                  fill={rmTopWeight > 0.5 ? '#0f172a' : '#334155'}
                  font-size={`${lerp(11, 12, rmTopWeight)}`}
                  font-family="Inter, sans-serif"
                  font-weight="700"
                  letter-spacing="0.12em"
                  text-anchor={rmTextAnchor}
                >
                  <tspan x={rmLabelX} dy="0">
                    {centerPart.partName.toUpperCase()}
                  </tspan>
                  {rmLabelLines.map((line, lineIndex) => (
                    <tspan
                      x={rmLabelX}
                      dy={lineIndex === 0 ? 16 : 14}
                      font-size={`${lerp(13, 14, rmTopWeight)}`}
                      font-weight={rmTopWeight > 0.5 ? '700' : '600'}
                      letter-spacing="0"
                    >
                      {line}
                    </tspan>
                  ))}
                </text>
              </g>
            );
          })()}

          {centerDisplayPart && (
          <g
            role="button"
            tabIndex={0}
            class="cursor-grab active:cursor-grabbing"
            style={{ outline: 'none' }}
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
                  startRotation: rotationDegrees,
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
                removeMorphT > 0 ? Math.max(0, 1 - removeMorphT * 1.5) : 1
              }
            />
            {/* Focus outline on centre disc — show when centre exists, or when morph preview is nearly complete */}
            {(hasCenter || (morphT > 0.9 && morphPartNumber !== null)) && removeMorphT === 0 && (
              <circle
                cx={CENTER}
                cy={CENTER}
                r={CENTER_DISC_RADIUS - SELECTION_OUTLINE_WIDTH / 2}
                fill="none"
                stroke="#0f172a"
                stroke-width={SELECTION_OUTLINE_WIDTH}
                pointer-events="none"
              />
            )}
            <g opacity={
              removeMorphT > 0 ? Math.max(0, 1 - removeMorphT * 1.5) : 1
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
          )}
        </svg>

        <div class="mt-2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-sm sm:mt-5 sm:rounded-lg sm:px-5 sm:py-3">
          {hasCenter && centerPart ? (
            <>
              <p class="text-[0.68rem] font-sans font-semibold uppercase tracking-[0.2em] text-slate-500 sm:text-sm sm:tracking-[0.18em]">
                Circle of learning
              </p>
              <p class="mt-1 text-sm font-serif leading-6 text-slate-700 sm:text-base sm:leading-7">
                Centred on {centerPart.title}, with {topPart.title} at the top.
                {suggestedSections.length > 0 && centerPartNumber !== topPartNumber && (
                  <>{' '}See where these fields connect below.</>
                )}
              </p>
              {suggestedSections.length > 0 && connectionSummary && (() => {
                return (
                <div class="mt-3 border-t border-slate-200 pt-3">
                  <p class="text-[0.68rem] font-sans font-semibold uppercase tracking-[0.2em] text-slate-500 sm:text-xs">
                    Connected sections
                  </p>
                  <p class="mt-1 text-xs leading-5 text-slate-400 sm:text-sm">
                    {connectionSummary.isDirect
                      ? `Sections where ${centerPart.title} and ${topPart.title} cross-reference each other${connectionSummary.hasKeyword ? ', supplemented by sections with related subject matter.' : '.'}`
                      : connectionSummary.hasConnectionData
                        ? `Sections that connect ${centerPart.title} and ${topPart.title} through shared references and related subject matter.`
                        : `Sections with related subject matter across ${centerPart.title} and ${topPart.title}.`}
                  </p>
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
                </div>
                );
              })()}
              {(() => {
                if (centerPartNumber === topPartNumber) return null;
                const bridgeKey = getConnectionKey(centerPartNumber, topPartNumber);
                const bridge = bridgeRecommendations[bridgeKey];
                if (!bridge || (!bridge.vsi?.length && !bridge.wiki?.length)) return null;
                const isFlipped = centerPartNumber > topPartNumber;
                const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                const bridgeVsi = bridge.vsi || [];
                const bridgeWiki = bridge.wiki || [];
                const bridgeMacro = bridge.macro || [];
                if (bridgeVsi.length === 0 && bridgeWiki.length === 0 && bridgeMacro.length === 0) return null;
                // maxTotal is used for the two-color bar proportions (not relevance)
                const maxVsiTotal = bridgeVsi.length > 0 ? Math.max(...bridgeVsi.map(v => v.ca + v.cb)) : 1;
                const maxWikiTotal = bridgeWiki.length > 0 ? Math.max(...bridgeWiki.map(v => v.ca + v.cb)) : 1;
                const maxMacroTotal = bridgeMacro.length > 0 ? Math.max(...bridgeMacro.map(v => v.ca + v.cb)) : 1;
                return (
                  <div class="mt-3 border-t border-slate-200 pt-3">
                    <p class="text-[0.68rem] font-sans font-semibold uppercase tracking-[0.2em] text-slate-500 sm:text-xs">
                      Recommended Readings
                    </p>
                    <p class="mt-1 text-xs leading-5 text-slate-400 sm:text-sm">
                      Books and articles independently recommended for both {centerPart.partName}: {centerPart.title} and {topPart.partName}: {topPart.title}. Ranked by how deeply they connect the two parts - considering sections, outline items, and overall spread. The bar shows the balance of coverage between the two chosen parts.
                    </p>
                    <div class="mt-3 flex items-center gap-3 text-[10px] font-sans text-slate-400">
                      <span class="flex items-center gap-1">
                        <span class="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: centerPart.colorHex }} />
                        {centerPart.partName}
                      </span>
                      <span class="flex items-center gap-1">
                        <span class="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: topPart.colorHex }} />
                        {topPart.partName}
                      </span>
                    </div>
                    <div class="mt-3 space-y-4">{[
                      { items: bridgeVsi, type: 'vsi' as const, title: 'Oxford VSI Recommendations', maxTotal: maxVsiTotal, browseHref: `${baseUrl}/vsi`, browseLabel: 'Browse all Oxford VSI books', getHref: (item: BridgeItem) => `${baseUrl}/vsi/${slugify(item.t)}`, getCheckKey: (item: BridgeItem) => vsiChecklistKey(item.t, item.a || '') },
                      { items: bridgeWiki, type: 'wikipedia' as const, title: 'Wikipedia Article Recommendations', maxTotal: maxWikiTotal, browseHref: `${baseUrl}/wikipedia`, browseLabel: 'Browse all Wikipedia articles', getHref: (item: BridgeItem) => `${baseUrl}/wikipedia/${slugify(item.t)}`, getCheckKey: (item: BridgeItem) => wikipediaChecklistKey(item.t) },
                      { items: bridgeMacro, type: 'macropaedia' as const, title: 'Macropaedia Reading List', maxTotal: maxMacroTotal, browseHref: `${baseUrl}/macropaedia`, browseLabel: 'Browse all Macropaedia articles', getHref: (item: BridgeItem) => `${baseUrl}/macropaedia/${slugify(item.t)}`, getCheckKey: (item: BridgeItem) => macropaediaChecklistKey(item.t) },
                    ].filter(section => section.items.length > 0).sort((a, b) => (a.type === readingPref ? -1 : b.type === readingPref ? 1 : 0)).map((section) => (
                      <Accordion
                        key={section.type}
                        title={`${section.title} (${section.items.length})`}
                        forceOpenKey={readingPref === section.type ? 0 : undefined}
                        forceCloseKey={readingPref !== section.type ? 0 : undefined}
                      >
                        <div class="mb-4 flex justify-end">
                          <a href={section.browseHref} class="text-xs font-semibold uppercase tracking-wide text-indigo-700 hover:text-indigo-900 hover:underline">
                            {section.browseLabel}
                          </a>
                        </div>
                        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                          {section.items.map((item) => {
                            const centerCount = isFlipped ? item.cb : item.ca;
                            const topCount = isFlipped ? item.ca : item.cb;
                            const relevancePct = (item as any).r ?? Math.round(((centerCount + topCount) / section.maxTotal) * 100);
                            const total = centerCount + topCount;
                            const scale = relevancePct / 100;
                            const centerPct = total > 0 ? Math.round((centerCount / total) * scale * 100) : 0;
                            const topPct = total > 0 ? Math.round((topCount / total) * scale * 100) : 0;
                            const checkKey = section.getCheckKey(item);
                            const isChecked = Boolean(checklistState[checkKey]);
                            const whyLabel = section.type === 'vsi' ? 'Why this book?' : 'Why this article?';
                            const balanceDesc = Math.abs(centerCount - topCount) <= 1
                              ? 'with roughly equal coverage of both'
                              : centerCount > topCount
                                ? `leaning more toward ${centerPart.title}`
                                : `leaning more toward ${topPart.title}`;
                            const rationale = `Independently recommended in ${centerCount} section${centerCount !== 1 ? 's' : ''} of ${centerPart.title} and ${topCount} section${topCount !== 1 ? 's' : ''} of ${topPart.title}, ${balanceDesc}. Items are ranked higher when they bridge both parts evenly rather than being concentrated in one.`;

                            return (
                              <div
                                key={item.t}
                                class={`rounded-lg border p-4 bg-white hover:shadow-md transition-shadow duration-200 ${isChecked ? 'border-slate-300 bg-slate-200/70 opacity-50' : 'border-gray-200'}`}
                              >
                                <div class="mb-2 flex items-start justify-between gap-3">
                                  <div class="min-w-0">
                                    <h4 class="font-serif font-bold text-gray-900 text-base leading-tight">
                                      <a href={section.getHref(item)} class="hover:text-indigo-700 transition-colors">{item.t}</a>
                                    </h4>
                                    {item.a && <p class="text-sm text-gray-500 mt-0.5">{item.a}</p>}
                                  </div>
                                  <label class="inline-flex items-center gap-2 text-xs font-sans font-medium text-gray-500">
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={(e) => writeChecklistState(checkKey, (e.currentTarget as HTMLInputElement).checked)}
                                      class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                    />
                                    Done
                                  </label>
                                </div>
                                <div class="mb-3 flex items-center gap-2">
                                  <div class="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                                    <div class="flex h-full">
                                      <div class="rounded-l-full" style={{ width: `${centerPct}%`, backgroundColor: centerPart.colorHex }} />
                                      <div style={{ width: `${topPct}%`, backgroundColor: topPart.colorHex, borderRadius: centerPct === 0 ? '9999px 0 0 9999px' : topPct + centerPct >= 100 ? '0 9999px 9999px 0' : '0' }} />
                                    </div>
                                  </div>
                                  <span class="text-[10px] font-sans text-gray-400 whitespace-nowrap">{relevancePct}% relevance</span>
                                </div>
                                <Accordion title={whyLabel} defaultOpen={false}>
                                  <p class="text-gray-600">{rationale}</p>
                                </Accordion>
                              </div>
                            );
                          })}
                        </div>
                      </Accordion>
                    ))}</div>
                  </div>
                );
              })()}
            </>
          ) : (
            <>
              <p class="text-[0.68rem] font-sans font-semibold uppercase tracking-[0.2em] text-slate-500 sm:text-sm sm:tracking-[0.18em]">
                Circle of learning
              </p>
              <p class="mt-1 text-sm font-serif leading-6 text-slate-700 sm:text-base sm:leading-7">
                {topPart.title} is at the top.
              </p>

              <div class="mt-3 border-t border-slate-200 pt-3">
                <a
                  href={`${baseUrl}/part/${topPart.partNumber}`}
                  class="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                >
                  Read essay
                </a>
              </div>

              {topPart.divisions.length > 0 && (
                <div class="mt-3 border-t border-slate-200 pt-3">
                  <p class="text-[0.68rem] font-sans font-semibold uppercase tracking-[0.2em] text-slate-500 sm:text-xs">
                    {topPart.divisions.length} {topPart.divisions.length === 1 ? 'Division' : 'Divisions'}
                  </p>
                  <ul class="mt-2 space-y-1">
                    {topPart.divisions.map((d) => (
                      <li key={d.divisionId}>
                        <a
                          href={`${baseUrl}/division/${d.divisionId}`}
                          class="group flex items-start gap-1.5 rounded px-1 py-1 text-xs transition hover:bg-slate-50 sm:text-sm"
                        >
                          <span
                            class="mt-1 inline-block h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: topPart.colorHex }}
                          />
                          <span class="text-slate-700 group-hover:text-indigo-700">
                            <span class="text-slate-400">{d.romanNumeral}.</span>{' '}{d.title}
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {partReadings[String(topPartNumber)] && (
                <div class="mt-3 border-t border-slate-200 pt-3">
                  <TopReadings
                    vsi={partReadings[String(topPartNumber)]?.vsi}
                    wiki={partReadings[String(topPartNumber)]?.wiki}
                    macro={partReadings[String(topPartNumber)]?.macro}
                    baseUrl={baseUrl}
                    contextLabel="this part"
                    countLabel="divisions"
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>

    </div>
  );
}
