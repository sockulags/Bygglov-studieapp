import * as DialogPrimitive from '@radix-ui/react-dialog';
import { CornerDownLeft, Search } from 'lucide-react';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { DialogOverlay } from '@/components/ui/dialog';
import { KeyCombo, Kbd } from '@/components/ui/kbd';
import { loadContent, loadLookup } from '@/content';
import { cn } from '@/lib/cn';
import { useUiStore } from '@/store/ui';
import type { MatchRange } from './fuzzy';
import { PALETTE_ICONS } from './palette-icons';
import {
  buildPaletteItems,
  searchPalette,
  type PaletteItem,
  type PaletteResult,
} from './palette-items';
import { rememberPick, setPaletteOpen, usePaletteStore } from './palette-store';
import { useRunPaletteAction, type ActionOutcome } from './run-action';

/** The title with the matched characters marked. */
function Highlighted({ text, ranges }: { text: string; ranges: readonly MatchRange[] }) {
  if (ranges.length === 0) return <>{text}</>;
  const parts: ReactNode[] = [];
  let at = 0;
  ranges.forEach(([start, end]) => {
    if (start > at) parts.push(text.slice(at, start));
    parts.push(
      <mark key={start} className="rounded-[2px] bg-plan-yellow-soft font-semibold text-ink">
        {text.slice(start, end)}
      </mark>,
    );
    at = end;
  });
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}

const hitsLabel = (n: number) => (n === 0 ? 'Inga träffar' : n === 1 ? '1 träff' : `${n} träffar`);

