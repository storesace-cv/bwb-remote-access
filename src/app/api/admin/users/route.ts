/**
 * API Route: /api/admin/users
 * 
 * Lists users from the Supabase mirror.
 * Protected by RBAC - requires admin access.
 * 
 * Query params:
 *   - domain: Filter by domain (mesh|zonetech|zsangola)
 *   - limit: Max results (default 50, max 100)
 *   - offset: Pagination offset (default 0)
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminAccess } from "@/lib/require-admin";
import { isSuperAdminAny } from "@/lib/rbac";
import { listMirrorUsers } from "@/lib/user-mirror";

type ValidDomain = "mesh" | "zonetech" | "zsangola";
const VALID_DOMAINS: ValidDomain[] = ["mesh", "zonetech", "zsangola"];

export async function GET(req: NextRequest) {
  try {
    // Check admin access
    const { authorized, claims } = await checkAdminAccess();

    if (!authorized) {
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

    // Determine which domain to filter by
    let filterDomain: ValidDomain | null = null;

    if (isSuperAdminAny(claims)) {
      // SuperAdmin can filter by any domain or see all
      if (requestedDomain && VALID_DOMAINS.includes(requestedDomain)) {
        filterDomain = requestedDomain;
      }
      // If no domain specified, show all users
    } else {
      // Domain Admin can only see their own org
      if (claims.org && VALID_DOMAINS.includes(claims.org as ValidDomain)) {
        filterDomain = claims.org as ValidDomain;
      } else {
        // No valid org - return empty
        return NextResponse.json({
          users: [],
          total: 0,
          limit,
          offset,
          domain: null,
        });
      }
    }

    // Fetch users from mirror
    const { users, total } = await listMirrorUsers({
      domain: filterDomain,
      limit,
      offset,
      includeDeleted: false,
    });

    // Transform for response
    const responseUsers = users.map((user) => ({
      id: user.id,
      auth0UserId: user.auth0_user_id,
      email: user.email,
      displayName: user.display_name,
      isSuperAdminMeshCentral: user.is_superadmin_meshcentral,
      isSuperAdminRustDesk: user.is_superadmin_rustdesk,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
      domains: user.domains.map((d) => ({
        domain: d.domain,
        role: d.role,
      })),
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
