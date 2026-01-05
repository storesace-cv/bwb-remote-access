/**
 * API Route: GET /api/mesh/devices
 * 
 * Lists MeshCentral devices from Supabase mirror.
 * Requires MeshCentral session.
 * 
 * Query params:
 *   - domain: Filter by domain (mesh|zonetech|zsangola) - SuperAdmin only
 *   - meshId: Filter by device group
 *   - limit: Max results (default 50, max 200)
 *   - offset: Pagination offset
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/mesh-auth";
import { getUserClaims, isSuperAdmin, canAccessDomain, type ValidDomain, VALID_DOMAINS } from "@/lib/rbac-mesh";
import { listMeshDevices, listMeshGroups } from "@/lib/meshcentral-mirror";

export async function GET(req: NextRequest) {
  try {
    // Get session
    const session = await getSession();
    if (!session?.authenticated) {
      return NextResponse.json(
        { error: "Unauthorized - session required" },
        { status: 401 }
      );
    }

    const claims = await getUserClaims(session);
    if (!claims) {
      return NextResponse.json(
        { error: "Unauthorized - invalid session" },
        { status: 401 }
      );
    }

    // Parse query params
    const { searchParams } = new URL(req.url);
    const requestedDomain = searchParams.get("domain") as ValidDomain | null;
    const meshId = searchParams.get("meshId");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    // Determine domain filter with proper authorization check
    let filterDomain: ValidDomain | null = null;

    if (isSuperAdmin(claims)) {
      // SuperAdmin can filter by any domain or see all
      if (requestedDomain && VALID_DOMAINS.includes(requestedDomain)) {
        filterDomain = requestedDomain;
      }
    } else {
      // Non-superadmin is scoped to their domain
      if (claims.domain && VALID_DOMAINS.includes(claims.domain as ValidDomain)) {
        filterDomain = claims.domain as ValidDomain;
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

      // SECURITY: Enforce domain access - if user requested a specific domain, verify access
      if (requestedDomain && requestedDomain !== filterDomain) {
        if (!canAccessDomain(claims, requestedDomain)) {
          console.warn(
            `[SECURITY] User ${claims.email} attempted to access domain ${requestedDomain} but belongs to ${claims.domain}`
          );
          return NextResponse.json(
            { error: "Forbidden - you do not have access to this domain" },
            { status: 403 }
          );
        }
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
