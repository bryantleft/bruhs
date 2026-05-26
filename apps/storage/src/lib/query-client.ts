import { QueryClient } from "@tanstack/react-query";

// Create a query client with optimized settings for domain searches
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Domains don't change frequently, so cache for a while
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
      retry: (failureCount, error) => {
        // Don't retry on certain errors
        if (error && typeof error === "object" && "code" in error) {
          const apiError = error as { code: string };
          if (["NO_API_KEY", "RATE_LIMIT"].includes(apiError.code)) {
            return false;
          }
        }
        return failureCount < 2;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      retry: false, // Don't retry mutations automatically
    },
  },
});
