/**
 * Dashboard Page - Server Component
 * 
 * Validates MeshCentral session and passes auth data to client component.
 * The client component contains the original dashboard UI logic.
 */

import { redirect } from "next/navigation";
import { getSession, getMeshUserByEmail } from "@/lib/mesh-auth";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const session = await getSession();
  
  if (!session?.authenticated) {
    redirect("/");
  }

  // Get user data from mesh_users table
  const meshUser = await getMeshUserByEmail(session.email);
  
  // Determine roles based on user_type
  const userType = meshUser?.user_type || "candidato";
  const isSiteadmin = userType === "siteadmin";
  const isMinisiteadmin = userType === "minisiteadmin" || isSiteadmin;
  const isAgent = userType === "agent" || isMinisiteadmin;
  
  // Get user info
  const userDomain = meshUser?.domain || session.domain || "";
  const userDisplayName = meshUser?.display_name || meshUser?.name || session.email.split("@")[0];
  const meshUserId = meshUser?.id || null;
  const authUserId = meshUser?.auth_user_id || null;

  return (
    <DashboardClient
      // Auth data
      meshUserId={meshUserId}
      authUserId={authUserId}
      userEmail={session.email}
      // Role flags
      isAgent={isAgent}
      isMinisiteadmin={isMinisiteadmin}
      isSiteadmin={isSiteadmin}
      // User info
      userDomain={userDomain}
      userDisplayName={userDisplayName}
    />
  );
}
