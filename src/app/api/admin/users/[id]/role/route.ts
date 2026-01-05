/**
 * API Route: PATCH /api/admin/users/[id]/role
 * 
 * Updates a user's user_type in mesh_users.
 * 
 * Body: { user_type: "siteadmin"|"minisiteadmin"|"agent"|"colaborador"|"inactivo"|"candidato" }
 * 
 * RBAC:
 *   - User can only assign types at or below their own level
 *   - siteadmin can assign any type
 *   - minisiteadmin can assign: minisiteadmin, agent, colaborador, inactivo, candidato
 *   - agent can assign: agent, colaborador, inactivo, candidato
 *   - Domain restriction: non-siteadmin can only modify users in their domain
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminAccess } from "@/lib/require-admin";
import { isSuperAdmin } from "@/lib/rbac-mesh";
import { getMirrorUserById, setUserType } from "@/lib/user-mirror";
import type { UserType } from "@/lib/supabase-admin";

// User type hierarchy (lower index = higher privilege)
const USER_TYPE_HIERARCHY: UserType[] = [
  "siteadmin",
  "minisiteadmin",
  "agent",
  "colaborador",
  "inactivo",
  "candidato",
];

/**
 * Get the types a user can assign based on their own type
 */
function getAllowedTypesToAssign(userType: UserType): UserType[] {
  const userIndex = USER_TYPE_HIERARCHY.indexOf(userType);
  if (userIndex === -1) return [];
  // Can assign their own level and below
  return USER_TYPE_HIERARCHY.slice(userIndex);
}

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

    // Get allowed types for current user
    const allowedTypes = getAllowedTypesToAssign(claims.userType);

    // Validate user_type is in allowed list
    if (!user_type || !allowedTypes.includes(user_type)) {
      return NextResponse.json(
        { 
          error: `Não pode atribuir o tipo '${user_type}'. Tipos permitidos: ${allowedTypes.join(", ")}`,
          allowedTypes 
        },
        { status: 403 }
      );
    }

    // Get the target user
    const user = await getMirrorUserById(userId);
    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // RBAC: Check if current user can modify target user's type
    const targetUserIndex = USER_TYPE_HIERARCHY.indexOf(user.user_type);
    const currentUserIndex = USER_TYPE_HIERARCHY.indexOf(claims.userType);
    
    // Cannot modify users with higher or equal privilege (except self-demotion isn't allowed either)
    if (targetUserIndex < currentUserIndex) {
      return NextResponse.json(
        { error: `Não pode modificar utilizadores com privilégio superior ao seu (${user.user_type})` },
        { status: 403 }
      );
    }

    // RBAC: Domain restriction (non-siteadmin can only modify users in their domain)
    const superAdmin = isSuperAdmin(claims);
    if (!superAdmin && user.domain !== claims.domain) {
      return NextResponse.json(
        { error: `Apenas pode modificar utilizadores no seu domínio (${claims.domain})` },
        { status: 403 }
      );
    }

    // Update user_type
    const updatedUser = await setUserType(userId, user_type);

    console.log(`[ADMIN] User ${claims.email} changed ${user.email} type from ${user.user_type} to ${user_type}`);

    return NextResponse.json({
      success: true,
      message: `Tipo de utilizador alterado para ${user_type}`,
      userId,
      userType: updatedUser.user_type,
    });

  } catch (error) {
    console.error("Error in /api/admin/users/[id]/role:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
