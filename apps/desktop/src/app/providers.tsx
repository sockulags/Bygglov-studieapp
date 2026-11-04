import { QueryClientProvider } from '@tanstack/react-query';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { useEffect, type ReactNode } from 'react';
import { queryClient } from '@/app/query-client';
import { applyUiPreferences, useUiStore } from '@/store/ui';

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
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipPrimitive.Provider delayDuration={300}>
        <UiPreferencesSync />
        {children}
      </TooltipPrimitive.Provider>
    </QueryClientProvider>
  );
}
