import type { DomainResult } from "~/lib/types";
import { DomainCard } from "./domain-card";

function summarize(results: readonly DomainResult[]): string {
  const done = results.filter((r) => r.check.status !== "checking").length;
  if (done < results.length) return `Checking ${results.length} domains…`;
  const available = results.filter(
    (r) => r.check.status === "done" && r.check.availability === "available",
  ).length;
  const failed = results.filter((r) => r.check.status === "error").length;
  const parts = [`${available} of ${results.length} available`];
  if (failed > 0) parts.push(`${failed} couldn't be checked`);
  return `${parts.join(", ")}.`;
}

export function ResultsGrid({ results }: { results: readonly DomainResult[] }) {
  if (results.length === 0) return null;

  return (
    <section
      aria-label="Results"
      className="mx-auto w-full max-w-4xl space-y-4"
    >
      <p aria-live="polite" className="text-body-sm text-rambutan-400">
        {summarize(results)}
      </p>
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {results.map((domain) => (
          <DomainCard key={domain.fullDomain} domain={domain} />
        ))}
      </ul>
    </section>
  );
}
