/**
 * Organization Mapping
 * 
 * Maps domain slugs to Auth0 Organization IDs.
 * Organization IDs are configured via environment variables.
 * 
 * Required env vars:
 *   - AUTH0_ORG_ID_MESH
 *   - AUTH0_ORG_ID_ZONETECH
 *   - AUTH0_ORG_ID_ZSANGOLA
 */
import "server-only";

export type ValidDomain = "mesh" | "zonetech" | "zsangola";

export const VALID_DOMAINS: ValidDomain[] = ["mesh", "zonetech", "zsangola"];

/**
 * Gets the Auth0 Organization ID for a domain.
 * Returns null if not configured.
 */
export function getOrgIdForDomain(domain: ValidDomain): string | null {
  switch (domain) {
    case "mesh":
      return process.env.AUTH0_ORG_ID_MESH || null;
    case "zonetech":
      return process.env.AUTH0_ORG_ID_ZONETECH || null;
    case "zsangola":
      return process.env.AUTH0_ORG_ID_ZSANGOLA || null;
    default:
      return null;
  }
}

/**
 * Checks if a domain has an Organization ID configured.
 */
export function isOrgConfigured(domain: ValidDomain): boolean {
  return getOrgIdForDomain(domain) !== null;
}

/**
 * Gets all configured organization mappings.
 */
export function getConfiguredOrgs(): { domain: ValidDomain; orgId: string }[] {
  return VALID_DOMAINS
    .map((domain) => ({ domain, orgId: getOrgIdForDomain(domain) }))
    .filter((item): item is { domain: ValidDomain; orgId: string } => item.orgId !== null);
}

/**
 * Gets the Auth0 Database connection name for user creation.
 * Can be configured via env or defaults to "Username-Password-Authentication".
 */
export function getAuth0Connection(): string {
  return process.env.AUTH0_DB_CONNECTION || "Username-Password-Authentication";
}
