/**
 * Dashboard Page
 * 
 * Main dashboard showing devices and user info.
 * Requires MeshCentral session.
 */

import { redirect } from "next/navigation";
import { getSession } from "@/lib/mesh-auth";
import { getUserClaims, getAdminRoleLabel, canManageUsers, isSuperAdmin, isAgent, isDomainAdmin } from "@/lib/rbac-mesh";
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
  const canManage = canManageUsers(claims);
  const superAdmin = isSuperAdmin(claims);
  const agentRole = isAgent(claims);
  const domainAdmin = isDomainAdmin(claims);
  const roleLabel = getAdminRoleLabel(claims) || claims?.userType || "Utilizador";
  const userType = claims?.userType || "candidato";

  return (
    <DashboardClient
      userEmail={userEmail}
      userDisplayName={userDisplayName}
      userDomain={userDomain}
      isAdmin={canManage}
      isSuperAdmin={superAdmin}
      isAgent={agentRole}
      isDomainAdmin={domainAdmin}
      roleLabel={roleLabel}
      userType={userType}
    />
  );
}
