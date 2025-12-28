/**
 * API Route: POST /api/admin/users/[id]/deactivate
 * 
 * Deactivates a user by setting Auth0 blocked=true and mirror deleted_at.
 * 
 * RBAC:
 *   - SuperAdmin can deactivate any user
 *   - Domain Admin can only deactivate users in their current org
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminAccess } from "@/lib/require-admin";
import { isSuperAdminAny } from "@/lib/rbac";
import { setAuth0UserBlocked } from "@/lib/auth0-management";
import { getMirrorUserById, setMirrorUserDeleted } from "@/lib/user-mirror";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: mirrorUserId } = await params;

    // Check admin access
    const { authorized, claims, email: currentUserEmail } = await checkAdminAccess();
    if (!authorized) {
      return NextResponse.json(
        { error: "Unauthorized - admin access required" },
        { status: 403 }
      );
    }

    // Get the mirror user
    const mirrorUser = await getMirrorUserById(mirrorUserId);
    if (!mirrorUser) {
      return NextResponse.json(
        { error: "User not found in mirror" },
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

    // RBAC: Domain Admin can only deactivate users in their org
    const isSuperAdmin = isSuperAdminAny(claims);
    if (!isSuperAdmin) {
      const userInDomain = mirrorUser.domains.some(d => d.domain === claims.org);
      if (!userInDomain) {
        return NextResponse.json(
          { error: "You can only deactivate users in your domain" },
          { status: 403 }
        );
      }
    }

    // Set Auth0 blocked=true
    await setAuth0UserBlocked(mirrorUser.auth0_user_id, true);

    // Set mirror deleted_at
    const updatedUser = await setMirrorUserDeleted(mirrorUserId, true);

    return NextResponse.json({
      success: true,
      message: "User deactivated successfully",
      userId: mirrorUserId,
      blocked: true,
      deletedAt: updatedUser.deleted_at,
    });

  } catch (error) {
    console.error("Error in /api/admin/users/[id]/deactivate:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
