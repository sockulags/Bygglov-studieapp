import { create } from 'zustand';

/** The case Uppslag offers to go back to, after leaving a case for a lagrum or a term. */
export interface CaseReturn {
  caseId: string;
  label: string;
}

interface CaseReturnState {
  caseReturn: CaseReturn | null;
}

export const useCaseReturnStore = create<CaseReturnState>()(() => ({ caseReturn: null }));

/** Called by the case view: Uppslag can link back to this case until another page is visited. */
export function setCaseReturn(caseReturn: CaseReturn): void {
  useCaseReturnStore.setState({ caseReturn });
}

/**
 * Keeps the way back only while the route is a case or Uppslag; any other page (the case
 * list, Hem, Plugga …) means the detour is over.
 */
export function syncCaseReturn(pathname: string): void {
  if (pathname === '/lookup' || pathname.startsWith('/cases/')) return;
  if (useCaseReturnStore.getState().caseReturn) useCaseReturnStore.setState({ caseReturn: null });
}
