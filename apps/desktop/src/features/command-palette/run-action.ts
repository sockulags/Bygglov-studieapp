import { useNavigate } from '@tanstack/react-router';
import { EmptySessionError } from '@/engine';
import { startStudyRun } from '@/features/study/study-store';
import { checkForUpdatesManually } from '@/features/updates';
import { useUiStore } from '@/store/ui';
import type { PaletteAction } from './palette-items';
import { requestLookup, setPaletteTutorOpen, setShortcutsHelpOpen } from './palette-store';

export interface ActionOutcome {
  /**
   * Where focus goes when the palette closes: the main content after a page change; `keep`
   * when the target takes focus itself (a dialog, a revealed term); else back where it was.
   */
  focus: 'main' | 'keep' | 'restore';
  /** Swedish message when the action could not be done (e.g. nothing to repeat). */
  error: string | null;
}

/** Runs palette actions. Returns a function that resolves when the action is done. */
export function useRunPaletteAction(): (action: PaletteAction) => Promise<ActionOutcome> {
  const navigate = useNavigate();
  return async (action) => {
    const done: ActionOutcome = { focus: 'restore', error: null };
    const moved: ActionOutcome = { focus: 'main', error: null };
    const dialog: ActionOutcome = { focus: 'keep', error: null };
    switch (action.type) {
      case 'navigate':
        await navigate({ to: action.to, ...(action.hash ? { hash: action.hash } : {}) });
        return moved;
      case 'study-mode':
        await navigate({ to: '/study', search: { mode: action.mode } });
        return moved;
      case 'case':
        await navigate({ to: '/cases/$caseId', params: { caseId: action.caseId } });
        return moved;
      case 'lookup':
        requestLookup(action.target);
        await navigate({ to: '/lookup' });
        // Uppslag moves focus to the term or section itself.
        return dialog;
      case 'start':
        try {
          await startStudyRun(action.request);
        } catch (error: unknown) {
          return {
            focus: 'restore',
            error:
              error instanceof EmptySessionError
                ? error.message
                : 'Det gick inte att starta passet. Försök igen.',
          };
        }
        await navigate({ to: '/study/session' });
        return moved;
      case 'theme':
        useUiStore.getState().setTheme(action.theme);
        return done;
      case 'check-updates':
        // The result shows under Inställningar → Uppdateringar.
        await navigate({ to: '/settings', hash: 'settings-updates' });
        void checkForUpdatesManually();
        return moved;
      case 'tutor':
        setPaletteTutorOpen(true);
        return dialog;
      case 'shortcuts':
        setShortcutsHelpOpen(true);
        return dialog;
      case 'toggle-sidebar':
        useUiStore.getState().toggleSidebar();
        return done;
    }
  };
}
