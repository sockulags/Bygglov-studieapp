// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { setCaseReturn, syncCaseReturn, useCaseReturnStore } from './case-return';

const a001 = { caseId: 'A001', label: 'A001 · Komplementbyggnad nära gräns' };

describe('case return', () => {
  beforeEach(() => useCaseReturnStore.setState({ caseReturn: null }));

  it('keeps the way back while moving between the case and Uppslag', () => {
    setCaseReturn(a001);
    syncCaseReturn('/lookup');
    syncCaseReturn('/cases/A001');
    syncCaseReturn('/lookup');
    expect(useCaseReturnStore.getState().caseReturn).toEqual(a001);
  });

  it('forgets it on any other page', () => {
    for (const path of ['/', '/cases', '/study', '/results', '/settings']) {
      setCaseReturn(a001);
      syncCaseReturn(path);
      expect(useCaseReturnStore.getState().caseReturn).toBeNull();
    }
  });
});
