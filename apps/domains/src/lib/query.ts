import tlds from "tlds";
import type { DomainSearchQuery, Tld } from "./types";

const TLDS: ReadonlySet<string> = new Set(tlds.map((tld) => `.${tld}`));

/** The TLD with its dot, if it's a real one (".com"), else `null`. */
export function parseTld(value: string): Tld | null {
  const tld = value.startsWith(".") ? value : `.${value}`;
  return TLDS.has(tld) ? (tld as Tld) : null;
}

function tld(value: string): Tld {
  const parsed = parseTld(value);
  if (!parsed) throw new Error(`Not a TLD: ${value}`);
  return parsed;
}

/** Checked when the user types a name without a TLD. */
export const POPULAR_TLDS: readonly Tld[] = [
  ".com",
  ".net",
  ".org",
  ".dev",
  ".app",
  ".io",
  ".co",
  ".ai",
  ".xyz",
  ".me",
  ".info",
  ".biz",
].map(tld);

/** Minimum length of the name (excluding the TLD). */
export const MIN_NAME_LENGTH = 3;

const MAX_LABEL_LENGTH = 63;

export type ParsedQuery =
  | { kind: "empty" }
  /** Ends with a dot: the user is about to type a TLD. */
  | { kind: "incomplete" }
  | { kind: "invalid-label"; label: string }
  | { kind: "too-short" }
  | { kind: "invalid-tld"; tld: string }
  | { kind: "ok"; query: DomainSearchQuery };

/** Keep only characters that can appear in a domain name, lower-cased. */
export function sanitizeInput(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9.-]/g, "");
}

/** A DNS label: 1–63 letters, digits or hyphens, not starting or ending with a hyphen. */
function isValidLabel(label: string): boolean {
  return (
    label.length > 0 &&
    label.length <= MAX_LABEL_LENGTH &&
    /^[a-z0-9-]+$/.test(label) &&
    !label.startsWith("-") &&
    !label.endsWith("-")
  );
}

/**
 * Interpret the search box. "example" checks the popular TLDs; "example.io" checks just
 * that domain. Pure, so the component can call it on every render.
 */
export function parseQuery(input: string): ParsedQuery {
  const value = sanitizeInput(input.trim());
  if (value === "") return { kind: "empty" };
  if (value.endsWith(".")) return { kind: "incomplete" };

  const labels = value.split(".");
  const tldLabel = labels.length > 1 ? labels.pop() : undefined;
  const invalid = labels.find((label) => !isValidLabel(label));
  if (invalid !== undefined) return { kind: "invalid-label", label: invalid };

  const name = labels.join(".");
  if (name.length < MIN_NAME_LENGTH) return { kind: "too-short" };
  if (tldLabel === undefined) {
    return { kind: "ok", query: { name, tlds: POPULAR_TLDS } };
  }

  const parsedTld = parseTld(tldLabel);
  if (!parsedTld) return { kind: "invalid-tld", tld: `.${tldLabel}` };
  return { kind: "ok", query: { name, tlds: [parsedTld] } };
}
