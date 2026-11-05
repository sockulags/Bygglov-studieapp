import { useQuery } from '@tanstack/react-query';
import { dataKeys, getDataStore, type AiUsageTotals, type DataStore } from '@/data';
import { formatSekLimit } from './pricing';

/**
 * Usage figures and the daily cost cap. "Today" and "this month" follow the computer's
 * local time, so the cap resets at local midnight.
 */

export function startOfLocalDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function startOfNextLocalDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
}

export function startOfLocalMonth(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export interface DailyCapStatus {
  spentSek: number;
  capSek: number;
  remainingSek: number;
  reached: boolean;
}

/** Whether today's spending has reached the cap (a cap of 0 blocks every question). */
export function dailyCapStatus(spentSek: number, capSek: number): DailyCapStatus {
  return {
    spentSek,
    capSek,
    remainingSek: Math.max(0, capSek - spentSek),
    reached: spentSek >= capSek,
  };
}

/** Swedish message shown in the panel when the cap is reached. */
export function capReachedMessage(capSek: number): string {
  return `Dagens kostnadstak på ${formatSekLimit(capSek)} är nått, så handledaren tar inte emot fler frågor i dag. Taket nollställs vid midnatt. Du kan ändra det under Inställningar → Studiehjälp.`;
}

/** Cost so far today (local time). */
export async function spentToday(store: DataStore, now: Date = new Date()): Promise<number> {
  const totals = await store.aiUsage.totals({
    from: startOfLocalDay(now),
    to: startOfNextLocalDay(now),
  });
  return totals.costSek;
}

export interface UsageSummary {
  today: AiUsageTotals;
  month: AiUsageTotals;
  total: AiUsageTotals;
}

export async function loadUsageSummary(
  store: DataStore,
  now: Date = new Date(),
): Promise<UsageSummary> {
  const [today, month, total] = await Promise.all([
    store.aiUsage.totals({ from: startOfLocalDay(now), to: startOfNextLocalDay(now) }),
    store.aiUsage.totals({ from: startOfLocalMonth(now) }),
    store.aiUsage.totals(),
  ]);
  return { today, month, total };
}

/** Query keys under `dataKeys.all`, so clearing or importing data refreshes them. */
export const usageKeys = {
  all: () => [...dataKeys.all, 'ai-usage'] as const,
  summary: () => [...usageKeys.all(), 'summary'] as const,
};

export function useUsageSummary() {
  return useQuery({
    queryKey: usageKeys.summary(),
    queryFn: async () => loadUsageSummary(await getDataStore()),
  });
}
