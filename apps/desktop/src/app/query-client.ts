import { QueryClient } from '@tanstack/react-query';

/**
 * The app's single TanStack Query client. Exported so code outside React (the study
 * session store) can invalidate data queries after writing to the data store.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data is local (SQLite / bundled content); no need to refetch on focus.
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
});
