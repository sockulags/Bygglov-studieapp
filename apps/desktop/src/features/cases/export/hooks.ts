import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dataKeys, getDataStore, type NewSupervisorFeedback } from '@/data';

/** Query keys for the export feature, under `dataKeys.all` so a global refresh covers them. */
export const exportKeys = {
  all: [...dataKeys.all, 'decision-export'] as const,
  decision: (decisionId: number) => [...exportKeys.all, 'decision', decisionId] as const,
  feedback: (decisionId: number) => [...exportKeys.all, 'feedback', decisionId] as const,
};

/** The stored decision row (for "exporterad senast"). */
export function useDecisionRow(decisionId: number) {
  return useQuery({
    queryKey: exportKeys.decision(decisionId),
    queryFn: async () => (await getDataStore()).cases.getDecision(decisionId),
  });
}

/** Registered supervisor feedback on one decision, oldest first. */
export function useSupervisorFeedback(decisionId: number) {
  return useQuery({
    queryKey: exportKeys.feedback(decisionId),
    queryFn: async () => (await getDataStore()).cases.listSupervisorFeedback(decisionId),
  });
}

export function useAddSupervisorFeedback(decisionId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<NewSupervisorFeedback, 'decisionId'>) =>
      (await getDataStore()).cases.addSupervisorFeedback({ ...input, decisionId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: exportKeys.feedback(decisionId) });
      // Case lists elsewhere may show feedback counts.
      await queryClient.invalidateQueries({ queryKey: dataKeys.all });
    },
  });
}
