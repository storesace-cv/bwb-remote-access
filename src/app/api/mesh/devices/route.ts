/**
 * API Route: GET /api/mesh/devices
 * 
 * Lists MeshCentral devices from Supabase mirror.
 * Requires Auth0 session with org role.
 * 
 * Query params:
 *   - domain: Filter by domain (mesh|zonetech|zsangola) - SuperAdmin only
 *   - meshId: Filter by device group
 *   - limit: Max results (default 50, max 200)
 *   - offset: Pagination offset
 */

import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { getClaimsFromAuth0Session, isSuperAdminAny } from "@/lib/rbac";
import { listMeshDevices, listMeshGroups } from "@/lib/meshcentral-mirror";

type ValidDomain = "mesh" | "zonetech" | "zsangola";
const VALID_DOMAINS: ValidDomain[] = ["mesh", "zonetech", "zsangola"];

export async function GET(req: NextRequest) {
  try {
    // Get Auth0 session
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized - Auth0 session required" },
        { status: 401 }
      );
    }

    const claims = getClaimsFromAuth0Session(session);
    const isSuperAdmin = isSuperAdminAny(claims);

    // Check if user has any org role
    const hasOrgRole = 
      isSuperAdmin || 
      (claims.org && Object.keys(claims.orgRoles).length > 0);

    if (!hasOrgRole) {
      return NextResponse.json(
        { error: "Unauthorized - org role required to view devices" },
        { status: 403 }
      );
    }

    // Parse query params
    const { searchParams } = new URL(req.url);
    const requestedDomain = searchParams.get("domain") as ValidDomain | null;
    const meshId = searchParams.get("meshId");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    // Determine domain filter
    let filterDomain: ValidDomain | null = null;

    if (isSuperAdmin) {
      // SuperAdmin can filter by any domain or see all
      if (requestedDomain && VALID_DOMAINS.includes(requestedDomain)) {
        filterDomain = requestedDomain;
      }
    } else {
      // Non-superadmin must be scoped to their org
      if (claims.org && VALID_DOMAINS.includes(claims.org as ValidDomain)) {
        filterDomain = claims.org as ValidDomain;
      } else {
        return NextResponse.json({
          groups: [],
          devices: [],
          total: 0,
          limit,
          offset,
          domain: null,
        });
      }
    }

    // Fetch groups for the domain
    const { groups } = await listMeshGroups({ domain: filterDomain });

    // Fetch devices
    const { devices, total } = await listMeshDevices({
      domain: filterDomain,
      meshId,
      includeDeleted: false,
      limit,
      offset,
    });

    // Transform for response
    const responseDevices = devices.map((d) => ({
      id: d.id,
      nodeId: d.node_id,
      domain: d.domain,
      meshId: d.mesh_id,
      hostname: d.hostname,
      osDescription: d.os_description,
      agentVersion: d.agent_version,
      ipLocal: d.ip_local,
      ipPublic: d.ip_public,
      lastConnect: d.last_connect,
      groupName: d.group_name,
    }));

    const responseGroups = groups.map((g) => ({
      id: g.id,
      meshId: g.mesh_id,
      domain: g.domain,
      name: g.name,
    }));

    return NextResponse.json({
      groups: responseGroups,
      devices: responseDevices,
      total,
      limit,
      offset,
      domain: filterDomain,
    });

  } catch (error) {
    console.error("Error in /api/mesh/devices:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
