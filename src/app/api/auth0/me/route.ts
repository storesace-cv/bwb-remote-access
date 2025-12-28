/**
 * API Route: /api/auth0/me
 * 
 * Returns Auth0 session info including RBAC claims.
 * Used by client components to check admin access.
 */

import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { getClaimsFromAuth0Session, canManageUsers, getAdminRoleLabel } from "@/lib/rbac";

export async function GET() {
  try {
    const session = await auth0.getSession();
    
    if (!session?.user) {
      return NextResponse.json(
        { authenticated: false, canManageUsers: false },
        { status: 200 }
      );
    }

    const claims = getClaimsFromAuth0Session(session);
    const canManage = canManageUsers(claims);
    const roleLabel = getAdminRoleLabel(claims);

    return NextResponse.json({
      authenticated: true,
      email: claims.email,
      sub: session.user.sub,
      org: claims.org,
      globalRoles: claims.globalRoles,
      orgRoles: claims.orgRoles,
      canManageUsers: canManage,
      roleLabel,
    });
  } catch (error) {
    console.error("Error in /api/auth0/me:", error);
    return NextResponse.json(
      { authenticated: false, canManageUsers: false, error: "Internal error" },
      { status: 500 }
    );
  }
}
