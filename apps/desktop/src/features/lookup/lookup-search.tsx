import { BookOpen, Scale, Search, Workflow, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';
import {
  groupHits,
  searchLookup,
  type SearchIndex,
  type SearchKind,
  type LookupTarget,
} from './search';

/**
 * The search field of Uppslag: a combobox over terms, process maps and lagrum. "/" anywhere
 * on the page focuses it, arrow keys move through the hits, Enter opens one and Escape
 * clears the field.
 */

const KIND_ICON: Record<SearchKind, typeof BookOpen> = {
  begrepp: BookOpen,
  lagrum: Scale,
  process: Workflow,
};

/** True when a key press is typed into a field (so "/" should not steal it). */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

export function LookupSearch({
  index,
  onOpen,
  className,
}: {
  index: SearchIndex;
  onOpen: (target: LookupTarget) => void;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const groups = useMemo(() => groupHits(searchLookup(index, query)), [index, query]);
  const flat = groups.flatMap((g) => g.hits);
  const optionId = (i: number) => `${listId}-hit-${i}`;
  const showPanel = open && query.trim() !== '';

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTyping(event.target) || event.defaultPrevented) return;
      // A modal (e.g. a process step) owns the keyboard while it is open.
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const choose = (i: number) => {
    const hit = flat[i];
    if (!hit) return;
    setOpen(false);
    setQuery('');
    setActive(0);
    inputRef.current?.blur();
    onOpen(hit.doc.target);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((i) => (flat.length === 0 ? 0 : (i + 1) % flat.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActive((i) => (flat.length === 0 ? 0 : (i - 1 + flat.length) % flat.length));
    } else if (event.key === 'Enter') {
      if (showPanel && flat.length > 0) {
        event.preventDefault();
        choose(active);
      }
    } else if (event.key === 'Escape') {
      if (query !== '') {
        event.preventDefault();
        setQuery('');
        setActive(0);
      } else {
        inputRef.current?.blur();
      }
    }
  };

  // Index of each group's first hit in `flat`, for the option ids and the active hit.
  const offsets = groups.map((_, g) =>
    groups.slice(0, g).reduce((sum, group) => sum + group.hits.length, 0),
  );
  return (
    <div className={cn('relative w-full max-w-xl', className)}>
      <label htmlFor={`${listId}-input`} className="sr-only">
        Sök i Uppslag
      </label>
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
        aria-hidden="true"
      />
      <input
        ref={inputRef}
        id={`${listId}-input`}
        type="text"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showPanel && flat.length > 0 ? optionId(active) : undefined}
        aria-keyshortcuts="/"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        placeholder="Sök begrepp, lagrum eller process, t.ex. 9 kap 60 eller nockhöjd"
        className="h-11 w-full rounded-md border border-line-strong bg-paper pr-16 pl-9 text-[0.9375rem] shadow-paper placeholder:text-muted focus-visible:border-accent"
      />
      {query ? (
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            setQuery('');
            inputRef.current?.focus();
          }}
          className="absolute top-1/2 right-2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-sm text-muted hover:bg-accent-soft hover:text-ink"
          aria-label="Töm sökfältet"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      ) : (
        <kbd
          className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded-sm border border-line-strong bg-bg px-1.5 font-sans text-xs text-muted"
          aria-hidden="true"
        >
          /
        </kbd>
      )}

      <div
        id={listId}
        role="listbox"
        aria-label="Träffar"
        hidden={!showPanel}
        className="absolute top-full right-0 left-0 z-30 mt-1.5 max-h-[min(28rem,60vh)] overflow-y-auto rounded-md border border-line bg-paper p-1.5 shadow-paper"
      >
        {showPanel && flat.length === 0 && (
          <p className="px-3 py-2 text-sm text-muted">
            Inga träffar. Pröva ett kortare ord, eller kapitel och paragraf som <em>9 kap 4</em>.
          </p>
        )}
        {showPanel &&
          groups.map((group, g) => (
            <div key={group.kind} role="group" aria-label={group.label} className="py-1">
              <p
                className="px-3 pt-1 pb-1 text-xs font-semibold tracking-[0.08em] text-muted uppercase"
                aria-hidden="true"
              >
                {group.label}
                {group.total > group.hits.length && (
                  <span className="font-normal tracking-normal normal-case">
                    {' '}
                    · {group.hits.length} av {group.total}
                  </span>
                )}
              </p>
              {group.hits.map((hit, h) => {
                const i = (offsets[g] ?? 0) + h;
                const Icon = KIND_ICON[hit.doc.kind];
                return (
                  <div
                    key={hit.doc.id}
                    id={optionId(i)}
                    role="option"
                    aria-selected={i === active}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(i)}
                    className={cn(
                      'flex cursor-pointer items-start gap-2.5 rounded-sm px-3 py-2',
                      i === active && 'bg-accent-soft',
                    )}
                  >
                    <Icon className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
                    <span className="flex min-w-0 flex-col">
                      <span
                        className={cn(
                          'text-sm font-medium',
                          hit.doc.kind === 'lagrum' && 'font-serif',
                        )}
                      >
                        {hit.doc.title}
                      </span>
                      <span className="line-clamp-1 text-xs text-muted">{hit.doc.detail}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
      </div>
    </div>
  );
}
