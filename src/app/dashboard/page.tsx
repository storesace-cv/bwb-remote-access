/**
 * Dashboard Page
 * 
 * Main dashboard showing devices and user info.
 * Requires MeshCentral session.
 */

import { redirect } from "next/navigation";
import { getSession } from "@/lib/mesh-auth";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const session = await getSession();
  
  if (!session?.authenticated) {
    redirect("/login");
  }

  const userEmail = session.email;
  const userDisplayName = session.email.split("@")[0];
  const userDomain = session.domain;

  return (
    <DashboardClient
      userEmail={userEmail}
      userDisplayName={userDisplayName}
      userDomain={userDomain}
      isAdmin={false}
      roleLabel="Utilizador"
      orgRoles={[]}
    />
  );
}
