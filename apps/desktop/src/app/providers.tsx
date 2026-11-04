import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { useEffect, useState, type ReactNode } from 'react';
import { applyUiPreferences, useUiStore } from '@/store/ui';

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Data is local (SQLite / bundled content); no need to refetch on focus.
        refetchOnWindowFocus: false,
        retry: 1,
        staleTime: 30_000,
      },
    },
  });
}

/** Keeps <html data-theme / data-text-size> in sync with the UI store. */
function UiPreferencesSync() {
  const theme = useUiStore((s) => s.theme);
  const textSize = useUiStore((s) => s.textSize);
  useEffect(() => {
    applyUiPreferences(theme, textSize);
  }, [theme, textSize]);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipPrimitive.Provider delayDuration={300}>
        <UiPreferencesSync />
        {children}
      </TooltipPrimitive.Provider>
    </QueryClientProvider>
  );
}
