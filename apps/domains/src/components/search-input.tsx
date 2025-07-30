import { AlertTriangle, Info } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import tlds from "tlds";
import { Input } from "~/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import type { DomainSearchQuery, SearchInputProps, TLD } from "~/lib/types";

// Popular TLDs for default search (curated from the full list)
const POPULAR_TLDS: TLD[] = [
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
];

// All available TLDs from the npm package (with dot prefix)
const ALL_TLDS: TLD[] = tlds.map((tld) => `.${tld}`);

interface SearchInputState {
  inputValue: string;
  selectedTlds: TLD[];
}

// Minimum domain length (excluding TLD)
const MIN_DOMAIN_LENGTH = 3;

export function SearchInput({
  onSearch,
  onClear,
  placeholder = "Search for domains...",
  autoFocus = true,
}: SearchInputProps) {
  const [state, setState] = useState<SearchInputState>({
    inputValue: "",
    selectedTlds: POPULAR_TLDS,
  });
  const [hasInvalidTld, setHasInvalidTld] = useState(false);
  const [isDomainTooShort, setIsDomainTooShort] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^a-zA-Z0-9-.]/g, ""); // Allow alphanumeric, hyphens, and dots
    setState((prev) => ({ ...prev, inputValue: value }));

    // Check for invalid TLD in real-time
    const lastDotIndex = value.lastIndexOf(".");
    if (lastDotIndex > 0 && lastDotIndex < value.length - 1) {
      const potentialTld = value.slice(lastDotIndex);
      setHasInvalidTld(!ALL_TLDS.includes(potentialTld as TLD));
    } else {
      setHasInvalidTld(false);
    }

    // Check if domain is too short
    const domainLength = lastDotIndex > 0 ? lastDotIndex : value.length;
    setIsDomainTooShort(domainLength > 0 && domainLength < MIN_DOMAIN_LENGTH);

    // Clear existing debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Set new debounce or clear results if empty
    if (value.trim()) {
      debounceRef.current = setTimeout(() => {
        handleSearch(value.trim().toLowerCase());
      }, 500); // 500ms debounce
    } else {
      // Clear results when input is empty
      onClear?.();
    }
  };

  // Handle search submission
  const handleSearch = (searchDomain: string) => {
    if (!searchDomain || hasInvalidTld) return;

    // Check if user included a dot (potential TLD)
    const lastDotIndex = searchDomain.lastIndexOf(".");

    if (lastDotIndex > 0 && lastDotIndex < searchDomain.length - 1) {
      // User included a potential TLD
      const potentialTld = searchDomain.slice(lastDotIndex);
      const domainPart = searchDomain.slice(0, lastDotIndex);

      // Check if domain part is long enough
      if (domainPart.length < MIN_DOMAIN_LENGTH) return;

      // Check if it's a valid TLD
      if (ALL_TLDS.includes(potentialTld as TLD)) {
        // Valid TLD - search only for this specific domain
        const query: DomainSearchQuery = {
          domains: [domainPart],
          tlds: [potentialTld as TLD],
        };
        onSearch(query);
      } else {
        // Invalid TLD - don't search
        return;
      }
    } else {
      // No TLD included - check if domain is long enough
      if (searchDomain.length < MIN_DOMAIN_LENGTH) return;

      // Search across all TLDs
      const query: DomainSearchQuery = {
        domains: [searchDomain],
        tlds: state.selectedTlds,
      };
      onSearch(query);
    }
  };

  // Auto focus
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="relative">
        <Input
          ref={inputRef}
          type="text"
          value={state.inputValue}
          onChange={handleInputChange}
          placeholder={placeholder}
          className="h-14 w-full rounded-xl border-[1.5px] border-longan-700 bg-longan-900 px-6 text-lg text-rambutan-100 placeholder-rambutan-400 transition-all duration-200 focus-visible:border-mangosteen-500 disabled:cursor-not-allowed disabled:opacity-50"
          autoComplete="off"
        />

        {hasInvalidTld && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="-translate-y-1/2 absolute top-1/2 right-4 cursor-help text-lychee-400">
                <AlertTriangle size={16} />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Invalid TLD</p>
            </TooltipContent>
          </Tooltip>
        )}

        {isDomainTooShort && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="-translate-y-1/2 absolute top-1/2 right-4 cursor-help text-persimmon-400">
                <Info size={16} />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Domain must be at least {MIN_DOMAIN_LENGTH} characters</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
