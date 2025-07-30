import type { ResultsGridProps } from "~/lib/types";
import { DomainCard } from "./domain-card";

export function ResultsGrid({
  results = [],
  isLoading = false,
  emptyStateMessage = "No domains found.",
}: ResultsGridProps) {
  if (isLoading && results.length === 0) {
    return (
      <div className="mx-auto w-full max-w-4xl">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, () => (
            <div
              key={crypto.randomUUID()}
              className="flex h-12 animate-pulse items-center rounded-xl border border-longan-700 bg-longan-800 px-4"
            >
              <div className="h-4 w-full rounded bg-longan-600" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      {results.length === 0 ? (
        <div className="py-8 text-center">
          <div className="text-rambutan-400">
            {emptyStateMessage || "No results found"}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {results.map((domain, index) => (
            <DomainCard key={`${domain.fullDomain}-${index}`} domain={domain} />
          ))}
        </div>
      )}
    </div>
  );
}
