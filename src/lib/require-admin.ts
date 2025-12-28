/**
 * Server-side helper to require admin access.
 * Must be used in Server Components only.
 */
import "server-only";
import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth0";
import {
  getClaimsFromAuth0Session,
  canManageUsers,
  type ParsedClaims,
} from "@/lib/rbac";

export interface AdminCheckResult {
  /** Whether the user has admin access */
  authorized: boolean;
  /** Parsed claims (may be empty if not logged in) */
  claims: ParsedClaims;
  /** User email if available */
  email: string | null;
  /** Auth0 user sub (id) if available */
  sub: string | null;
}

/**
 * Checks if the current user has admin access (via Auth0 session).
 * Does NOT redirect - returns the result for the caller to handle.
 */
export async function checkAdminAccess(): Promise<AdminCheckResult> {
  const session = await auth0.getSession();
  const claims = getClaimsFromAuth0Session(session);
  const authorized = canManageUsers(claims);

  return {
    authorized,
    claims,
    email: claims.email,
    sub: session?.user?.sub as string | null ?? null,
  };
}

/**
 * Requires admin access. Redirects to /auth if not authorized.
 * Use this in Server Components that require admin privileges.
 * 
 * @param redirectTo - Where to redirect if not authorized (default: /auth)
 * @returns AdminCheckResult if authorized
 */
export async function requireAdmin(
  redirectTo: string = "/auth"
): Promise<AdminCheckResult> {
  const result = await checkAdminAccess();

  if (!result.authorized) {
    // User is not logged in or doesn't have admin access
    redirect(redirectTo);
  }

  return result;
}
