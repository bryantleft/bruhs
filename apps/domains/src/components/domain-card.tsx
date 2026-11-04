import { AlertTriangle } from "lucide-react";
import type { DomainCheck, DomainResult } from "~/lib/types";

interface Presentation {
  label: string;
  border: string;
  name: string;
}

function present(check: DomainCheck): Presentation {
  switch (check.status) {
    case "checking":
      return {
        label: "Checking…",
        border: "border-longan-600",
        name: "text-rambutan-300",
      };
    case "error":
      return {
        label: "Couldn't check",
        border: "border-lychee-600",
        name: "text-lychee-300",
      };
    case "done":
      switch (check.availability) {
        case "available":
          return {
            label: "Available",
            border: "border-pandan-600",
            name: "text-rambutan-100",
          };
        case "premium":
          return {
            label: "Likely premium",
            border: "border-durian-600",
            name: "text-rambutan-100",
          };
        case "unavailable":
          return {
            label: "Taken",
            border: "border-longan-600",
            name: "text-rambutan-400 line-through",
          };
      }
  }
}

export function DomainCard({ domain }: { domain: DomainResult }) {
  const { check } = domain;
  const { label, border, name } = present(check);

  return (
    <li
      className={`rounded-lychee bg-longan-800 flex h-12 items-center justify-between gap-3 border-[1.5px] px-4 transition-colors ${border}`}
      title={check.status === "error" ? check.message : undefined}
    >
      <span className={`flex min-w-0 text-base font-semibold ${name}`}>
        <span className="truncate">{domain.name}</span>
        <span className="shrink-0">{domain.tld}</span>
      </span>
      <span className="text-rambutan-400 flex shrink-0 items-center gap-1.5 text-xs">
        {check.status === "checking" && (
          <span
            aria-hidden="true"
            className="rounded-orb border-rambutan-400 size-3 animate-spin border-[1.5px] border-t-transparent"
          />
        )}
        {check.status === "error" && (
          <AlertTriangle
            aria-hidden="true"
            className="text-lychee-400 size-3.5"
          />
        )}
        {label}
      </span>
    </li>
  );
}
