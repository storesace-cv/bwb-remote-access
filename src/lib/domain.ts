/**
 * Domain helper utilities
 * 
 * Maps hostnames to domains and provides domain validation.
 */

export type ValidDomain = "mesh" | "zonetech" | "zsangola";

export const VALID_DOMAINS: ValidDomain[] = ["mesh", "zonetech", "zsangola"];

export const DOMAIN_LABELS: Record<ValidDomain, string> = {
  mesh: "mesh.bwb.pt",
  zonetech: "zonetech.bwb.pt",
  zsangola: "zsangola.bwb.pt",
};

/**
 * MeshCentral URLs for each domain
 */
export const MESHCENTRAL_URLS: Record<ValidDomain, string> = {
  mesh: "https://mesh.bwb.pt",
  zonetech: "https://zonetech.bwb.pt",
  zsangola: "https://zsangola.bwb.pt",
};

/**
 * Get MeshCentral URL for a given domain
 */
export function getMeshCentralUrl(domain: string): string {
  if (isValidDomain(domain)) {
    return MESHCENTRAL_URLS[domain];
  }
  // Default to mesh if domain is invalid
  return MESHCENTRAL_URLS.mesh;
}

/**
 * Get default domain based on hostname
 */
export function getDefaultDomainFromHostname(hostname: string): ValidDomain {
  const host = hostname.toLowerCase();
  
  if (host.includes("zonetech")) {
    return "zonetech";
  }
  
  if (host.includes("zsangola")) {
    return "zsangola";
  }
  
  return "mesh";
}

/**
 * Validate domain is in allowlist
 */
export function isValidDomain(domain: string): domain is ValidDomain {
  return VALID_DOMAINS.includes(domain as ValidDomain);
}
