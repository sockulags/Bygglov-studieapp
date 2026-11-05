import { useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useRef } from 'react';
import { useOngoingCase } from '@/features/cases';
import { usePassHistory, useStudyOverview } from '@/features/progress/hooks';
import {
  buildGeneralContext,
  GENERAL_SUGGESTIONS,
  TutorPanel,
  useHasTutorKey,
} from '@/features/tutor';
import { setPaletteTutorOpen, usePaletteStore } from './palette-store';

function OpenTutor() {
  const navigate = useNavigate();
  const hasKey = useHasTutorKey();
  const { overview } = useStudyOverview();
  const { history } = usePassHistory();
  const { ongoing } = useOngoingCase();
  // Opened from the palette, so there is no button to return to: go back to the page.
  const main = useRef<HTMLElement | null>(document.getElementById('main'));
  const context = useMemo(
    () =>
      buildGeneralContext({
        modules: overview.modules,
        streakDays: history.streak.days,
        ongoingCase: ongoing ? `${ongoing.caseId} ${ongoing.title}` : null,
      }),
    [overview.modules, history.streak.days, ongoing],
  );

  // Without a key the tutor cannot answer: show where it is switched on instead.
  const missingKey = hasKey.data === false;
  useEffect(() => {
    if (!missingKey) return;
    setPaletteTutorOpen(false);
    void navigate({ to: '/settings', hash: 'settings-assistant' });
  }, [missingKey, navigate]);

  if (hasKey.data !== true) return null;
  return (
    <TutorPanel
      context={context}
      suggestions={GENERAL_SUGGESTIONS}
      open
      returnFocusRef={main}
      onOpenChange={(open) => {
        if (!open) setPaletteTutorOpen(false);
      }}
    />
  );
}

/** "Fråga handledaren" from the command palette, with her general study status as context. */
export function GlobalTutor() {
  const open = usePaletteStore((s) => s.tutorOpen);
  return open ? <OpenTutor /> : null;
}
