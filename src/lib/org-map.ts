/**
 * Domain Mapping
 * 
 * Maps domain slugs and provides domain utilities.
 */
import "server-only";

export type ValidDomain = "mesh" | "zonetech" | "zsangola";

export const VALID_DOMAINS: ValidDomain[] = ["mesh", "zonetech", "zsangola"];

/**
 * Map of full domain names to short domain slugs
 */
export const DOMAIN_MAP: Record<string, ValidDomain> = {
  "mesh.bwb.pt": "mesh",
  "zonetech.bwb.pt": "zonetech",
  "zsangola.bwb.pt": "zsangola",
};

/**
 * Checks if a domain slug is valid
 */
export function isValidDomain(domain: string): domain is ValidDomain {
  return VALID_DOMAINS.includes(domain as ValidDomain);
}

/**
 * Gets the short domain slug from a full domain name
 */
export function getShortDomain(fullDomain: string): ValidDomain {
  return DOMAIN_MAP[fullDomain] || "mesh";
}

/**
 * Gets the full domain name from a short domain slug
 */
export function getFullDomain(shortDomain: ValidDomain): string {
  const reverseMap: Record<ValidDomain, string> = {
    mesh: "mesh.bwb.pt",
    zonetech: "zonetech.bwb.pt",
    zsangola: "zsangola.bwb.pt",
  };
  return reverseMap[shortDomain];
}

/**
 * Gets the MeshCentral URL for a domain
 */
export function getMeshCentralUrl(domain: ValidDomain): string {
  return `https://${getFullDomain(domain)}`;
}
