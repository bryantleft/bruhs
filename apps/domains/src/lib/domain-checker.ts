import type {
  DomainInfo,
  DomainSearchQuery,
  DomainSearchResponse,
  DomainStatus,
  TLD,
} from "./types";

// DNS query utility functions
async function queryDNS(domain: string, recordType: string) {
  const response = await fetch(
    `https://cloudflare-dns.com/dns-query?name=${domain}&type=${recordType}`,
    {
      headers: {
        Accept: "application/dns-json",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`DNS query failed: ${response.status}`);
  }

  return response.json();
}

async function hasRecords(
  domain: string,
  recordType: string,
): Promise<boolean> {
  try {
    const data = await queryDNS(domain, recordType);
    return data.Status === 0 && data.Answer && data.Answer.length > 0;
  } catch {
    return false;
  }
}

// Real domain availability checker using DNS queries
export async function checkDomainAvailability(
  domain: string,
): Promise<DomainStatus> {
  try {
    // Check A records first
    const aData = await queryDNS(domain, "A");

    // If A records exist, domain is definitely taken
    if (aData.Status === 0) {
      return "unavailable";
    }

    // If NXDOMAIN, check deeper
    if (aData.Status === 3) {
      // Check if SOA records exist (domain is registered)
      if (await hasRecords(domain, "SOA")) {
        return "unavailable";
      }

      // Check if NS records exist (domain has nameservers but no A records)
      if (await hasRecords(domain, "NS")) {
        return "unavailable";
      }

      // For very short domains (likely premium), be conservative
      const domainName = domain.split(".")[0].toLowerCase();
      if (domainName.length <= 3) {
        return "unavailable";
      }

      return "available";
    }

    // Other status codes indicate errors
    return "error";
  } catch (error) {
    console.error(`Error checking domain ${domain}:`, error);
    return "error";
  }
}

function parseDomainName(fullDomain: string): { domain: string; tld: TLD } {
  const lastDotIndex = fullDomain.lastIndexOf(".");
  if (lastDotIndex === -1) {
    return { domain: fullDomain, tld: ".com" as TLD };
  }

  const domain = fullDomain.substring(0, lastDotIndex);
  const tld = fullDomain.substring(lastDotIndex) as TLD;

  return { domain, tld };
}

async function checkSingleDomain(fullDomain: string): Promise<DomainInfo> {
  const { domain, tld } = parseDomainName(fullDomain);

  try {
    const status = await checkDomainAvailability(fullDomain);

    return {
      domain,
      tld,
      fullDomain,
      status,
    };
  } catch (error) {
    console.error(`Error checking domain ${fullDomain}:`, error);
    return {
      domain,
      tld,
      fullDomain,
      status: "error",
    };
  }
}

export async function searchDomains(
  query: DomainSearchQuery,
  onProgress?: (result: DomainInfo) => void,
): Promise<DomainSearchResponse> {
  const allPromises: Promise<DomainInfo>[] = [];
  const results: DomainInfo[] = [];

  // Create all domain+TLD combinations as independent promises
  for (const domainName of query.domains) {
    for (const tld of query.tlds) {
      const fullDomain = `${domainName}${tld}`;
      const promise = checkSingleDomain(fullDomain).then((result) => {
        // Call progress callback immediately when each result is ready
        if (onProgress) {
          onProgress(result);
        }
        return result;
      });
      allPromises.push(promise);
    }
  }

  // Wait for all promises to complete
  const allResults = await Promise.all(allPromises);
  results.push(...allResults);

  return {
    results,
    totalSearched: results.length,
    timestamp: new Date().toISOString(),
  };
}
