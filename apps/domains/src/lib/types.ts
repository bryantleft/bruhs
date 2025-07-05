// Domain availability status types
export type DomainStatus = "available" | "unavailable" | "unknown" | "error";

// TLD (Top Level Domain) types - now supports all TLDs from the npm package
export type TLD = string; // e.g., ".com", ".net", etc.

// Domain information interface
export interface DomainInfo {
  domain: string;
  tld: TLD;
  fullDomain: string; // domain + tld (e.g., "example.com")
  status: DomainStatus;
}

// Search query interface
export interface DomainSearchQuery {
  domains: string[]; // Multiple domain names to search
  tlds: TLD[]; // Selected TLDs to check
}

// API response interfaces
export interface DomainSearchResponse {
  results: DomainInfo[];
  totalSearched: number;
  timestamp: string;
}

// Component prop types
export interface SearchInputProps {
  onSearch: (query: DomainSearchQuery) => void;
  onClear?: () => void;
  isLoading?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}

export interface DomainCardProps {
  domain: DomainInfo;
}

export interface ResultsGridProps {
  results: DomainInfo[];
  isLoading?: boolean;
  emptyStateMessage?: string;
}

// Utility types
export type DomainSearchState = "idle" | "searching" | "success" | "error";

export interface DomainSearchHookResult {
  search: (query: DomainSearchQuery) => Promise<void>;
  results: DomainInfo[];
  isLoading: boolean;
  error: Error | null;
  state: DomainSearchState;
  clearResults: () => void;
}

// Progress callback type for streaming results
export type DomainSearchProgressCallback = (result: DomainInfo) => void;
