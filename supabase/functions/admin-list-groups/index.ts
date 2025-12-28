// Sprint 1: Security Hardening - Centralized auth + structured logging
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  validateJwt,
  createLogger,
  generateCorrelationId,
  jsonResponse,
  authErrorResponse,
  defaultCorsHeaders,
} from "../_shared/auth.ts";

const corsHeaders = {
  ...defaultCorsHeaders,
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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
  const correlationId = generateCorrelationId();
  const logger = createLogger("admin-list-groups", correlationId);

  if (req.method === "OPTIONS") {
    logger.info("OPTIONS preflight request");
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "GET") {
      logger.warn("Invalid method", { method: req.method });
      return jsonResponse({ error: "method_not_allowed" }, 405, corsHeaders);
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      logger.error("Missing Supabase configuration");
      return jsonResponse(
        { error: "config_error", message: "Missing Supabase configuration" },
        500,
        corsHeaders,
      );
    }

    // Validate JWT using centralized auth
    const authHeader = req.headers.get("Authorization");
    const authResult = await validateJwt(authHeader, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, logger);

    if (!authResult.ok) {
      return authErrorResponse(authResult, corsHeaders);
    }

    const authUserId = authResult.context.authUserId;
    if (!authUserId) {
      logger.warn("No user ID in token");
      return jsonResponse(
        { error: "unauthorized", message: "Invalid user" },
        401,
        corsHeaders,
      );
    }

    logger.info("User authenticated", undefined, authUserId);

    // Get caller's mesh_user record
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
      logger.error("Failed to get caller info", { status: callerCheck.status }, authUserId);
      return jsonResponse(
        { error: "forbidden", message: "Failed to verify user permissions" },
        403,
        corsHeaders,
      );
    }

    const callerData = Array.isArray(callerCheck.data) ? callerCheck.data : [];
    if (callerData.length === 0) {
      logger.warn("No mesh_user record found", undefined, authUserId);
      return jsonResponse(
        { error: "forbidden", message: "User not found in mesh_users table" },
        403,
        corsHeaders,
      );
    }

    const callerRecord = callerData[0] as { user_type?: string; domain?: string; agent_id?: string };
    const userType = callerRecord.user_type;
    const agentId = callerRecord.agent_id ?? null;

    logger.info("Caller info", { user_type: userType, agent_id: agentId }, authUserId);

    // Check permissions
    const isSiteadmin = userType === "siteadmin";
    const isMinisiteadmin = userType === "minisiteadmin";
    const isAgent = userType === "agent";
    const isCollaborator = userType === "colaborador";

    if (!isSiteadmin && !isMinisiteadmin && !isAgent && !isCollaborator) {
      logger.warn("Access denied", { user_type: userType }, authUserId);
      return jsonResponse(
        { error: "forbidden", message: "Only siteadmins, minisiteadmins, agents, and collaborators can access this endpoint" },
        403,
        corsHeaders,
      );
    }

    logger.info("Access granted", { user_type: userType }, authUserId);

    // Build query based on role
    let queryUrl = `/rest/v1/mesh_groups?select=id,name,description,path,level,parent_group_id,owner_user_id,agent_id,created_at,updated_at&deleted_at=is.null&order=path.asc`;

    if ((isMinisiteadmin || isAgent || isCollaborator) && agentId) {
      logger.info("Filtering by agent_id", { agent_id: agentId }, authUserId);
      queryUrl += `&agent_id=eq.${encodeURIComponent(agentId)}`;
    }

    const groupsQuery = await fetchSupabaseJson(queryUrl, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Accept: "application/json",
      },
    });

    if (!groupsQuery.ok) {
      logger.error("Error fetching mesh_groups", { status: groupsQuery.status }, authUserId);
      return jsonResponse(
        { error: "database_error", message: "Failed to fetch groups", details: groupsQuery.text },
        502,
        corsHeaders,
      );
    }

    const groups = Array.isArray(groupsQuery.data) ? groupsQuery.data : [];
    logger.info("Groups fetched", { count: groups.length }, authUserId);

    // Enrich groups with device_count and permission_count
    if (groups.length > 0) {
      const groupIds = groups.map((g: { id: string }) => g.id);

      // Get device counts
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
      }

      // Get permission counts
      const permissionQuery = await fetchSupabaseJson(
        `/rest/v1/mesh_group_permissions?select=group_id&revoked_at=is.null&group_id=in.(${groupIds.join(",")})`,
        {
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            Accept: "application/json",
          },
        },
      );

      let permissionCounts: Record<string, number> = {};
      if (permissionQuery.ok && Array.isArray(permissionQuery.data)) {
        permissionCounts = permissionQuery.data.reduce((acc: Record<string, number>, perm: { group_id: string }) => {
          if (perm.group_id) {
            acc[perm.group_id] = (acc[perm.group_id] || 0) + 1;
          }
          return acc;
        }, {});
      }

      // Enrich groups
      const enrichedGroups = groups.map((group: { id: string; name: string }) => ({
        ...group,
        device_count: deviceCounts[group.id] || 0,
        permission_count: permissionCounts[group.id] || 0,
      }));

      logger.info("Returning enriched groups", { count: enrichedGroups.length }, authUserId);

      return jsonResponse(
        { success: true, groups: enrichedGroups, count: enrichedGroups.length, user_type: userType } as Record<string, unknown>,
        200,
        corsHeaders,
      );
    }

    logger.info("No groups found", undefined, authUserId);
    return jsonResponse(
      { success: true, groups: [], count: 0, user_type: userType } as Record<string, unknown>,
      200,
      corsHeaders,
    );
  } catch (err) {
    logger.error("Unhandled error", { error: err instanceof Error ? err.message : String(err) });
    return jsonResponse(
      { error: "internal_error", message: err instanceof Error ? err.message : String(err) },
      500,
      corsHeaders,
    );
  }
}

serve(handler);
