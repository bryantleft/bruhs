import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Registrations rarely change within a session; repeat searches use the cache.
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      // One retry smooths over a dropped request without leaving cards spinning.
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
