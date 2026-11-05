import { useNavigate } from '@tanstack/react-router';
import { useEffect, useEffectEvent, useState } from 'react';
import { isTypingTarget } from '@/lib/use-keydown';
import { usePaletteStore } from './palette-store';
import { createSequenceTracker } from './shortcuts';

/** Element that "/" focuses, when the current view has one (e.g. the search in Uppslag). */
export const SEARCH_SHORTCUT_SELECTOR = '[aria-keyshortcuts~="/"]';

/** True while a modal dialog (Radix) is open; it owns the keyboard then. */
function otherDialogOpen(): boolean {
  return (
    document.querySelector(
      '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
    ) !== null
  );
}

function isModK(event: KeyboardEvent): boolean {
  return (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k';
}

/**
 * Global keyboard shortcuts (docs/tangentbord.md):
 *
 * - Ctrl/Cmd+K opens or closes the command palette, also from a text field.
 * - "g" followed by h/p/ä/u/r/i goes to a view.
 * - "/" focuses the view's search field, or opens the palette where there is none.
 * - "?" opens the shortcuts dialog, unless the view has its own help (quiz, case view),
 *   which then wins: views call `preventDefault`, and this hook only acts afterwards.
 *
 * Single keys are ignored in text fields, with Ctrl/Cmd/Alt held and while a dialog is open,
 * so they never get in the way of typing or of the quiz's 1–9/Enter and the case view's M.
 */
export function useGlobalShortcuts(): void {
  const navigate = useNavigate();

  const onCapture = useEffectEvent((event: KeyboardEvent) => {
    if (!isModK(event) || event.repeat) return;
    const state = usePaletteStore.getState();
    if (state.open) {
      event.preventDefault();
      usePaletteStore.setState({ open: false });
      return;
    }
    // A modal of the view (a step box, the tutor, the decision form) owns the keyboard,
    // except the shortcuts dialog, which the palette may replace.
    if (state.helpOpen) {
      event.preventDefault();
      usePaletteStore.setState({ helpOpen: false, open: true });
      return;
    }
    if (otherDialogOpen()) return;
    event.preventDefault();
    usePaletteStore.setState({ open: true });
  });

  const [tracker] = useState(createSequenceTracker);

  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      tracker.reset();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
    if (isTypingTarget(event.target)) return;
    const state = usePaletteStore.getState();

    if (event.key === '?') {
      if (state.helpOpen) {
        event.preventDefault();
        usePaletteStore.setState({ helpOpen: false });
        return;
      }
      if (otherDialogOpen() || event.defaultPrevented) return;
      // Let a view's own "?" handler run first (it may be registered after this one).
      window.setTimeout(() => {
        if (!event.defaultPrevented && !otherDialogOpen()) {
          usePaletteStore.setState({ helpOpen: true });
        }
      }, 0);
      return;
    }

    if (otherDialogOpen() || event.defaultPrevented) {
      tracker.reset();
      return;
    }

    if (event.key === '/') {
      event.preventDefault();
      tracker.reset();
      const search = document.querySelector<HTMLElement>(SEARCH_SHORTCUT_SELECTOR);
      if (search && search.closest('[hidden]') === null) {
        search.focus();
        if (search instanceof HTMLInputElement) search.select();
      } else {
        usePaletteStore.setState({ open: true });
      }
      return;
    }

    const result = tracker.press(event.key, event.timeStamp || performance.now());
    if (result.kind === 'navigate') {
      event.preventDefault();
      void navigate({ to: result.item.to });
    }
  });

  useEffect(() => {
    const capture = (event: KeyboardEvent) => onCapture(event);
    const bubble = (event: KeyboardEvent) => onKey(event);
    window.addEventListener('keydown', capture, { capture: true });
    window.addEventListener('keydown', bubble);
    return () => {
      window.removeEventListener('keydown', capture, { capture: true });
      window.removeEventListener('keydown', bubble);
    };
  }, []);
}
