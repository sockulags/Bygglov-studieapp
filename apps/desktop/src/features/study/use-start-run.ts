import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { EmptySessionError } from '@/engine';
import { startStudyRun, type StartRequest } from './study-store';

/** Starts a pass and opens the quiz view; keeps a Swedish message when nothing matched. */
export function useStartRun() {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const start = async (request: StartRequest) => {
    setPending(true);
    setMessage(null);
    try {
      await startStudyRun(request);
      await navigate({ to: '/study/session' });
    } catch (error: unknown) {
      setMessage(
        error instanceof EmptySessionError
          ? error.message
          : 'Det gick inte att starta passet. Försök igen.',
      );
    } finally {
      setPending(false);
    }
  };

  return { start, pending, message, clearMessage: () => setMessage(null) };
}
