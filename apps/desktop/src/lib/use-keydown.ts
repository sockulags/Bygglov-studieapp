import { useEffect, useEffectEvent } from 'react';

/** True when the key press belongs to a text field and must not trigger shortcuts. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/** True when Enter/Space on the target already activates it (buttons, links, summaries). */
export function isActivatableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.closest('button, a[href], summary, [role="button"], [role="radio"]') !== null;
}

/**
 * Global keyboard shortcuts while `enabled`. Presses inside text fields and with
 * Ctrl/Cmd/Alt held are ignored so normal typing and system shortcuts keep working.
 */
export function useKeydown(handler: (event: KeyboardEvent) => void, enabled = true): void {
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    if (isTypingTarget(event.target)) return;
    handler(event);
  });
  useEffect(() => {
    if (!enabled) return;
    const listener = (event: KeyboardEvent) => onKey(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [enabled]);
}
