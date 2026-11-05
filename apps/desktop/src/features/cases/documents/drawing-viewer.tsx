import { Eraser, ImageOff, Maximize2, Minus, Pentagon, Plus, Ruler } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { Button } from '@/components/ui/button';
import { isTypingTarget } from '@/lib/use-keydown';
import { cn } from '@/lib/cn';
import {
  distance,
  findSnap,
  frameToSheet,
  parseMeasurableSvg,
  sheetPlacement,
  sheetToFrame,
  describeMeasurement,
  type DrawingMetadata,
  type MeasureKind,
  type Measurement,
  type Point,
  type Snap,
  type SnapTargets,
} from './measure-geometry';
import { MeasureList, MeasureOverlay } from './measure-overlay';

const MIN_SCALE = 0.1;
const MAX_SCALE = 8;
const STEP = 1.25;
/** Pointer movement (px) that turns a click into a drag. */
const DRAG_THRESHOLD = 4;
/** A pressed tool button. */
const PRESSED = 'border-accent bg-accent-soft font-semibold';
/** Snap distance in screen pixels. */
const SNAP_RADIUS = 8;

interface View {
  scale: number;
  x: number;
  y: number;
}

type Tool = 'pan' | MeasureKind;

interface Draft {
  kind: MeasureKind;
  points: Point[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isSvg(src: string): boolean {
  return /\.svg(?:$|[?#])/i.test(src);
}

/** The drawing's scale and snap targets, read from the SVG source. Null for PNG and old SVGs. */
function useMeasurableSvg(src: string) {
  const [result, setResult] = useState<{
    metadata: DrawingMetadata;
    targets: SnapTargets;
  } | null>(null);
  useEffect(() => {
    if (!isSvg(src)) return;
    let cancelled = false;
    fetch(src)
      .then((response) => (response.ok ? response.text() : ''))
      .then((text) => {
        if (!cancelled && text) setResult(parseMeasurableSvg(text));
      })
      .catch(() => {
        // Without metadata the drawing can still be viewed, just not measured.
      });
    return () => {
      cancelled = true;
    };
  }, [src]);
  return result;
}

/**
 * A drawing (SVG or PNG) with zoom (buttons, scroll wheel, + and −) and panning (drag, or
 * the arrow keys when the drawing has focus). Starts at 100 %, centred, or smaller when the
 * panel is narrower than the drawing; "Anpassa" fills the panel width. Give it
 * `key={src}` so a new drawing starts from a fresh view.
 *
 * Generated SVG drawings carry their scale, so they can also be measured: "Mät" (M) gives
 * distances between two clicks and areas of polygons (double-click or Enter closes), snapping
 * to the drawing's corners and lines.
 */
export interface DrawingViewerProps {
  src: string;
  title: string;
  /**
   * How the drawing starts: `width` fills the panel width (the case view), `page` shows the
   * whole sheet (the quiz, where the drawing sits above the answer).
   */
  fit?: 'width' | 'page';
  /** Classes for the drawing frame, e.g. a fixed height when the parent has none. */
  frameClassName?: string;
  /** Shown instead of the default text when the file cannot be loaded. */
  missing?: ReactNode;
}

export function DrawingViewer({
  src,
  title,
  fit: initialFit = 'width',
  frameClassName,
  missing,
}: DrawingViewerProps) {
  const frame = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const [failed, setFailed] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean; start: Point } | null>(
    null,
  );

  const measurable = useMeasurableSvg(src);
  const [tool, setTool] = useState<Tool>('pan');
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [hover, setHover] = useState<{ frame: Point; snap: Snap | null } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const nextId = useRef(1);

  const placement = useMemo(
    () => (measurable && natural ? sheetPlacement(measurable.metadata.viewBox, natural) : null),
    [measurable, natural],
  );
  const canMeasure = placement !== null && measurable !== null;
  const measuring = canMeasure && tool !== 'pan';
  const metersPerUnit = measurable?.metadata.metersPerUnit ?? 1;

  const toFrame = useCallback(
    (p: Point) => (placement ? sheetToFrame(p, view, placement) : p),
    [placement, view],
  );

  /**
   * The view that shows the whole width (or, for `page`, the whole sheet) of `size`,
   * centred. With `atMostNatural` it never enlarges past 100 %, so a drawing opens at its
   * real size on a wide panel and only shrinks to fit a narrow one.
   */
  const fitted = (size: { width: number; height: number }, atMostNatural = false): View => {
    const width = frame.current?.clientWidth ?? size.width;
    const height = frame.current?.clientHeight ?? 0;
    const byWidth = (width - 32) / size.width;
    const byHeight = initialFit === 'page' && height > 0 ? (height - 32) / size.height : byWidth;
    const best = Math.min(byWidth, byHeight);
    const scale = clamp(atMostNatural ? Math.min(best, 1) : best, MIN_SCALE, MAX_SCALE);
    return { scale, x: (width - size.width * scale) / 2, y: 16 };
  };
  const fit = () => {
    if (natural) setView(fitted(natural));
  };

  /** Zooms by `factor` keeping the point (px, py) inside the frame still. */
  const zoomAt = useCallback((factor: number, px?: number, py?: number) => {
    setView((v) => {
      const el = frame.current;
      const cx = px ?? (el ? el.clientWidth / 2 : 0);
      const cy = py ?? (el ? el.clientHeight / 2 : 0);
      const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
      const ratio = scale / v.scale;
      return { scale, x: cx - (cx - v.x) * ratio, y: cy - (cy - v.y) * ratio };
    });
  }, []);

  // A native, non-passive wheel listener so the page does not scroll while zooming.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(event.deltaY < 0 ? 1.1 : 1 / 1.1, event.clientX - rect.left, event.clientY - rect.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  // ---------------------------------------------------------------------------------------
  // Measuring

  const local = (event: { clientX: number; clientY: number }): Point => {
    const rect = frame.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  };

  const snapFor = (at: Point): Snap | null =>
    measurable ? findSnap(at, measurable.targets, toFrame, SNAP_RADIUS) : null;

  /** The sheet point for a pointer at `at` (frame px), snapped when a target is close. */
  const sheetPointFor = (at: Point): Point | null => {
    if (!placement) return null;
    return snapFor(at)?.point ?? frameToSheet(at, view, placement);
  };

  const commit = (kind: MeasureKind, points: Point[]) => {
    const measurement: Measurement = { id: nextId.current, kind, points };
    nextId.current += 1;
    setMeasurements((list) => [...list, measurement]);
    setDraft(null);
    setAnnouncement(`${describeMeasurement(measurement, metersPerUnit)}.`);
  };

  const finishArea = () => {
    if (draft?.kind === 'area' && draft.points.length >= 3) commit('area', draft.points);
  };

  const addPoint = (at: Point) => {
    const point = sheetPointFor(at);
    if (!point || tool === 'pan') return;
    const near = (p: Point | undefined, radius: number) =>
      p !== undefined && distance(toFrame(p), toFrame(point)) <= radius;
    if (!draft || draft.kind !== tool) {
      setDraft({ kind: tool, points: [point] });
      return;
    }
    if (tool === 'distance') {
      if (near(draft.points[0], 1)) return;
      commit('distance', [draft.points[0]!, point]);
      return;
    }
    // The second click of a double-click lands on the last point: ignore it.
    if (near(draft.points.at(-1), DRAG_THRESHOLD)) return;
    // Clicking the first point again closes the polygon.
    if (draft.points.length >= 3 && near(draft.points[0], SNAP_RADIUS)) {
      commit('area', draft.points);
      return;
    }
    setDraft({ kind: 'area', points: [...draft.points, point] });
  };

  const clearMeasurements = () => {
    setMeasurements([]);
    setDraft(null);
    setAnnouncement('Alla mått är borttagna.');
  };

  const chooseTool = (next: Tool) => {
    setTool(next);
    setDraft(null);
    setHover(null);
  };

  // M and Esc work wherever focus is in the case view or quiz (but not while typing or in a dialog
  // on top). Capture phase, so Esc cancels a measurement before it closes the document.
  const onWindowKey = useEffectEvent((event: globalThis.KeyboardEvent) => {
    if (!canMeasure || event.ctrlKey || event.metaKey || event.altKey) return;
    if (isTypingTarget(event.target)) return;
    const target = event.target instanceof Element ? event.target : null;
    const dialog = target?.closest('[role="dialog"], [role="alertdialog"]');
    if (dialog && !dialog.contains(frame.current)) return;
    if (event.key === 'm' || event.key === 'M') {
      event.preventDefault();
      chooseTool(tool === 'pan' ? 'distance' : 'pan');
    } else if (event.key === 'Escape') {
      if (draft) {
        setDraft(null);
        setAnnouncement('Mätningen avbröts.');
      } else if (tool !== 'pan' || measurements.length > 0) {
        setMeasurements([]);
        chooseTool('pan');
        setAnnouncement('Mätningen är avslutad och måtten är borttagna.');
      } else {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    }
  });
  useEffect(() => {
    const listener = (event: globalThis.KeyboardEvent) => onWindowKey(event);
    window.addEventListener('keydown', listener, { capture: true });
    return () => window.removeEventListener('keydown', listener, { capture: true });
  }, []);

  // ---------------------------------------------------------------------------------------
  // Pointer

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const start = { x: event.clientX, y: event.clientY };
    drag.current = { id: event.pointerId, ...start, moved: false, start };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (measuring) {
      const at = local(event);
      setHover({ frame: at, snap: snapFor(at) });
    }
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    if (
      !current.moved &&
      distance(current.start, { x: event.clientX, y: event.clientY }) < DRAG_THRESHOLD
    ) {
      return;
    }
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    drag.current = { ...current, x: event.clientX, y: event.clientY, moved: true };
    setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    drag.current = null;
    if (!current || current.id !== event.pointerId || current.moved || !measuring) return;
    addPoint(local(event));
  };
  const endDrag = () => {
    drag.current = null;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const pan = 48;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [pan, 0],
      ArrowRight: [-pan, 0],
      ArrowUp: [0, pan],
      ArrowDown: [0, -pan],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      setView((v) => ({ ...v, x: v.x + move[0], y: v.y + move[1] }));
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoomAt(STEP);
    } else if (event.key === '-') {
      event.preventDefault();
      zoomAt(1 / STEP);
    } else if (event.key === '0') {
      event.preventDefault();
      fit();
    } else if (event.key === 'Enter' && draft?.kind === 'area' && draft.points.length >= 3) {
      event.preventDefault();
      finishArea();
    }
  };

  if (failed) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong p-10 text-center text-sm text-muted">
        <ImageOff className="size-6" aria-hidden="true" />
        <p className="font-medium text-ink">Ritningen finns inte i den här versionen av appen</p>
        {missing ?? <p>Uppgifterna ur handlingen finns i ärendeöversikten.</p>}
      </div>
    );
  }

