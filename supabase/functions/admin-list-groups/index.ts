// Version: 2025-12-23T02:40:00Z - Enhanced permission counting with detailed logging
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function fetchSupabaseJson(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; ok: boolean; data: unknown; text: string }> {
  const url = `${SUPABASE_URL}${path}`;
  const resp = await fetch(url, init);
  const text = await resp.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { status: resp.status, ok: resp.ok, data, text };
}

async function handler(req: Request): Promise<Response> {
  // CRITICAL: Handle OPTIONS first, before ANY other code
  if (req.method === "OPTIONS") {
    console.log("[admin-list-groups] OPTIONS preflight request");
    return new Response("ok", { headers: corsHeaders });
  }

  // Wrap entire handler in try-catch to ensure errors return CORS headers
  try {
    if (req.method !== "GET") {
      console.log(`[admin-list-groups] Invalid method: ${req.method}`);
      return jsonResponse({ error: "method_not_allowed" }, 405);
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("[admin-list-groups] Missing Supabase env vars");
      return jsonResponse(
        {
          error: "config_error",
          message: "Missing Supabase configuration",
        },
        500,
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("[admin-list-groups] Missing Authorization header");
      return jsonResponse(
        {
          error: "unauthorized",
          message: "Missing or invalid Authorization header",
        },
        401,
      );
    }

    const jwt = authHeader.substring(7);

    // Validate JWT using service role key to bypass RLS
    const authCheck = await fetchSupabaseJson(
      `/auth/v1/user`,
      {
        headers: {
          Authorization: `Bearer ${jwt}`,
          apikey: SUPABASE_SERVICE_ROLE_KEY,
        },
      },
    );

    if (!authCheck.ok) {
      console.error(
        "[admin-list-groups] JWT validation failed:",
        authCheck.status,
        authCheck.text,
      );
      return jsonResponse(
        {
          error: "unauthorized",
          message: "Invalid or expired token",
        },
        401,
      );
    }

    const user = authCheck.data as { id?: string } | null;
    const authUserId = user?.id;

    if (!authUserId) {
      console.log("[admin-list-groups] No user ID in token");
      return jsonResponse(
        {
          error: "unauthorized",
          message: "Invalid user",
        },
        401,
      );
    }

    console.log(`[admin-list-groups] Caller auth_user_id: ${authUserId}`);

    // Get caller's mesh_user record to check user_type and agent_id
    const callerCheck = await fetchSupabaseJson(
      `/rest/v1/mesh_users?select=user_type,domain,agent_id&auth_user_id=eq.${authUserId}`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          Accept: "application/json",
        },
      },
    );

    if (!callerCheck.ok) {
      console.error(
        "[admin-list-groups] Failed to get caller info:",
        callerCheck.status,
        callerCheck.text,
      );
      return jsonResponse(
        {
          error: "forbidden",
          message: "Failed to verify user permissions",
        },
        403,
      );
    }

    const callerData = Array.isArray(callerCheck.data) ? callerCheck.data : [];
    if (callerData.length === 0) {
      console.log("[admin-list-groups] No mesh_user record found for auth_user_id:", authUserId);
      return jsonResponse(
        {
          error: "forbidden",
          message: "User not found in mesh_users table",
        },
        403,
      );
    }

    const callerRecord = callerData[0] as { user_type?: string; domain?: string; agent_id?: string };
    const userType = callerRecord.user_type;
    const agentId = callerRecord.agent_id ?? null;

    console.log(`[admin-list-groups] Caller user_type: ${userType}, agent_id: ${agentId}`);

    // Check if user is siteadmin, minisiteadmin, agent, or collaborator
    const isSiteadmin = userType === "siteadmin";
    const isMinisiteadmin = userType === "minisiteadmin";
    const isAgent = userType === "agent";
    const isCollaborator = userType === "colaborador";

    if (!isSiteadmin && !isMinisiteadmin && !isAgent && !isCollaborator) {
      console.log(`[admin-list-groups] Access denied: user_type=${userType}`);
      return jsonResponse(
        {
          error: "forbidden",
          message: "Only siteadmins, minisiteadmins, agents, and collaborators can access this endpoint",
        },
        403,
      );
    }

    console.log(`[admin-list-groups] Access granted: user_type=${userType}`);

    // Build query based on role
    let queryUrl = `/rest/v1/mesh_groups?select=id,name,description,path,level,parent_group_id,owner_user_id,agent_id,created_at,updated_at&deleted_at=is.null&order=path.asc`;

    // Role-based filtering by agent_id
    if ((isMinisiteadmin || isAgent || isCollaborator) && agentId) {
      console.log(`[admin-list-groups] Filtering by agent_id: ${agentId}`);
      queryUrl += `&agent_id=eq.${encodeURIComponent(agentId)}`;
    }

    const groupsQuery = await fetchSupabaseJson(
      queryUrl,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          Accept: "application/json",
        },
      },
    );

    if (!groupsQuery.ok) {
      console.error(
        "[admin-list-groups] Error fetching mesh_groups:",
        groupsQuery.status,
        groupsQuery.text,
      );
      return jsonResponse(
        {
          error: "database_error",
          message: "Failed to fetch groups",
          details: groupsQuery.text,
        },
        502,
      );
    }

    const groups = Array.isArray(groupsQuery.data) ? groupsQuery.data : [];
    console.log(`[admin-list-groups] Found ${groups.length} groups`);

    // Enrich groups with device_count and permission_count
    if (groups.length > 0) {
      const groupIds = groups.map((g: { id: string }) => g.id);
      console.log(`[admin-list-groups] Group IDs to enrich:`, groupIds);
      
      // Get device counts per group
      const deviceQuery = await fetchSupabaseJson(
        `/rest/v1/android_devices?select=group_id&deleted_at=is.null&group_id=in.(${groupIds.join(",")})`,
        {
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            Accept: "application/json",
          },
        },
      );

      let deviceCounts: Record<string, number> = {};
      
      if (deviceQuery.ok && Array.isArray(deviceQuery.data)) {
        deviceCounts = deviceQuery.data.reduce((acc: Record<string, number>, device: { group_id: string }) => {
          if (device.group_id) {
            acc[device.group_id] = (acc[device.group_id] || 0) + 1;
          }
          return acc;
        }, {});
        console.log(`[admin-list-groups] Device counts:`, deviceCounts);
      } else {
        console.error("[admin-list-groups] Failed to fetch devices:", deviceQuery.status, deviceQuery.text);
      }

      // CRITICAL: Get permission counts per group (only count active permissions where revoked_at is null)
      console.log(`[admin-list-groups] Fetching permissions for groups:`, groupIds);
      
      const permissionQueryUrl = `/rest/v1/mesh_group_permissions?select=group_id&revoked_at=is.null&group_id=in.(${groupIds.join(",")})`;
      console.log(`[admin-list-groups] Permission query URL:`, permissionQueryUrl);
      
      const permissionQuery = await fetchSupabaseJson(
        permissionQueryUrl,
        {
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            Accept: "application/json",
          },
        },
      );

      let permissionCounts: Record<string, number> = {};
      
      console.log(`[admin-list-groups] Permission query status: ${permissionQuery.status}, ok: ${permissionQuery.ok}`);
      
      if (permissionQuery.ok && Array.isArray(permissionQuery.data)) {
        console.log(`[admin-list-groups] Permission query returned ${permissionQuery.data.length} records`);
        console.log(`[admin-list-groups] Permission raw data:`, JSON.stringify(permissionQuery.data));
        
        permissionCounts = permissionQuery.data.reduce((acc: Record<string, number>, perm: { group_id: string }) => {
          if (perm.group_id) {
            acc[perm.group_id] = (acc[perm.group_id] || 0) + 1;
          }
          return acc;
        }, {});
        console.log(`[admin-list-groups] Permission counts after reduce:`, permissionCounts);
      } else {
        console.error("[admin-list-groups] Failed to fetch permissions:", permissionQuery.status, permissionQuery.text);
        console.error("[admin-list-groups] Permission query data:", permissionQuery.data);
      }

      // Enrich groups with counts
      const enrichedGroups = groups.map((group: { id: string; name: string }) => {
        const enriched = {
          ...group,
          device_count: deviceCounts[group.id] || 0,
          permission_count: permissionCounts[group.id] || 0,
        };
        console.log(`[admin-list-groups] Group "${group.name}" (${group.id}): devices=${enriched.device_count}, permissions=${enriched.permission_count}`);
        return enriched;
      });

      console.log(`[admin-list-groups] Returning ${enrichedGroups.length} enriched groups`);

      return jsonResponse(
        {
          success: true,
          groups: enrichedGroups,
          count: enrichedGroups.length,
          user_type: userType,
        } as Record<string, unknown>,
        200,
      );
    }

    // No groups found - return empty array with counts
    console.log("[admin-list-groups] No groups found, returning empty array");
    return jsonResponse(
      {
        success: true,
        groups: [],
        count: 0,
        user_type: userType,
      } as Record<string, unknown>,
      200,
    );
  } catch (err) {
    // CRITICAL: Catch all errors and return with CORS headers
    console.error("[admin-list-groups] Unhandled error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(
      { error: "internal_error", message },
      500,
    );
  }
}

serve(handler);