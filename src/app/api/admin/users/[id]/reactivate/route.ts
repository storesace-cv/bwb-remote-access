/**
 * API Route: POST /api/admin/users/[id]/reactivate
 * 
 * Reactivates a user by setting Auth0 blocked=false and clearing mirror deleted_at.
 * 
 * RBAC:
 *   - SuperAdmin can reactivate any user
 *   - Domain Admin can only reactivate users in their current org
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
    const { authorized, claims } = await checkAdminAccess();
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

    // RBAC: Domain Admin can only reactivate users in their org
    const isSuperAdmin = isSuperAdminAny(claims);
    if (!isSuperAdmin) {
      const userInDomain = mirrorUser.domains.some(d => d.domain === claims.org);
      if (!userInDomain) {
        return NextResponse.json(
          { error: "You can only reactivate users in your domain" },
          { status: 403 }
        );
      }
    }

    // Set Auth0 blocked=false
    await setAuth0UserBlocked(mirrorUser.auth0_user_id, false);

    // Clear mirror deleted_at
    const updatedUser = await setMirrorUserDeleted(mirrorUserId, false);

    return NextResponse.json({
      success: true,
      message: "User reactivated successfully",
      userId: mirrorUserId,
      blocked: false,
      deletedAt: updatedUser.deleted_at,
    });

  } catch (error) {
    console.error("Error in /api/admin/users/[id]/reactivate:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
