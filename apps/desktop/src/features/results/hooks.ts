import { useMemo } from 'react';
import { loadContent } from '@/content';
import { useAnswerHistory } from '@/data';
import { useCaseStatuses, useCaseSummaries, useSubmittedDecisions } from '@/features/cases';
import { storedState } from '@/features/cases/case-model';
import { usePassHistory, useStudyOverview } from '@/features/progress/hooks';
import { localDateKey, overallMastery } from '@/features/progress/progress';
import {
  answersPerBucket,
  casesPerStatus,
  decisionChecks,
  earliest,
  heroStats,
  masteryTimeline,
  resultsContent,
  studiedModules,
  weakTagsInWindow,
  windowDays,
  type CaseDecisionSource,
  type ResultsFilter,
} from './aggregate';

/**
 * Everything Mina resultat shows, computed from the data hooks and scoped by the filter.
 * The hero numbers are not filtered (they sit above the filter row).
 */
export function useResultsData(filter: ResultsFilter, now: Date) {
  const content = useMemo(() => loadContent(), []);
  const results = useMemo(() => resultsContent(content), [content]);
  const answersQuery = useAnswerHistory();
  const { overview } = useStudyOverview();
  const { history } = usePassHistory();
  const { summaries } = useCaseSummaries(content.cases);
  const statuses = useCaseStatuses();
  const decisions = useSubmittedDecisions(content.cases);
  const today = localDateKey(now);

  const answers = useMemo(() => answersQuery.data ?? [], [answersQuery.data]);
  const modules = useMemo(() => studiedModules(answers, results), [answers, results]);

  const sources = useMemo((): CaseDecisionSource[] => {
    const byCase = new Map(content.cases.map((c) => [c.id, c]));
    const submitted = [...(decisions.data ?? [])].sort((a, b) =>
      a.decision.submittedAt < b.decision.submittedAt ? -1 : 1,
    );
    return (statuses.data ?? []).flatMap((row) => {
      const caseFile = byCase.get(row.caseId);
      const state = caseFile ? storedState(caseFile, row) : null;
      if (!caseFile || !state || state.decisions.length === 0) return [];
      return [
        {
          caseId: row.caseId,
          title: `${caseFile.id} ${caseFile.titel}`,
          decisions: state.decisions,
          submittedAt: submitted
            .filter((d) => d.caseFile.id === row.caseId)
            .map((d) => d.decision.submittedAt),
        },
      ];
    });
  }, [content.cases, decisions.data, statuses.data]);

  const firstActivity = useMemo(
    () =>
      earliest([
        ...answers.map((a) => a.answeredAt),
        ...(decisions.data ?? []).map((d) => d.decision.submittedAt),
      ]),
    [answers, decisions.data],
  );

  const derived = useMemo(() => {
    const date = new Date(`${today}T12:00:00`);
    const days = windowDays(filter.range, date, firstActivity);
    // Replay once over the longest window needed (the filter's, and four weeks for the
    // hero delta), then slice.
    const longest = days.length >= 29 ? days : windowDays('allt', date, firstActivity);
    const shown = modules.filter((m) =>
      filter.moduleId === null ? m.slot !== null : m.moduleId === filter.moduleId,
    );
    const timeline = masteryTimeline(answers, results, longest, shown);
    const offset = longest.length - days.length;
    const series = timeline.series.map((s) => ({ ...s, points: s.points.slice(offset) }));
    const bars = answersPerBucket(answers, days, filter.moduleId);
    const tags = weakTagsInWindow(answers, results, days, filter.moduleId);
    const checks = decisionChecks(sources, days);
    const hero = heroStats(answers, timeline.overall, date);
    return { days, series, bars, tags, checks, hero };
  }, [answers, filter.moduleId, filter.range, firstActivity, modules, results, sources, today]);

  const withQuestions = overview.modules.filter((m) => m.questionCount > 0);
  return {
    isLoading: answersQuery.isLoading,
    isRefreshing: answersQuery.isFetching && !answersQuery.isLoading,
    modules,
    moduleOptions: results.modules,
    hiddenModules: filter.moduleId === null ? modules.filter((m) => m.slot === null).length : 0,
    ...derived,
    hero: {
      ...derived.hero,
      streak: history.streak,
      mastery: overallMastery(withQuestions),
    },
    caseCounts: casesPerStatus(summaries.map((s) => s.status)),
    hasAnswers: answers.length > 0,
  };
}
