import { createContext, useContext } from 'react';
import type { LookupTarget } from './search';

/**
 * Navigation inside Uppslag: any part (a related term, a lagrum chip in a process step, a
 * search hit) can open another part of the page.
 */
export interface LookupNav {
  open: (target: LookupTarget) => void;
}

export const LookupNavContext = createContext<LookupNav>({ open: () => {} });

export function useLookupNav(): LookupNav {
  return useContext(LookupNavContext);
}

/** Scrolls an element into view and flashes it, after the next paint (tabs may just have switched). */
export function revealElement(id: string): void {
  if (typeof window === 'undefined') return;
  window.requestAnimationFrame(() => {
    const element = document.getElementById(id);
    if (!element) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    element.scrollIntoView?.({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    element.focus({ preventScroll: true });
    element.dataset.flash = 'true';
    window.setTimeout(() => {
      delete element.dataset.flash;
    }, 1600);
  });
}

/** DOM id of a glossary term and of a law section, so they can be revealed. */
export const termElementId = (id: string) => `begrepp-${id}`;
export const sectionElementId = (key: string) =>
  `lagrum-${key.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
