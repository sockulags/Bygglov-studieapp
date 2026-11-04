import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { useDueReviews, useModuleStats, useRecordAnswer, useSetting } from '../hooks';
import { createMemoryDataStore } from '../memory-store';
import { getDataStore, setDataStore } from '../store';
import type { DataStore } from '../types';

let store: DataStore;

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  store = createMemoryDataStore();
  setDataStore(store);
});
afterEach(() => setDataStore(null));

describe('getDataStore', () => {
  it('falls back to the in-memory store outside Tauri and reuses it', async () => {
    setDataStore(null);
    const a = await getDataStore();
    expect(a.kind).toBe('memory');
    expect(await getDataStore()).toBe(a);
  });
});

describe('hooks', () => {
  it('useModuleStats reads stats and refreshes after useRecordAnswer', async () => {
    const w = makeWrapper();
    const stats = renderHook(() => useModuleStats(), { wrapper: w });
    const record = renderHook(() => useRecordAnswer(), { wrapper: w });
    await waitFor(() => expect(stats.result.current.data).toEqual([]));

    await act(() =>
      record.result.current.mutateAsync({
        questionId: 'lov-001',
        moduleId: '03-lovplikt',
        correct: true,
        answer: 2,
        mode: 'quick-quiz',
      }),
    );
    await waitFor(() =>
      expect(stats.result.current.data?.[0]).toMatchObject({
        moduleId: '03-lovplikt',
        answered: 1,
      }),
    );
  });

  it('useDueReviews returns due questions for the selected modules', async () => {
    const base = {
      due: '2020-01-01T00:00:00.000Z',
      stability: 1,
      difficulty: 5,
      elapsedDays: 0,
      scheduledDays: 0,
      learningSteps: 0,
      reps: 1,
      lapses: 0,
      state: 1,
      lastReview: null,
    };
    await store.reviews.upsertReviewState({ ...base, questionId: 'a', moduleId: '03-lovplikt' });
    await store.reviews.upsertReviewState({ ...base, questionId: 'b', moduleId: '04-detaljplan' });
    await store.reviews.upsertReviewState({
      ...base,
      questionId: 'c',
      moduleId: '03-lovplikt',
      due: '2999-01-01T00:00:00.000Z',
    });

    const { result } = renderHook(() => useDueReviews({ moduleIds: ['03-lovplikt'] }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.data?.map((r) => r.questionId)).toEqual(['a']));
  });

  it('useSetting returns the default, persists a new value and ignores invalid stored data', async () => {
    const schema = z.object({ antal: z.number().int().min(1) });
    const { result } = renderHook(() => useSetting('snabbquiz', schema, { antal: 10 }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.value).toEqual({ antal: 10 });

    await act(() => result.current.setValue({ antal: 15 }));
    await waitFor(() => expect(result.current.value).toEqual({ antal: 15 }));
    expect(await store.settings.get('snabbquiz')).toEqual({ antal: 15 });

    await store.settings.set('trasig', { antal: 'många' });
    const broken = renderHook(() => useSetting('trasig', schema, { antal: 5 }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(broken.result.current.isLoading).toBe(false));
    expect(broken.result.current.value).toEqual({ antal: 5 });
  });
});
