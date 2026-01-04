/**
 * API Route: PATCH /api/admin/users/[id]/role
 * 
 * Updates a user's role for a specific domain.
 * Now works purely with Supabase (no Auth0).
 * 
 * Body: { domain: "mesh"|"zonetech"|"zsangola", role: "AGENT"|"DOMAIN_ADMIN" }
 * 
 * RBAC:
 *   - SuperAdmin can update any domain
 *   - Domain Admin can only update users in their domain
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminAccess } from "@/lib/require-admin";
import { isSuperAdmin } from "@/lib/rbac-mesh";
import { getMirrorUserById, setUserDomainRole } from "@/lib/user-mirror";

type ValidDomain = "mesh" | "zonetech" | "zsangola";
const VALID_DOMAINS: ValidDomain[] = ["mesh", "zonetech", "zsangola"];

type ValidRole = "DOMAIN_ADMIN" | "AGENT" | "USER";
const VALID_ROLES: ValidRole[] = ["DOMAIN_ADMIN", "AGENT", "USER"];

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

    // RBAC: Domain Admin can only modify users in their domain
    const superAdmin = isSuperAdmin(claims);
    if (!superAdmin && claims.domain !== domain) {
      return NextResponse.json(
        { error: `Domain Admin can only modify users in their domain (${claims.domain})` },
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

    // Verify user exists in the domain (for Domain Admin)
    if (!superAdmin) {
      const userInDomain = mirrorUser.domains?.some((d: { domain: string }) => d.domain === domain);
      if (!userInDomain) {
        return NextResponse.json(
          { error: "User is not in your domain" },
          { status: 403 }
        );
      }
    }

    // Update Supabase mirror
    await setUserDomainRole(mirrorUserId, domain, role);

    return NextResponse.json({
      success: true,
      message: `Role updated to ${role} for domain ${domain}`,
      userId: mirrorUserId,
      domain,
      role,
    });

  } catch (error) {
    console.error("Error in /api/admin/users/[id]/role:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
