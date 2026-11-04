import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { CaseFile } from '@bygglov/content-schema';
import { loadContent } from '@/content';
import {
  dataKeys,
  getDataStore,
  type CaseStatus,
  type Decision,
  type SupervisorFeedback,
} from '@/data';
import {
  caseProgress,
  listStatusOf,
  propertyName,
  storedState,
  type CaseListStatus,
} from './case-model';

/** Query keys under `dataKeys.all`, so every data write refreshes them. */
export const caseKeys = {
  statuses: () => [...dataKeys.all, 'cases', 'statuses'] as const,
  decisions: () => [...dataKeys.all, 'cases', 'decisions'] as const,
};

/** Every started case's status row (with the stored engine state). */
export function useCaseStatuses() {
  return useQuery({
    queryKey: caseKeys.statuses(),
    queryFn: async (): Promise<CaseStatus[]> => (await getDataStore()).cases.listCaseStatuses(),
  });
}

export interface CaseSummary {
  caseId: string;
  /** "Tillbyggnad av enbostadshus, Björken 7". */
  title: string;
  fastighet: string;
  niva: CaseFile['niva'];
  status: CaseListStatus;
  /** Simulated date, null for a case that is not started. */
  simDate: string | null;
  /** Rubrik of the current step; null when every step is done or not started. */
  currentStepTitle: string | null;
  stepsDone: number;
  stepsTotal: number;
}

function summaryOf(caseFile: CaseFile, row: CaseStatus | null): CaseSummary {
  const state = storedState(caseFile, row);
  const progress = state ? caseProgress(caseFile, state) : null;
  return {
    caseId: caseFile.id,
    title: `${caseFile.titel}, ${propertyName(caseFile)}`,
    fastighet: caseFile.fastighet,
    niva: caseFile.niva,
    status: listStatusOf(row),
    simDate: state?.simDate ?? row?.simDate ?? null,
    currentStepTitle: progress?.currentStepTitle ?? null,
    stepsDone: progress?.done ?? 0,
    stepsTotal: progress?.total ?? caseFile.steg.length,
  };
}

/** Summaries of all bundled cases with their status, in content order. */
export function useCaseSummaries(cases: readonly CaseFile[] = loadContent().cases) {
  const statuses = useCaseStatuses();
  const summaries = useMemo(() => {
    const rows = new Map((statuses.data ?? []).map((r) => [r.caseId, r]));
    return cases.map((c) => summaryOf(c, rows.get(c.id) ?? null));
  }, [cases, statuses.data]);
  return { summaries, isLoading: statuses.isLoading, error: statuses.error };
}

export interface OngoingCaseInfo {
  /** The most recently started case that is still in progress, or null. */
  ongoing: CaseSummary | null;
  /** The first case not started yet (lowest level first), for "Nytt ärende". */
  nextCase: CaseSummary | null;
  isLoading: boolean;
}

/**
 * For Hem: "Fortsätt ärende …" links to `ongoing` (route `/cases/$caseId` with
 * `params: { caseId: ongoing.caseId }`), "Nytt ärende" to `nextCase`.
 */
export function useOngoingCase(cases: readonly CaseFile[] = loadContent().cases): OngoingCaseInfo {
  const statuses = useCaseStatuses();
  return useMemo(() => {
    const rows = statuses.data ?? [];
    const byId = new Map(cases.map((c) => [c.id, c]));
    const inProgress = rows
      .filter((r) => r.status === 'in_progress' && byId.has(r.caseId))
      .sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0));
    const latest = inProgress[0];
    const latestCase = latest ? byId.get(latest.caseId) : undefined;
    const started = new Set(rows.map((r) => r.caseId));
    const next = [...cases]
      .filter((c) => !started.has(c.id))
      .sort((a, b) => a.niva - b.niva || a.id.localeCompare(b.id))[0];
    return {
      ongoing: latest && latestCase ? summaryOf(latestCase, latest) : null,
      nextCase: next ? summaryOf(next, null) : null,
      isLoading: statuses.isLoading,
    };
  }, [cases, statuses.data, statuses.isLoading]);
}

export interface DecisionWithFeedback {
  caseFile: CaseFile;
  decision: Decision;
  /** Registered supervisor feedback, oldest first. */
  feedback: SupervisorFeedback[];
}

/** Every submitted decision in every bundled case, newest first, with supervisor feedback. */
export function useSubmittedDecisions(cases: readonly CaseFile[] = loadContent().cases) {
  return useQuery({
    queryKey: [...caseKeys.decisions(), cases.map((c) => c.id).join(',')],
    queryFn: async (): Promise<DecisionWithFeedback[]> => {
      const store = await getDataStore();
      const perCase = await Promise.all(
        cases.map(async (caseFile) => {
          const decisions = await store.cases.listDecisions(caseFile.id);
          return Promise.all(
            decisions.map(async (decision) => ({
              caseFile,
              decision,
              feedback: await store.cases.listSupervisorFeedback(decision.id),
            })),
          );
        }),
      );
      return perCase
        .flat()
        .sort((a, b) =>
          a.decision.submittedAt < b.decision.submittedAt
            ? 1
            : a.decision.submittedAt > b.decision.submittedAt
              ? -1
              : b.decision.id - a.decision.id,
        );
    },
  });
}
