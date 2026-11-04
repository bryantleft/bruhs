import type { Availability } from "./types";

/** DNS response codes we act on (RFC 1035 §4.1.1). */
const NOERROR = 0;
const NXDOMAIN = 3;

/** Names this short are almost always registry-reserved or sold as premium. */
const PREMIUM_MAX_LENGTH = 3;

/** The subset of Cloudflare's DNS-over-HTTPS JSON response that we read. */
interface DohResponse {
  Status: number;
  answerCount: number;
}

export class DnsLookupError extends Error {
  constructor(
    readonly domain: string,
    readonly recordType: string,
    reason: string,
  ) {
    super(`${recordType} lookup for ${domain} failed: ${reason}`);
    this.name = "DnsLookupError";
  }
}

function parseDohResponse(value: unknown): DohResponse | null {
  if (typeof value !== "object" || value === null || !("Status" in value)) {
    return null;
  }
  const { Status } = value;
  if (typeof Status !== "number") return null;
  const answer = "Answer" in value ? value.Answer : undefined;
  if (answer !== undefined && !Array.isArray(answer)) return null;
  return { Status, answerCount: answer?.length ?? 0 };
}

async function queryDns(
  domain: string,
  recordType: "A" | "SOA" | "NS",
  signal?: AbortSignal,
): Promise<DohResponse> {
  const url = new URL("https://cloudflare-dns.com/dns-query");
  url.searchParams.set("name", domain);
  url.searchParams.set("type", recordType);
  const response = await fetch(url, {
    headers: { Accept: "application/dns-json" },
    signal,
  });
  if (!response.ok) {
    throw new DnsLookupError(domain, recordType, `HTTP ${response.status}`);
  }
  const data = parseDohResponse(await response.json());
  if (!data) throw new DnsLookupError(domain, recordType, "malformed response");
  return data;
}

/** Whether the name has any records of this type. Lookup failures throw. */
async function hasRecords(
  domain: string,
  recordType: "SOA" | "NS",
  signal?: AbortSignal,
): Promise<boolean> {
  const data = await queryDns(domain, recordType, signal);
  if (data.Status === NOERROR) return data.answerCount > 0;
  if (data.Status === NXDOMAIN) return false;
  throw new DnsLookupError(domain, recordType, `DNS status ${data.Status}`);
}

/**
 * Estimate whether `domain` (e.g. "example.com") is registered, from public DNS.
 *
 * Throws `DnsLookupError` when any lookup fails, so a network problem is reported as an
 * error and never as "available".
 */
export async function checkDomainAvailability(
  domain: string,
  signal?: AbortSignal,
): Promise<Availability> {
  const a = await queryDns(domain, "A", signal);

  // NOERROR means the name exists, whether or not it has A records (NODATA).
  if (a.Status === NOERROR) return "unavailable";
  if (a.Status !== NXDOMAIN) {
    throw new DnsLookupError(domain, "A", `DNS status ${a.Status}`);
  }

  // NXDOMAIN: a registered name can still carry SOA or NS records.
  const [hasSoa, hasNs] = await Promise.all([
    hasRecords(domain, "SOA", signal),
    hasRecords(domain, "NS", signal),
  ]);
  if (hasSoa || hasNs) return "unavailable";

  const name = domain.slice(0, domain.lastIndexOf("."));
  return name.length <= PREMIUM_MAX_LENGTH ? "premium" : "available";
}
