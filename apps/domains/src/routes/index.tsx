import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ResultsGrid } from "~/components/results-grid";
import { SearchInput } from "~/components/search-input";
import { useDebouncedValue } from "~/hooks/useDebouncedValue";
import { useDomainSearch } from "~/hooks/useDomainSearch";
import { parseQuery } from "~/lib/query";

export const Route = createFileRoute("/")({
  component: Home,
});

const SEARCH_DELAY_MS = 500;

function Home() {
  const [input, setInput] = useState("");
  // Parse what's typed now for feedback; search what was typed before the pause.
  const parsed = parseQuery(input);
  const settled = parseQuery(useDebouncedValue(input, SEARCH_DELAY_MS));
  // Clearing the field clears the results at once, without waiting for the delay.
  const query =
    parsed.kind !== "empty" && settled.kind === "ok" ? settled.query : null;
  const results = useDomainSearch(query);

  return (
    <main className="mx-auto min-h-screen max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <div className="space-y-4 text-center">
        <h1 className="text-h1 text-rambutan-100 text-balance">
          Domain Search
        </h1>
        <SearchInput value={input} onChange={setInput} parsed={parsed} />
      </div>
      <ResultsGrid results={results} />
    </main>
  );
}
