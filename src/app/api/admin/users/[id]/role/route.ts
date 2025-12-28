/**
 * API Route: PATCH /api/admin/users/[id]/role
 * 
 * Updates a user's role for a specific domain.
 * 
 * Body: { domain: "mesh"|"zonetech"|"zsangola", role: "AGENT"|"DOMAIN_ADMIN" }
 * 
 * RBAC:
 *   - SuperAdmin can update any domain
 *   - Domain Admin can only update users in their current org
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminAccess } from "@/lib/require-admin";
import { isSuperAdminAny } from "@/lib/rbac";
import { getAuth0UserById, updateAuth0UserMetadata } from "@/lib/auth0-management";
import { getMirrorUserById, setUserDomainRole } from "@/lib/user-mirror";
import { VALID_DOMAINS, type ValidDomain } from "@/lib/org-map";

type ValidRole = "DOMAIN_ADMIN" | "AGENT";
const VALID_ROLES: ValidRole[] = ["DOMAIN_ADMIN", "AGENT"];

interface RoleUpdateRequest {
  domain: ValidDomain;
  role: ValidRole;
}

export async function PATCH(
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

    const { domain, role } = body;

    // Validate domain
    if (!domain || !VALID_DOMAINS.includes(domain)) {
      return NextResponse.json(
        { error: `Invalid domain. Must be one of: ${VALID_DOMAINS.join(", ")}` },
        { status: 400 }
      );
    }

    // Validate role
    if (!role || !VALID_ROLES.includes(role)) {
      return NextResponse.json(
        { error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}` },
        { status: 400 }
      );
    }

    // RBAC: Domain Admin can only modify users in their org
    const isSuperAdmin = isSuperAdminAny(claims);
    if (!isSuperAdmin && claims.org !== domain) {
      return NextResponse.json(
        { error: `Domain Admin can only modify users in their org (${claims.org})` },
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

    // Verify user exists in their domain (for Domain Admin)
    if (!isSuperAdmin) {
      const userInDomain = mirrorUser.domains.some(d => d.domain === domain);
      if (!userInDomain) {
        return NextResponse.json(
          { error: "User is not in your domain" },
          { status: 403 }
        );
      }
    }

    // Get current Auth0 user
    const auth0User = await getAuth0UserById(mirrorUser.auth0_user_id);

    // Update Auth0 app_metadata
    const existingBwb = (auth0User.app_metadata?.bwb as Record<string, unknown>) || {};
    const existingOrgRoles = (existingBwb.org_roles as Record<string, string[]>) || {};
    
    // Set new roles for the domain
    const newRoles = role === "DOMAIN_ADMIN" ? ["DOMAIN_ADMIN", "AGENT"] : ["AGENT"];
    const updatedOrgRoles = {
      ...existingOrgRoles,
      [domain]: newRoles,
    };

    const updatedAppMetadata = {
      bwb: {
        ...existingBwb,
        org_roles: updatedOrgRoles,
      },
    };

    await updateAuth0UserMetadata(mirrorUser.auth0_user_id, updatedAppMetadata);

    // Update Supabase mirror
    await setUserDomainRole(mirrorUserId, domain, role);

    return NextResponse.json({
      success: true,
      message: `Role updated to ${role} for domain ${domain}`,
      userId: mirrorUserId,
      domain,
      roles: newRoles,
    });

  } catch (error) {
    console.error("Error in /api/admin/users/[id]/role:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
