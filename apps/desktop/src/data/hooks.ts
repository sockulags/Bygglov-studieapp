import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ZodType } from 'zod';
import { getDataStore } from './store';
import type { DueReviewOptions, NewAnswer, ReviewState } from './types';

/** TanStack Query keys for everything read from the data store. Invalidate via `dataKeys.all`. */
export const dataKeys = {
  all: ['data'] as const,
  moduleStats: () => [...dataKeys.all, 'module-stats'] as const,
  reviews: () => [...dataKeys.all, 'reviews'] as const,
  dueReviews: (options: DueReviewOptions = {}) =>
    [
      ...dataKeys.reviews(),
      'due',
      { moduleIds: [...(options.moduleIds ?? [])].sort(), limit: options.limit ?? null },
    ] as const,
  settings: () => [...dataKeys.all, 'settings'] as const,
  setting: (key: string) => [...dataKeys.settings(), key] as const,
  recentSessions: (limit: number) => [...dataKeys.all, 'sessions', 'recent', limit] as const,
};

/** Answer statistics per module (Resultat, startsidan). */
export function useModuleStats() {
  return useQuery({
    queryKey: dataKeys.moduleStats(),
    queryFn: async () => (await getDataStore()).answers.statsPerModule(),
  });
}

/** Questions due for repetition now, optionally limited to selected modules. */
export function useDueReviews(options: DueReviewOptions = {}) {
  return useQuery({
    queryKey: dataKeys.dueReviews(options),
    queryFn: async (): Promise<ReviewState[]> => (await getDataStore()).reviews.getDue(new Date(), options),
  });
}

export function useRecentSessions(limit = 20) {
  return useQuery({
    queryKey: dataKeys.recentSessions(limit),
    queryFn: async () => (await getDataStore()).sessions.listRecent(limit),
  });
}

/** Records an answer and refreshes the statistics that depend on it. */
export function useRecordAnswer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewAnswer) => (await getDataStore()).answers.recordAnswer(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: dataKeys.moduleStats() }),
  });
}

export interface UseSettingResult<T> {
  /** Stored value if it matches the schema, otherwise the default. */
  value: T;
  isLoading: boolean;
  error: Error | null;
  setValue: (value: T) => Promise<void>;
  isSaving: boolean;
}

/**
 * A persisted setting. The stored JSON is validated with `schema`; a missing or invalid
 * value (for example after a format change) falls back to `defaultValue`.
 */
export function useSetting<T>(key: string, schema: ZodType<T>, defaultValue: T): UseSettingResult<T> {
  const queryClient = useQueryClient();
  const queryKey = dataKeys.setting(key);

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<T> => {
      const stored = await (await getDataStore()).settings.get(key);
      if (stored === undefined) return defaultValue;
      const parsed = schema.safeParse(stored);
      return parsed.success ? parsed.data : defaultValue;
    },
  });

  const mutation = useMutation({
    mutationFn: async (value: T) => {
      await (await getDataStore()).settings.set(key, schema.parse(value));
      return value;
    },
    onSuccess: (value) => queryClient.setQueryData(queryKey, value),
  });

  return {
    value: query.data ?? defaultValue,
    isLoading: query.isLoading,
    error: query.error ?? mutation.error ?? null,
    setValue: async (value: T) => {
      await mutation.mutateAsync(value);
    },
    isSaving: mutation.isPending,
  };
}
