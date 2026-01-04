/**
 * API Route: /api/admin/users
 * 
 * Lists users from mesh_users table.
 * Protected by RBAC - requires admin access.
 * 
 * Query params:
 *   - domain: Filter by domain (mesh|zonetech|zsangola)
 *   - limit: Max results (default 50, max 100)
 *   - offset: Pagination offset (default 0)
 *   - includeDeleted: Include deactivated users (default false)
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminAccess } from "@/lib/require-admin";
import { isSuperAdmin, type ValidDomain, VALID_DOMAINS } from "@/lib/rbac-mesh";
import { listMirrorUsers } from "@/lib/user-mirror";

export async function GET(req: NextRequest) {
  try {
    // Check admin access
    const { authorized, claims } = await checkAdminAccess();

    if (!authorized || !claims) {
      return NextResponse.json(
        { error: "Unauthorized - admin access required" },
        { status: 403 }
      );
    }

    // Parse query params
    const { searchParams } = new URL(req.url);
    const requestedDomain = searchParams.get("domain") as ValidDomain | null;
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const includeDeleted = searchParams.get("includeDeleted") === "true";

    // Determine which domain to filter by
    let filterDomain: ValidDomain | null = null;

    if (isSuperAdmin(claims)) {
      // SuperAdmin can filter by any domain or see all
      if (requestedDomain && VALID_DOMAINS.includes(requestedDomain)) {
        filterDomain = requestedDomain;
      }
    } else {
      // Domain Admin can only see their own domain
      if (claims.domain && VALID_DOMAINS.includes(claims.domain as ValidDomain)) {
        filterDomain = claims.domain as ValidDomain;
      } else {
        return NextResponse.json({
          users: [],
          total: 0,
          limit,
          offset,
          domain: null,
        });
      }
    }

    // Fetch users from mesh_users table
    const { users, total } = await listMirrorUsers({
      domain: filterDomain,
      limit,
      offset,
      includeDeleted,
    });

    // Transform for response
    const responseUsers = users.map((user) => ({
      id: user.id,
      meshUsername: user.mesh_username,
      email: user.email,
      displayName: user.display_name || user.name,
      userType: user.user_type,
      domain: user.domain,
      agentId: user.agent_id,
      disabled: user.disabled,
      siteadmin: user.siteadmin,
      domainadmin: user.domainadmin,
      createdAt: user.created_at,
      deletedAt: user.deleted_at,
    }));

    return NextResponse.json({
      users: responseUsers,
      total,
      limit,
      offset,
      domain: filterDomain,
    });
  } catch (error) {
    console.error("Error in /api/admin/users:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
