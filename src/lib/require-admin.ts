/**
 * Server-side helper to require admin access.
 * Must be used in Server Components only.
 */
import "server-only";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/mesh-auth";
import { getUserClaims, canManageUsers, type UserClaims } from "@/lib/rbac-mesh";

export interface AdminCheckResult {
  /** Whether the user has admin access */
  authorized: boolean;
  /** User claims (may have defaults if role data unavailable) */
  claims: UserClaims | null;
  /** User email if available */
  email: string | null;
}

/**
 * Checks if the current user has admin access (via MeshCentral session).
 * Does NOT redirect - returns the result for the caller to handle.
 */
export async function checkAdminAccess(): Promise<AdminCheckResult> {
  const session = await getSession();
  const claims = await getUserClaims(session);
  const authorized = canManageUsers(claims);

  return {
    authorized,
    claims,
    email: claims?.email ?? null,
  };
}

/**
 * Requires admin access. Redirects to /login if not authorized.
 * Use this in Server Components that require admin privileges.
 * 
 * @param redirectTo - Where to redirect if not authorized (default: /login)
 * @returns AdminCheckResult if authorized
 */
export async function requireAdmin(
  redirectTo: string = "/login"
): Promise<AdminCheckResult> {
  const result = await checkAdminAccess();

  if (!result.authorized) {
    redirect(redirectTo);
  }

  return result;
}
