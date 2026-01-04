/**
 * Dashboard Page
 * 
 * Main dashboard showing devices and user info.
 * Requires MeshCentral session.
 */

import { redirect } from "next/navigation";
import { getSession } from "@/lib/mesh-auth";
import { getUserClaims, getAdminRoleLabel, canManageUsers } from "@/lib/rbac-mesh";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const session = await getSession();
  
  if (!session?.authenticated) {
    redirect("/login");
  }

  const claims = await getUserClaims(session);
  const userEmail = session.email;
  const userDisplayName = session.email.split("@")[0];
  const userDomain = session.domain;
  
  // Get role info
  const isAdmin = canManageUsers(claims);
  const roleLabel = getAdminRoleLabel(claims) || claims?.userType || "Utilizador";

  return (
    <DashboardClient
      userEmail={userEmail}
      userDisplayName={userDisplayName}
      userDomain={userDomain}
      isAdmin={isAdmin}
      roleLabel={roleLabel}
    />
  );
}
