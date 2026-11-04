import { useQuery } from '@tanstack/react-query';
import { loadContent } from '@/content';
import { dataKeys, getDataStore } from '@/data';
import { readStoredResult, type StoredSessionResult } from '@/features/study/session-result';
import {
  computeStreak,
  moduleProgress,
  nextReviewDate,
  type ModuleProgress,
  type Streak,
} from './progress';
import type { Session } from '@/data';

export interface StudyOverview {
  modules: ModuleProgress[];
  /** Questions due for repetition now (that still exist in the content). */
  due: number;
  /** Earliest scheduled repetition, null when nothing is scheduled. */
  nextReview: Date | null;
}

const EMPTY_OVERVIEW: StudyOverview = { modules: [], due: 0, nextReview: null };

/** Mastery and repetition status per module, recomputed whenever data changes. */
export function useStudyOverview() {
  const query = useQuery({
    queryKey: [...dataKeys.reviews(), 'overview'],
    queryFn: async (): Promise<StudyOverview> => {
      const content = loadContent();
      const states = await (await getDataStore()).reviews.listReviewStates();
      const modules = moduleProgress(content, states, new Date());
      const known = new Set(modules.map((m) => m.moduleId));
      return {
        modules,
        due: modules.reduce((sum, m) => sum + m.due, 0),
        nextReview: nextReviewDate(states.filter((s) => known.has(s.moduleId))),
      };
    },
  });
  return { ...query, overview: query.data ?? EMPTY_OVERVIEW };
}

export interface PassHistoryEntry {
  session: Session;
  result: StoredSessionResult | null;
}

export interface PassHistory {
  /** Newest first. */
  passes: PassHistoryEntry[];
  streak: Streak;
}

/** How many passes the streak looks back over; a year of daily passes is far below. */
const HISTORY_LIMIT = 1000;

/** Finished and unfinished passes with their stored results, plus the streak. */
export function usePassHistory() {
  const query = useQuery({
    queryKey: [...dataKeys.all, 'sessions', 'history'],
    queryFn: async (): Promise<PassHistory> => {
      const sessions = await (await getDataStore()).sessions.listRecent(HISTORY_LIMIT);
      return {
        passes: sessions.map((session) => ({ session, result: readStoredResult(session.result) })),
        streak: computeStreak(sessions, new Date()),
      };
    },
  });
  return {
    ...query,
    history: query.data ?? { passes: [], streak: { days: 0, studiedToday: false } },
  };
}
