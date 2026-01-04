/**
 * API Route: POST /api/admin/users/[id]/deactivate
 * 
 * Deactivates a user by setting deleted_at in Supabase.
 * No longer uses Auth0 - purely Supabase-based.
 * 
 * RBAC:
 *   - SuperAdmin can deactivate any user
 *   - Domain Admin can only deactivate users in their domain
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
    const { id: mirrorUserId } = await params;

    // Check admin access
    const { authorized, claims, email: currentUserEmail } = await checkAdminAccess();
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

    // Prevent self-deactivation
    if (mirrorUser.email === currentUserEmail) {
      return NextResponse.json(
        { error: "Cannot deactivate your own account" },
        { status: 400 }
      );
    }

    // RBAC: Domain Admin can only deactivate users in their domain
    const superAdmin = isSuperAdmin(claims);
    if (!superAdmin) {
      const userInDomain = mirrorUser.domains?.some((d: { domain: string }) => d.domain === claims.domain);
      if (!userInDomain) {
        return NextResponse.json(
          { error: "You can only deactivate users in your domain" },
          { status: 403 }
        );
      }
    }

    // Set deleted_at in Supabase
    const updatedUser = await setMirrorUserDeleted(mirrorUserId, true);

    return NextResponse.json({
      success: true,
      message: "User deactivated successfully",
      userId: mirrorUserId,
      deletedAt: updatedUser.deleted_at,
    });

  } catch (error) {
    console.error("Error in /api/admin/users/[id]/deactivate:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