function PaletteBody({ onDone }: { onDone: (focus: ActionOutcome['focus']) => void }) {
  const theme = useUiStore((s) => s.theme);
  const recent = usePaletteStore((s) => s.recent);
  const items = useMemo(() => {
    const content = loadContent();
    const questionCounts = new Map(
      [...content.questionsByModule].map(([id, questions]) => [id, questions.length]),
    );
    return buildPaletteItems({
      modules: content.modules,
      questionCounts,
      cases: content.cases,
      lookup: loadLookup(),
      theme,
    });
  }, [theme]);

  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runAction = useRunPaletteAction();
  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (i: number) => `${baseId}-option-${i}`;

  const groups = useMemo(() => searchPalette(items, query, recent), [items, query, recent]);
  const flat: PaletteResult[] = groups.flatMap((g) => g.results);
  const activeIndex = flat.length === 0 ? -1 : Math.min(active, flat.length - 1);

  useEffect(() => {
    if (activeIndex < 0) return;
    const element = document.getElementById(`${baseId}-option-${activeIndex}`);
    element?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, baseId]);

  const choose = async (item: PaletteItem) => {
    if (busy) return;
    rememberPick(item.id);
    setBusy(true);
    setError(null);
    const outcome = await runAction(item.action);
    setBusy(false);
    if (outcome.error) {
      setError(outcome.error);
      return;
    }
    onDone(outcome.focus);
    setPaletteOpen(false);
  };

  const move = (delta: number) => {
    if (flat.length === 0) return;
    setActive((activeIndex + delta + flat.length) % flat.length);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        move(-1);
        break;
      case 'PageDown':
        event.preventDefault();
        move(5);
        break;
      case 'PageUp':
        event.preventDefault();
        move(-5);
        break;
      case 'Enter': {
        event.preventDefault();
        const hit = flat[activeIndex];
        if (hit) void choose(hit.item);
        break;
      }
      default:
    }
  };

  // Index of each group's first result in `flat`, for the option ids and the active result.
  const offsets = groups.map((_, g) =>
    groups.slice(0, g).reduce((sum, group) => sum + group.results.length, 0),
  );
  return (
    <>
      <DialogPrimitive.Title className="sr-only">Kommandopalett</DialogPrimitive.Title>
      <DialogPrimitive.Description className="sr-only">
        Sök vyer, åtgärder, moduler, ärenden, begrepp och lagrum. Pilarna väljer, Enter öppnar, Esc
        stänger.
      </DialogPrimitive.Description>
      <div className="flex items-center gap-3 border-b border-line px-4 focus-within:border-accent">
        <Search className="size-[18px] shrink-0 text-muted" aria-hidden="true" />
        <input
          type="text"
          role="combobox"
          aria-label="Sök i appen"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
          autoComplete="off"
          spellCheck={false}
          value={query}
          placeholder="Sök vy, ärende, begrepp eller lagrum …"
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setError(null);
          }}
          onKeyDown={onKeyDown}
          className="h-14 min-w-0 flex-1 bg-transparent text-base placeholder:text-muted focus:outline-none focus-visible:outline-none"
        />
        <Kbd size="sm" aria-hidden="true">
          Esc
        </Kbd>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {query.trim() === '' ? '' : hitsLabel(flat.length)}
      </p>
      {error && (
        <p role="alert" className="border-b border-line bg-brick-soft px-4 py-2 text-sm text-ink">
          {error}
        </p>
      )}

      <div
        id={listId}
        role="listbox"
        aria-label="Träffar"
        aria-busy={busy}
        className="max-h-[min(26rem,60vh)] overflow-y-auto overscroll-contain p-2"
      >
        {flat.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-muted">
            Inga träffar. Pröva ett kortare ord, eller kapitel och paragraf som <em>9 kap 4</em>.
          </p>
        )}
        {groups.map((group, g) => {
          const headingId = `${baseId}-group-${group.id}`;
          return (
            <div key={group.id} role="group" aria-labelledby={headingId} className="pb-1">
              <p
                id={headingId}
                className="px-3 pt-2 pb-1 text-xs font-semibold tracking-[0.08em] text-muted uppercase"
              >
                {group.label}
              </p>
              {group.results.map((result, r) => {
                const i = (offsets[g] ?? 0) + r;
                const { item } = result;
                const Icon = PALETTE_ICONS[item.icon];
                const selected = i === activeIndex;
                return (
                  <div
                    key={`${group.id}:${item.id}`}
                    id={optionId(i)}
                    role="option"
                    aria-selected={selected}
                    data-active={selected || undefined}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseMove={() => {
                      if (!selected) setActive(i);
                    }}
                    onClick={() => void choose(item)}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-md px-3 py-2',
                      'data-[active]:bg-accent-soft',
                    )}
                  >
                    <Icon
                      className={cn('size-4 shrink-0 text-muted', selected && 'text-accent')}
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[0.9375rem] text-ink">
                        <Highlighted text={item.title} ranges={result.ranges} />
                      </span>
                      {item.detail && (
                        <span className="truncate text-xs text-muted">{item.detail}</span>
                      )}
                    </span>
                    {item.shortcut && (
                      <KeyCombo
                        keys={item.shortcut}
                        mode={item.shortcut.length > 1 ? 'sequence' : 'together'}
                        size="sm"
                        className="shrink-0"
                      />
                    )}
                    {selected && (
                      <CornerDownLeft className="size-4 shrink-0 text-accent" aria-hidden="true" />
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-2 text-xs text-muted"
        aria-hidden="true"
      >
        <span className="inline-flex items-center gap-1.5">
          <KeyCombo keys={['↑', '↓']} mode="either" size="sm" /> välj
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Kbd size="sm">Enter</Kbd> öppna
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Kbd size="sm">Esc</Kbd> stäng
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5">
          <Kbd size="sm">?</Kbd> alla kortkommandon
        </span>
      </div>
    </>
  );
}

/**
 * Kommandopaletten (Ctrl/Cmd+K): search across views, actions, modules, cases, glossary terms
 * and lagrum. Mounted once in the root layout; opened through the palette store.
 */
export function CommandPalette() {
  const open = usePaletteStore((s) => s.open);
  const focusAfterClose = useRef<ActionOutcome['focus']>('restore');
  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (next) focusAfterClose.current = 'restore';
        setPaletteOpen(next);
      }}
    >
      <DialogPrimitive.Portal>
        <DialogOverlay className="bg-ink/30" />
        <DialogPrimitive.Content
          data-testid="command-palette"
          onCloseAutoFocus={(event) => {
            const focus = focusAfterClose.current;
            focusAfterClose.current = 'restore';
            if (focus === 'restore') return;
            event.preventDefault();
            // After moving to another view the old focus target may be gone: start at the
            // main content instead, like after a page change. A dialog opened by the action
            // (the tutor, the shortcuts) keeps its own focus.
            const focusMain = () => document.getElementById('main')?.focus({ preventScroll: true });
            if (focus === 'main') {
              focusMain();
              return;
            }
            // If nothing took focus after all, do not leave it on <body>.
            window.requestAnimationFrame(() =>
              window.requestAnimationFrame(() => {
                if (!document.activeElement || document.activeElement === document.body) {
                  focusMain();
                }
              }),
            );
          }}
          className={cn(
            'fixed top-[12vh] left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 flex-col',
            'overflow-hidden rounded-lg border border-line bg-paper text-ink shadow-paper',
            'data-[state=open]:animate-[fade-in_var(--duration-fast)_var(--ease-out)]',
          )}
        >
          {open && (
            <PaletteBody
              onDone={(focus) => {
                focusAfterClose.current = focus;
              }}
            />
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
