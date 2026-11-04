/**
 * features/cases — Ärenden: the case list (/cases) and the case view (/cases/$caseId).
 * For Hem: `useOngoingCase()` gives the case to continue and the next one to start.
 */
export { useCaseStatuses, useCaseSummaries, useOngoingCase } from './hooks';
export type { CaseSummary, OngoingCaseInfo } from './hooks';
export { CASE_LIST_STATUS_LABELS, type CaseListStatus } from './case-model';
