import { useMutation } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { searchDomains } from "~/lib/domain-checker";
import type {
  DomainInfo,
  DomainSearchHookResult,
  DomainSearchQuery,
  DomainSearchResponse,
  DomainSearchState,
} from "~/lib/types";

export function useDomainSearch(): DomainSearchHookResult {
  const [results, setResults] = useState<DomainInfo[]>([]);
  const [state, setState] = useState<DomainSearchState>("idle");

  // TanStack Query mutation for domain search
  const mutation = useMutation({
    mutationFn: async (
      query: DomainSearchQuery,
    ): Promise<DomainSearchResponse> => {
      // Progress callback to update results as they arrive
      const onProgress = (result: DomainInfo) => {
        setResults((prev) => {
          // Replace the placeholder with the actual result
          return prev.map((r) =>
            r.fullDomain === result.fullDomain ? result : r,
          );
        });
      };

      return searchDomains(query, onProgress);
    },
    onMutate: () => {
      setState("searching");
    },
    onSuccess: () => {
      setState("success");
    },
    onError: (error) => {
      console.error("Domain search failed:", error);
      setState("error");
    },
  });

  // Search function
  const search = useCallback(
    async (query: DomainSearchQuery) => {
      // Validate query
      if (!query.domains.length || !query.tlds.length) {
        console.warn("Invalid search query: domains and TLDs are required");
        return;
      }

      // Clear previous results and create placeholders
      const placeholders: DomainInfo[] = [];

      for (const domainName of query.domains) {
        for (const tld of query.tlds) {
          placeholders.push({
            domain: domainName,
            tld,
            fullDomain: `${domainName}${tld}`,
            status: "unknown",
          });
        }
      }

      setResults(placeholders);

      // Execute search
      await mutation.mutateAsync(query);
    },
    [mutation],
  );

  // Clear results function
  const clearResults = useCallback(() => {
    setResults([]);
    setState("idle");
    mutation.reset();
  }, [mutation]);

  return {
    search,
    results,
    isLoading: mutation.isPending,
    error: mutation.error as Error | null,
    state,
    clearResults,
  };
}
