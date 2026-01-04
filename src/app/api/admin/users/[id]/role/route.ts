/**
 * API Route: PATCH /api/admin/users/[id]/role
 * 
 * Updates a user's user_type in mesh_users.
 * 
 * Body: { user_type: "agent"|"colaborador"|"candidato"|"inactivo" }
 * 
 * RBAC:
 *   - SuperAdmin can update any user
 *   - Domain Admin can only update users in their domain
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminAccess } from "@/lib/require-admin";
import { isSuperAdmin } from "@/lib/rbac-mesh";
import { getMirrorUserById, setUserType } from "@/lib/user-mirror";
import type { UserType } from "@/lib/supabase-admin";

const VALID_USER_TYPES: UserType[] = ["agent", "colaborador", "candidato", "inactivo"];

interface RoleUpdateRequest {
  user_type: UserType;
}

export async function PATCH(
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

    // Parse request body
    let body: RoleUpdateRequest;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const { user_type } = body;

    // Validate user_type
    if (!user_type || !VALID_USER_TYPES.includes(user_type)) {
      return NextResponse.json(
        { error: `Invalid user_type. Must be one of: ${VALID_USER_TYPES.join(", ")}` },
        { status: 400 }
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

    // RBAC: Domain Admin can only modify users in their domain
    const superAdmin = isSuperAdmin(claims);
    if (!superAdmin && user.domain !== claims.domain) {
      return NextResponse.json(
        { error: `Domain Admin can only modify users in their domain (${claims.domain})` },
        { status: 403 }
      );
    }

    // Update user_type
    const updatedUser = await setUserType(userId, user_type);

    return NextResponse.json({
      success: true,
      message: `User type updated to ${user_type}`,
      userId,
      userType: updatedUser.user_type,
    });

  } catch (error) {
    console.error("Error in /api/admin/users/[id]/role:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
