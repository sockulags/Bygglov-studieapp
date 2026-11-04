import { ImageOff, Maximize2, Minus, Plus } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { Button } from '@/components/ui/button';

const MIN_SCALE = 0.1;
const MAX_SCALE = 8;
const STEP = 1.25;

interface View {
  scale: number;
  x: number;
  y: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * A drawing (SVG or PNG) with zoom (buttons, scroll wheel, + and −) and panning (drag, or
 * the arrow keys when the drawing has focus). Starts fitted to the panel width. Give it
 * `key={src}` so a new drawing starts from a fresh view.
 */
export function DrawingViewer({ src, title }: { src: string; title: string }) {
  const frame = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const [failed, setFailed] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);

  /** The view that shows the whole width of a drawing of `size`. */
  const fitted = (size: { width: number; height: number }): View => {
    const width = frame.current?.clientWidth ?? size.width;
    const scale = clamp((width - 32) / size.width, MIN_SCALE, MAX_SCALE);
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

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    drag.current = { ...start, x: event.clientX, y: event.clientY };
    setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
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
    }
  };

  if (failed) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong p-10 text-center text-sm text-muted">
        <ImageOff className="size-6" aria-hidden="true" />
        <p className="font-medium text-ink">Ritningen finns inte i den här versionen av appen</p>
        <p>Uppgifterna ur handlingen finns under fliken Planbestämmelser och fakta.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[360px] flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Zoom">
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
        <span className="ml-auto hidden text-xs text-muted sm:inline">
          Scrolla för att zooma, dra för att flytta
        </span>
      </div>
      <div
        ref={frame}
        tabIndex={0}
        role="img"
        aria-label={`${title}. Piltangenterna flyttar, plus och minus zoomar, 0 anpassar.`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        className="relative min-h-0 flex-1 cursor-grab touch-none overflow-hidden rounded-md border border-line bg-bg active:cursor-grabbing"
      >
        <img
          src={src}
          alt=""
          draggable={false}
          onLoad={(event) => {
            const img = event.currentTarget;
            const size = { width: img.naturalWidth || 794, height: img.naturalHeight || 1123 };
            setNatural(size);
            setView(fitted(size));
          }}
          onError={() => setFailed(true)}
          className="drawing-sheet absolute top-0 left-0 max-w-none origin-top-left shadow-paper select-none"
          style={{
            width: natural ? natural.width : undefined,
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            visibility: natural ? 'visible' : 'hidden',
          }}
        />
      </div>
    </div>
  );
}
