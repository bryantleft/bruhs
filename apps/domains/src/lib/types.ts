/** A top-level domain from the IANA list, with its leading dot (".com"). */
export type Tld = string & { readonly __brand: "Tld" };

/** What DNS says about a name. */
export type Availability =
  /** No DNS records: probably unregistered. */
  | "available"
  /** The name resolves or has SOA/NS records: registered. */
  | "unavailable"
  /** No DNS records, but very short names are usually registry-reserved or premium. */
  | "premium";

/** One name to check across one or more TLDs. */
export interface DomainSearchQuery {
  /** The part before the TLD, e.g. "example" or "shop.example". */
  name: string;
  tlds: readonly Tld[];
}

export type DomainCheck =
  | { status: "checking" }
  | { status: "error"; message: string }
  | { status: "done"; availability: Availability };

export interface DomainResult {
  name: string;
  tld: Tld;
  /** name + tld, e.g. "example.com". */
  fullDomain: string;
  check: DomainCheck;
}
