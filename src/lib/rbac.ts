/**
 * RBAC (Role-Based Access Control) helpers for Auth0 claims.
 * 
 * Claims contract (injected by Auth0 Post-Login Action):
 *   - https://bwb.pt/claims/email
 *   - https://bwb.pt/claims/global_roles  (e.g., ["SUPERADMIN_MESHCENTRAL", "SUPERADMIN_RUSTDESK"])
 *   - https://bwb.pt/claims/org           (e.g., "zonetech")
 *   - https://bwb.pt/claims/org_roles     (e.g., { "zonetech": ["DOMAIN_ADMIN", "AGENT"] })
 */

import type { SessionData } from "@auth0/nextjs-auth0/types";

// Custom claims namespace
const CLAIMS_NS = "https://bwb.pt/claims";

// Known global roles
export const GLOBAL_ROLES = {
  SUPERADMIN_MESHCENTRAL: "SUPERADMIN_MESHCENTRAL",
  SUPERADMIN_RUSTDESK: "SUPERADMIN_RUSTDESK",
} as const;

// Known org-level roles
export const ORG_ROLES = {
  DOMAIN_ADMIN: "DOMAIN_ADMIN",
  AGENT: "AGENT",
} as const;

/**
 * Parsed claims from Auth0 session.
 */
export interface ParsedClaims {
  email: string | null;
  globalRoles: string[];
  org: string | null;
  orgRoles: Record<string, string[]>;
}

/**
 * Extracts custom claims from an Auth0 session.
 * Returns safe defaults if claims are missing.
 */
export function getClaimsFromAuth0Session(
  session: SessionData | null | undefined
): ParsedClaims {
  if (!session?.user) {
    return {
      email: null,
      globalRoles: [],
      org: null,
      orgRoles: {},
    };
  }

  const user = session.user as Record<string, unknown>;

  const email = (user[`${CLAIMS_NS}/email`] as string) || user.email as string || null;
  
  const rawGlobalRoles = user[`${CLAIMS_NS}/global_roles`];
  const globalRoles = Array.isArray(rawGlobalRoles)
    ? (rawGlobalRoles as string[])
    : [];

  const org = (user[`${CLAIMS_NS}/org`] as string) || null;

  const rawOrgRoles = user[`${CLAIMS_NS}/org_roles`];
  const orgRoles =
    rawOrgRoles && typeof rawOrgRoles === "object" && !Array.isArray(rawOrgRoles)
      ? (rawOrgRoles as Record<string, string[]>)
      : {};

  return { email, globalRoles, org, orgRoles };
}

/**
 * Checks if user has SUPERADMIN_MESHCENTRAL role.
 */
export function isSuperAdminMeshCentral(claims: ParsedClaims): boolean {
  return claims.globalRoles.includes(GLOBAL_ROLES.SUPERADMIN_MESHCENTRAL);
}

/**
 * Checks if user has SUPERADMIN_RUSTDESK role.
 */
export function isSuperAdminRustDesk(claims: ParsedClaims): boolean {
  return claims.globalRoles.includes(GLOBAL_ROLES.SUPERADMIN_RUSTDESK);
}

/**
 * Checks if user has any superadmin role (MeshCentral OR RustDesk).
 */
export function isSuperAdminAny(claims: ParsedClaims): boolean {
  return isSuperAdminMeshCentral(claims) || isSuperAdminRustDesk(claims);
}

/**
 * Checks if user is DOMAIN_ADMIN for their current org.
 * Returns false if no org is set or no DOMAIN_ADMIN role for that org.
 */
export function isDomainAdminForCurrentOrg(claims: ParsedClaims): boolean {
  if (!claims.org) return false;
  const rolesForOrg = claims.orgRoles[claims.org];
  if (!Array.isArray(rolesForOrg)) return false;
  return rolesForOrg.includes(ORG_ROLES.DOMAIN_ADMIN);
}

/**
 * Checks if user can manage users.
 * True if user is a superadmin OR is a domain admin for their current org.
 */
export function canManageUsers(claims: ParsedClaims): boolean {
  return isSuperAdminAny(claims) || isDomainAdminForCurrentOrg(claims);
}

/**
 * Gets the admin role label for display purposes.
 */
export function getAdminRoleLabel(claims: ParsedClaims): string | null {
  if (isSuperAdminAny(claims)) {
    const roles: string[] = [];
    if (isSuperAdminMeshCentral(claims)) roles.push("MeshCentral");
    if (isSuperAdminRustDesk(claims)) roles.push("RustDesk");
    return `SuperAdmin (${roles.join(", ")})`;
  }
  if (isDomainAdminForCurrentOrg(claims)) {
    return `Domain Admin (${claims.org})`;
  }
  return null;
}
