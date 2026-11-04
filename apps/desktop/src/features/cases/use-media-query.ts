import { useCallback, useSyncExternalStore } from 'react';

/** Breakpoint below which the case view stacks its panels as tabs (docs/04). */
export const WIDE_QUERY = '(min-width: 1100px)';

/** Whether a CSS media query matches; false where matchMedia is missing (tests). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () =>
      typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false,
    () => false,
  );
}
