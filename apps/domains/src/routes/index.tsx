import { createFileRoute } from "@tanstack/react-router";
import { ResultsGrid } from "~/components/results-grid";
import { SearchInput } from "~/components/search-input";
import { useDomainSearch } from "~/hooks/useDomainSearch";
import type { DomainSearchQuery } from "~/lib/types";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const domainSearch = useDomainSearch();

  const handleSearch = (query: DomainSearchQuery) => {
    domainSearch.search(query);
  };

  return (
    <div className="min-h-screen bg-longan-950">
      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="space-y-8">
          {/* Hero Section */}
          <div className="text-center">
            <h2 className="mb-4 font-bold text-3xl text-lychee-100">
              Domain Search
            </h2>

            <SearchInput
              onSearch={handleSearch}
              onClear={domainSearch.clearResults}
            />
          </div>

          {/* Error Display */}
          {domainSearch.error && (
            <div className="rounded-xl border border-rambutan-700 bg-rambutan-900/20 p-4">
              <div className="flex items-start space-x-3">
                <div className="text-rambutan-400 text-xl">⚠️</div>
                <div className="space-y-1">
                  <h3 className="font-semibold text-rambutan-400">
                    Search Error
                  </h3>
                  <p className="text-rambutan-300 text-sm">
                    {domainSearch.error.message}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Results */}
          <ResultsGrid
            results={domainSearch.results}
            isLoading={domainSearch.isLoading}
          />
        </div>
      </main>
    </div>
  );
}
