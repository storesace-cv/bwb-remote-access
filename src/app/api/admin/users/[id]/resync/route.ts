/**
 * API Route: POST /api/admin/users/[id]/resync
 * 
 * Refreshes a user's data from the database.
 * Uses mesh_users table.
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
    const { id: userId } = await params;

    // Check admin access
    const { authorized, claims } = await checkAdminAccess();
    if (!authorized || !claims) {
      return NextResponse.json(
        { error: "Unauthorized - admin access required" },
        { status: 403 }
      );
    }

    // Get the user
    const user = await getMirrorUserById(userId);
    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // RBAC: Domain Admin can only resync users in their domain
    const superAdmin = isSuperAdmin(claims);
    if (!superAdmin && user.domain !== claims.domain) {
      return NextResponse.json(
        { error: "You can only refresh users in your domain" },
        { status: 403 }
      );
    }

    // Return current user data
    return NextResponse.json({
      success: true,
      message: "User data refreshed",
      user: {
        id: user.id,
        meshUsername: user.mesh_username,
        email: user.email,
        displayName: user.display_name || user.name,
        userType: user.user_type,
        domain: user.domain,
        disabled: user.disabled,
        deletedAt: user.deleted_at,
      },
    });

  } catch (error) {
    console.error("Error in /api/admin/users/[id]/resync:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
