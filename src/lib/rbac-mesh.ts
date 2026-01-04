/**
 * RBAC (Role-Based Access Control) for MeshCentral Sessions
 * 
 * Replaces the old Auth0-based RBAC with session-based authorization.
 * Roles are stored in Supabase and checked against session.
 */

import { MeshSession, getShortDomain } from "./mesh-auth";
import { createClient } from "@supabase/supabase-js";

// Known roles
export const ROLES = {
  SUPERADMIN: "SUPERADMIN",
  DOMAIN_ADMIN: "DOMAIN_ADMIN",
  AGENT: "AGENT",
  USER: "USER",
} as const;

// Valid domains
export type ValidDomain = "mesh" | "zonetech" | "zsangola";
export const VALID_DOMAINS: ValidDomain[] = ["mesh", "zonetech", "zsangola"];

/**
 * User claims extracted from session + Supabase
 */
export interface UserClaims {
  email: string;
  domain: string;          // Short domain (mesh, zonetech, zsangola)
  fullDomain: string;      // Full domain (mesh.bwb.pt, etc.)
  role: string;            // User's role in their domain
  isSuperAdmin: boolean;
  authenticated: boolean;
}

/**
 * Get Supabase client
 */
function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || 
              process.env.SUPABASE_KEY || 
              process.env.SUPABASE_ANON_KEY;
  
  if (!url || !key) {
    return null;
  }
  
  return createClient(url, key);
}

/**
 * Get user claims from MeshCentral session
 * Enriches session with role data from Supabase
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
    role: "USER",
    isSuperAdmin: false,
    authenticated: true,
  };
  
  // Try to enrich with Supabase data
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data: user } = await supabase
        .from("users")
        .select("role, user_type, is_superadmin_meshcentral, is_superadmin_rustdesk")
        .eq("email", session.email)
        .eq("domain", shortDomain)
        .single();
      
      if (user) {
        claims.role = user.role || "USER";
        claims.isSuperAdmin = !!(user.is_superadmin_meshcentral || user.is_superadmin_rustdesk);
      }
    } catch (error) {
      console.warn("[RBAC] Could not fetch user role from Supabase:", error);
    }
  }
  
  return claims;
}

/**
 * Check if user is a SuperAdmin
 */
export function isSuperAdmin(claims: UserClaims | null): boolean {
  return claims?.isSuperAdmin ?? false;
}

/**
 * Check if user is a Domain Admin for their domain
 */
export function isDomainAdmin(claims: UserClaims | null): boolean {
  return claims?.role === ROLES.DOMAIN_ADMIN || isSuperAdmin(claims);
}

/**
 * Check if user can manage users
 */
export function canManageUsers(claims: UserClaims | null): boolean {
  return isDomainAdmin(claims) || isSuperAdmin(claims);
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
  if (isSuperAdmin(claims)) return "SuperAdmin";
  if (isDomainAdmin(claims)) return `Domain Admin (${claims.domain})`;
  return null;
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
