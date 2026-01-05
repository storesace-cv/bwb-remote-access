/**
 * RBAC (Role-Based Access Control) for MeshCentral Sessions
 * 
 * Uses mesh_users.user_type for authorization:
 * - siteadmin: Full access to all domains (global super admin)
 * - minisiteadmin: Domain-level super admin
 * - agent: Manages tenant/collaborators
 * - colaborador: Active user within a tenant
 * - inactivo: Disabled user
 * - candidato: New user without full access
 */

import { MeshSession, getShortDomain, getMeshUserByEmail, type UserType } from "./mesh-auth";

// Valid domains
export type ValidDomain = "mesh" | "zonetech" | "zsangola";
export const VALID_DOMAINS: ValidDomain[] = ["mesh", "zonetech", "zsangola"];

// User types hierarchy (from schema)
export const USER_TYPES = {
  SITEADMIN: "siteadmin",
  MINISITEADMIN: "minisiteadmin", 
  AGENT: "agent",
  COLABORADOR: "colaborador",
  INACTIVO: "inactivo",
  CANDIDATO: "candidato",
} as const;

/**
 * User claims extracted from session + Supabase
 */
export interface UserClaims {
  email: string;
  domain: string;          // Short domain (mesh, zonetech, zsangola)
  fullDomain: string;      // Full domain (mesh.bwb.pt, etc.)
  userId?: string;         // mesh_users.id
  userType: UserType;      // user_type from mesh_users
  isSiteAdmin: boolean;    // siteadmin or minisiteadmin
  isAgent: boolean;        // agent user type
  authenticated: boolean;
}

/**
 * Get user claims from MeshCentral session
 * Enriches session with role data from mesh_users table
 */
export async function getUserClaims(session: MeshSession | null): Promise<UserClaims | null> {
  if (!session?.authenticated) {
    return null;
  }
  
  const shortDomain = getShortDomain(session.domain);
  
  // Default claims from session
  const claims: UserClaims = {
    email: session.email,
    domain: shortDomain,
    fullDomain: session.domain,
    userId: session.userId,
    userType: (session.userType as UserType) || "candidato",
    isSiteAdmin: false,
    isAgent: false,
    authenticated: true,
  };
  
  // Try to enrich with Supabase data
  const userData = await getMeshUserByEmail(session.email);
  
  if (userData) {
    claims.userId = userData.id;
    claims.userType = userData.user_type;
    claims.domain = userData.domain || shortDomain;
    claims.isSiteAdmin = userData.user_type === "siteadmin" || userData.user_type === "minisiteadmin";
    claims.isAgent = userData.user_type === "agent";
  }
  
  return claims;
}

/**
 * Check if user is a Site Admin (siteadmin or minisiteadmin)
 */
export function isSuperAdmin(claims: UserClaims | null): boolean {
  return claims?.isSiteAdmin ?? false;
}

/**
 * Check if user is an Agent (can manage collaborators)
 */
export function isAgent(claims: UserClaims | null): boolean {
  return claims?.isAgent ?? false;
}

/**
 * Check if user is a Domain Admin (agent or higher)
 */
export function isDomainAdmin(claims: UserClaims | null): boolean {
  if (!claims) return false;
  return ["siteadmin", "minisiteadmin", "agent"].includes(claims.userType);
}

/**
 * Check if user can manage users
 */
export function canManageUsers(claims: UserClaims | null): boolean {
  return isDomainAdmin(claims);
}

/**
 * Check if user can access a specific domain
 */
export function canAccessDomain(claims: UserClaims | null, targetDomain: ValidDomain): boolean {
  if (!claims) return false;
  if (isSuperAdmin(claims)) return true;
  return claims.domain === targetDomain;
}

/**
 * Get admin role label for display
 */
export function getAdminRoleLabel(claims: UserClaims | null): string | null {
  if (!claims) return null;
  
  switch (claims.userType) {
    case "siteadmin":
      return "Super Admin";
    case "minisiteadmin":
      return "Admin de Domínio";
    case "agent":
      return "Agente";
    case "colaborador":
      return "Colaborador";
    case "inactivo":
      return "Inativo";
    case "candidato":
      return "Candidato";
    default:
      return null;
  }
}

/**
 * Get list of domains user can access
 */
export function getAccessibleDomains(claims: UserClaims | null): ValidDomain[] {
  if (!claims) return [];
  if (isSuperAdmin(claims)) return [...VALID_DOMAINS];
  if (VALID_DOMAINS.includes(claims.domain as ValidDomain)) {
    return [claims.domain as ValidDomain];
  }
  return [];
}

/**
 * Check if user type allows active access (not disabled/candidate)
 */
export function isActiveUser(claims: UserClaims | null): boolean {
  if (!claims) return false;
  return !["inactivo", "candidato"].includes(claims.userType);
}
