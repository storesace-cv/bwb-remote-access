/**
 * API Route: POST /api/admin/users/[id]/reactivate
 * 
 * Reactivates a user by clearing deleted_at and setting user_type to colaborador.
 * Uses mesh_users table.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminAccess } from "@/lib/require-admin";
import { isSuperAdmin } from "@/lib/rbac-mesh";
import { getMirrorUserById, setMirrorUserDeleted } from "@/lib/user-mirror";

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

    // RBAC: Domain Admin can only reactivate users in their domain
    const superAdmin = isSuperAdmin(claims);
    if (!superAdmin && user.domain !== claims.domain) {
      return NextResponse.json(
        { error: "You can only reactivate users in your domain" },
        { status: 403 }
      );
    }

    // Clear deleted_at
    const updatedUser = await setMirrorUserDeleted(userId, false);

    return NextResponse.json({
      success: true,
      message: "User reactivated successfully",
      userId,
      deletedAt: updatedUser.deleted_at,
    });

  } catch (error) {
    console.error("Error in /api/admin/users/[id]/reactivate:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
