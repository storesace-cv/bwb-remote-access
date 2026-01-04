/**
 * API Route: POST /api/admin/users/[id]/resync
 * 
 * Resyncs a user's data from the database.
 * With Auth0 removed, this now just refreshes the user record.
 * 
 * RBAC:
 *   - SuperAdmin can resync any user
 *   - Domain Admin can only resync users in their domain
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminAccess } from "@/lib/require-admin";
import { isSuperAdmin } from "@/lib/rbac-mesh";
import { getMirrorUserById } from "@/lib/user-mirror";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: mirrorUserId } = await params;

    // Check admin access
    const { authorized, claims } = await checkAdminAccess();
    if (!authorized || !claims) {
      return NextResponse.json(
        { error: "Unauthorized - admin access required" },
        { status: 403 }
      );
    }

    // Get the mirror user
    const mirrorUser = await getMirrorUserById(mirrorUserId);
    if (!mirrorUser) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // RBAC: Domain Admin can only resync users in their domain
    const superAdmin = isSuperAdmin(claims);
    if (!superAdmin) {
      const userInDomain = mirrorUser.domains?.some((d: { domain: string }) => d.domain === claims.domain);
      if (!userInDomain) {
        return NextResponse.json(
          { error: "You can only refresh users in your domain" },
          { status: 403 }
        );
      }
    }

    // Return current user data (no external sync needed without Auth0)
    return NextResponse.json({
      success: true,
      message: "User data refreshed",
      user: {
        id: mirrorUser.id,
        email: mirrorUser.email,
        displayName: mirrorUser.display_name,
        isSuperAdminMeshCentral: mirrorUser.is_superadmin_meshcentral,
        isSuperAdminRustDesk: mirrorUser.is_superadmin_rustdesk,
        deletedAt: mirrorUser.deleted_at,
        domains: mirrorUser.domains?.map((d: { domain: string; role: string }) => ({
          domain: d.domain,
          role: d.role,
        })) || [],
      },
    });

  } catch (error) {
    console.error("Error in /api/admin/users/[id]/resync:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
