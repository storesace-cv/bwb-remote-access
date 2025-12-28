/**
 * API Route: POST /api/admin/users/[id]/resync
 * 
 * Resyncs a user from Auth0 into the Supabase mirror.
 * Fetches latest data from Auth0 and updates all mirror fields.
 * 
 * RBAC:
 *   - SuperAdmin can resync any user
 *   - Domain Admin can only resync users in their current org
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminAccess } from "@/lib/require-admin";
import { isSuperAdminAny } from "@/lib/rbac";
import { getAuth0UserById, type Auth0UserWithBlocked } from "@/lib/auth0-management";
import { getMirrorUserById, resyncMirrorUser } from "@/lib/user-mirror";

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

    // Get the mirror user to find Auth0 ID
    const mirrorUser = await getMirrorUserById(mirrorUserId);
    if (!mirrorUser) {
      return NextResponse.json(
        { error: "User not found in mirror" },
        { status: 404 }
      );
    }

    // RBAC: Domain Admin can only resync users in their org
    const isSuperAdmin = isSuperAdminAny(claims);
    if (!isSuperAdmin) {
      const userInDomain = mirrorUser.domains.some(d => d.domain === claims.org);
      if (!userInDomain) {
        return NextResponse.json(
          { error: "You can only resync users in your domain" },
          { status: 403 }
        );
      }
    }

    // Fetch Auth0 user
    const auth0User = await getAuth0UserById(mirrorUser.auth0_user_id) as Auth0UserWithBlocked;

    // Extract data from Auth0 app_metadata
    const bwb = (auth0User.app_metadata?.bwb as Record<string, unknown>) || {};
    const orgRoles = (bwb.org_roles as Record<string, string[]>) || {};
    const isSuperAdminMeshCentral = bwb.superadmin_meshcentral === true;
    const isSuperAdminRustDesk = bwb.superadmin_rustdesk === true;

    // Resync mirror
    const syncedUser = await resyncMirrorUser({
      auth0UserId: auth0User.user_id,
      email: auth0User.email,
      displayName: auth0User.name || auth0User.nickname,
      isSuperAdminMeshCentral,
      isSuperAdminRustDesk,
      orgRoles,
      blocked: auth0User.blocked || false,
    });

    return NextResponse.json({
      success: true,
      message: "User resynced from Auth0",
      user: {
        id: syncedUser.id,
        auth0UserId: syncedUser.auth0_user_id,
        email: syncedUser.email,
        displayName: syncedUser.display_name,
        isSuperAdminMeshCentral: syncedUser.is_superadmin_meshcentral,
        isSuperAdminRustDesk: syncedUser.is_superadmin_rustdesk,
        deletedAt: syncedUser.deleted_at,
        domains: syncedUser.domains.map(d => ({
          domain: d.domain,
          role: d.role,
        })),
      },
    });

  } catch (error) {
    console.error("Error in /api/admin/users/[id]/resync:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
