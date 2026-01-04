/**
 * API Route: POST /api/admin/users/[id]/deactivate
 * 
 * Deactivates a user by setting user_type to 'inactivo' and deleted_at.
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
    const { authorized, claims, email: currentUserEmail } = await checkAdminAccess();
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

    // Prevent self-deactivation
    if (user.email === currentUserEmail || user.mesh_username === currentUserEmail) {
      return NextResponse.json(
        { error: "Cannot deactivate your own account" },
        { status: 400 }
      );
    }

    // RBAC: Domain Admin can only deactivate users in their domain
    const superAdmin = isSuperAdmin(claims);
    if (!superAdmin && user.domain !== claims.domain) {
      return NextResponse.json(
        { error: "You can only deactivate users in your domain" },
        { status: 403 }
      );
    }

    // Set deleted_at and user_type to inactivo
    const updatedUser = await setMirrorUserDeleted(userId, true);

    return NextResponse.json({
      success: true,
      message: "User deactivated successfully",
      userId,
      deletedAt: updatedUser.deleted_at,
    });

  } catch (error) {
    console.error("Error in /api/admin/users/[id]/deactivate:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
