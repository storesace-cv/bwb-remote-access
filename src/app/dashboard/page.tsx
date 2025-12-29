/**
 * Dashboard Page - Auth0 Only
 * 
 * Main dashboard showing devices and user info.
 * Requires Auth0 session (enforced by middleware).
 * 
 * This is a hybrid page:
 * - Server Component fetches Auth0 session
 * - Client Component handles device interactions
 */

import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth0";
import { getClaimsFromAuth0Session, canManageUsers, getAdminRoleLabel, isSuperAdminAny } from "@/lib/rbac";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  // Get Auth0 session (middleware already enforces auth)
  const session = await auth0.getSession();
  
  if (!session?.user) {
    redirect("/");
  }

  // Extract claims
  const claims = getClaimsFromAuth0Session(session);
  const isAdmin = canManageUsers(claims);
  const isSuperAdmin = isSuperAdminAny(claims);
  const roleLabel = getAdminRoleLabel(claims);

  // User info for display
  const userEmail = claims.email || session.user.email as string || "Unknown";
  const userDisplayName = session.user.name as string || session.user.nickname as string || userEmail;
  const userDomain = claims.org || null;

  return (
    <DashboardClient
      userEmail={userEmail}
      userDisplayName={userDisplayName}
      userDomain={userDomain}
      isAdmin={isAdmin}
      isSuperAdmin={isSuperAdmin}
      roleLabel={roleLabel}
      orgRoles={claims.orgRoles}
    />
  );
}
