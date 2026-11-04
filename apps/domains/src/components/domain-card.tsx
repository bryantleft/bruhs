import { AlertTriangle } from "lucide-react";
import type { DomainCheck, DomainResult } from "~/lib/types";

interface Presentation {
  label: string;
  /** Status ring; empty keeps the card's neutral ring. */
  ring: string;
  name: string;
}

function present(check: DomainCheck): Presentation {
  switch (check.status) {
    case "checking":
      return {
        label: "Checking…",
        ring: "",
        name: "text-rambutan-300",
      };
    case "error":
      return {
        label: "Couldn't check",
        ring: "inset-ring-[1.5px] inset-ring-lychee-600",
        name: "text-lychee-300",
      };
    case "done":
      switch (check.availability) {
        case "available":
          return {
            label: "Available",
            ring: "inset-ring-[1.5px] inset-ring-pandan-600",
            name: "text-rambutan-100",
          };
        case "premium":
          return {
            label: "Likely premium",
            ring: "inset-ring-[1.5px] inset-ring-durian-600",
            name: "text-rambutan-100",
          };
        case "unavailable":
          return {
            label: "Taken",
            ring: "",
            name: "text-rambutan-400 line-through",
          };
      }
  }
}

export function DomainCard({ domain }: { domain: DomainResult }) {
  const { check } = domain;
  const { label, ring, name } = present(check);

  return (
    <li
      className={`surface-card flex h-12 items-center justify-between gap-3 px-4 ${ring}`}
      title={check.status === "error" ? check.message : undefined}
    >
      <span className={`text-label-lg flex min-w-0 ${name}`}>
        <span className="truncate">{domain.name}</span>
        <span className="shrink-0">{domain.tld}</span>
      </span>
      <span className="text-rambutan-400 text-label-sm flex shrink-0 items-center gap-1.5">
        {check.status === "checking" && (
          <span aria-hidden="true" className="spinner size-3" />
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
