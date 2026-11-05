import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { LookupTarget } from '@/features/lookup/search';

/** How many recent picks are kept and shown first in an empty palette. */
export const RECENT_LIMIT = 5;

interface PaletteState {
  /** The command palette (Ctrl/Cmd+K). */
  open: boolean;
  /** The keyboard shortcuts dialog (?). */
  helpOpen: boolean;
  /** "Fråga handledaren" opened from the palette, with her general study status. */
  tutorOpen: boolean;
  /** Ids of recently chosen palette items, newest first. */
  recent: string[];
  /**
   * Where Uppslag should go once it is shown (a term, a lagrum). Set by the palette, consumed
   * by the Uppslag page, so the palette can open a part of a page that keeps its tab in state.
   */
  lookupRequest: LookupTarget | null;
}

export const PALETTE_STORAGE_KEY = 'bygglov-palette';

export const usePaletteStore = create<PaletteState>()(
  persist(
    (): PaletteState => ({
      open: false,
      helpOpen: false,
      tutorOpen: false,
      recent: [],
      lookupRequest: null,
    }),
    {
      name: PALETTE_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ recent: state.recent }),
    },
  ),
);

export function setPaletteOpen(open: boolean): void {
  usePaletteStore.setState({ open });
}

export function setShortcutsHelpOpen(helpOpen: boolean): void {
  usePaletteStore.setState({ helpOpen });
}

export function setPaletteTutorOpen(tutorOpen: boolean): void {
  usePaletteStore.setState({ tutorOpen });
}

/** Puts `id` first among the recent picks. */
export function rememberPick(id: string): void {
  usePaletteStore.setState((state) => ({
    recent: [id, ...state.recent.filter((r) => r !== id)].slice(0, RECENT_LIMIT),
  }));
}

/** Asks Uppslag to open `target` (see `lookupRequest`). */
export function requestLookup(target: LookupTarget): void {
  usePaletteStore.setState({ lookupRequest: target });
}

/** Returns the pending Uppslag target and clears it. */
export function takeLookupRequest(): LookupTarget | null {
  const target = usePaletteStore.getState().lookupRequest;
  if (target) usePaletteStore.setState({ lookupRequest: null });
  return target;
}