  const hint = !measuring
    ? 'Scrolla för att zooma, dra för att flytta'
    : tool === 'distance'
      ? 'Klicka på två punkter. Esc avbryter'
      : 'Klicka runt ytan, dubbelklicka eller Enter avslutar. Esc avbryter';
  const pointer = measuring && hover && placement ? sheetPointFor(hover.frame) : null;

  return (
    <div className="flex h-full min-h-[360px] flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Zoom och mät">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => zoomAt(1 / STEP)}
          aria-label="Zooma ut"
        >
          <Minus aria-hidden="true" />
        </Button>
        <span className="w-14 text-center text-sm tabular-nums text-muted" aria-live="polite">
          {Math.round(view.scale * 100)} %
        </span>
        <Button variant="secondary" size="sm" onClick={() => zoomAt(STEP)} aria-label="Zooma in">
          <Plus aria-hidden="true" />
        </Button>
        <Button variant="ghost" size="sm" onClick={fit}>
          <Maximize2 aria-hidden="true" />
          Anpassa
        </Button>
        {canMeasure && (
          <>
            <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
            <Button
              variant="secondary"
              size="sm"
              className={cn(tool === 'distance' && PRESSED)}
              aria-pressed={tool === 'distance'}
              aria-keyshortcuts="M"
              title={`Mät avstånd i meter (M). Skala ${measurable.metadata.scaleLabel}`}
              onClick={() => chooseTool(tool === 'distance' ? 'pan' : 'distance')}
            >
              <Ruler aria-hidden="true" />
              Mät
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className={cn(tool === 'area' && PRESSED)}
              aria-pressed={tool === 'area'}
              title="Mät en yta i kvadratmeter"
              onClick={() => chooseTool(tool === 'area' ? 'pan' : 'area')}
            >
              <Pentagon aria-hidden="true" />
              Yta
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearMeasurements}
              disabled={measurements.length === 0 && !draft}
            >
              <Eraser aria-hidden="true" />
              Rensa
            </Button>
          </>
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <div
        ref={frame}
        tabIndex={0}
        role="img"
        aria-label={`${title}. Piltangenterna flyttar, plus och minus zoomar, 0 anpassar.${
          canMeasure ? ' M mäter.' : ''
        }`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={endDrag}
        onPointerLeave={() => setHover(null)}
        onDoubleClick={finishArea}
        onKeyDown={onKeyDown}
        className={cn(
          'relative min-h-0 flex-1 touch-none overflow-hidden rounded-md border border-line bg-bg',
          measuring ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing',
          frameClassName,
        )}
      >
        <img
          src={src}
          alt=""
          draggable={false}
          onLoad={(event) => {
            const img = event.currentTarget;
            const size = { width: img.naturalWidth || 794, height: img.naturalHeight || 1123 };
            setNatural(size);
            setView(fitted(size, true));
          }}
          onError={() => setFailed(true)}
          className="drawing-sheet absolute top-0 left-0 max-w-none origin-top-left shadow-paper select-none"
          style={{
            width: natural ? natural.width : undefined,
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            visibility: natural ? 'visible' : 'hidden',
          }}
        />
        {canMeasure && (measurements.length > 0 || draft || measuring) && (
          <MeasureOverlay
            measurements={measurements}
            draft={draft}
            pointer={pointer}
            snap={measuring ? (hover?.snap ?? null) : null}
            metersPerUnit={metersPerUnit}
            toFrame={toFrame}
          />
        )}
      </div>
      {/* Below the drawing, so the drawing does not move when the text or the list changes. */}
      <p className="hidden text-xs text-muted sm:block">{hint}</p>
      {canMeasure && (
        <MeasureList
          measurements={measurements}
          metersPerUnit={metersPerUnit}
          onRemove={(id) => setMeasurements((list) => list.filter((m) => m.id !== id))}
        />
      )}
    </div>
  );
}
