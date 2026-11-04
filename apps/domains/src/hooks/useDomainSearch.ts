import { useQueries } from "@tanstack/react-query";
import { checkDomainAvailability } from "~/lib/domain-checker";
import type { DomainResult, DomainSearchQuery } from "~/lib/types";

/**
 * Check every name+TLD pair of `query`, one cached query per domain. Results arrive
 * independently; a superseded search's lookups are aborted when its queries go unused.
 */
export function useDomainSearch(
  query: DomainSearchQuery | null,
): DomainResult[] {
  const domains =
    query?.tlds.map((tld) => ({
      name: query.name,
      tld,
      fullDomain: `${query.name}${tld}`,
    })) ?? [];

  const checks = useQueries({
    queries: domains.map(({ fullDomain }) => ({
      queryKey: ["domain", fullDomain],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        checkDomainAvailability(fullDomain, signal),
    })),
  });

  return domains.map((domain, i): DomainResult => {
    const check = checks[i];
    if (check?.isSuccess) {
      return { ...domain, check: { status: "done", availability: check.data } };
    }
    if (check?.isError) {
      return {
        ...domain,
        check: { status: "error", message: check.error.message },
      };
    }
    return { ...domain, check: { status: "checking" } };
  });
}
