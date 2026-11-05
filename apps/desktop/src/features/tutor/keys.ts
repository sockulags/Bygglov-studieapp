import { useQuery } from '@tanstack/react-query';
import { getTutorTransport } from './transport';

/** Query keys for the tutor's key state (the key itself never reaches JavaScript). */
export const tutorKeys = {
  all: ['tutor'] as const,
  hasKey: () => [...tutorKeys.all, 'has-key'] as const,
};

/** Whether an API key is stored (OS keyring in the app; the mock's flag in a browser). */
export function useHasTutorKey() {
  return useQuery({
    queryKey: tutorKeys.hasKey(),
    queryFn: () => getTutorTransport().hasKey(),
    // Changes only through Inställningar, which invalidates this query.
    staleTime: Infinity,
  });
}
