// Version: 2025-12-22T23:59:00Z - Added siteadmin support
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
    console.log("[admin-list-collaborators] OPTIONS preflight request");
    return new Response("ok", { headers: corsHeaders });
  }

  // Wrap entire handler in try-catch to ensure errors return CORS headers
  try {
    if (req.method !== "GET") {
      console.log(`[admin-list-collaborators] Invalid method: ${req.method}`);
      return jsonResponse({ error: "method_not_allowed" }, 405);
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("[admin-list-collaborators] Missing Supabase env vars");
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
      console.log("[admin-list-collaborators] Missing Authorization header");
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
        "[admin-list-collaborators] JWT validation failed:",
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
      console.log("[admin-list-collaborators] No user ID in token");
      return jsonResponse(
        {
          error: "unauthorized",
          message: "Invalid user",
        },
        401,
      );
    }

    console.log(`[admin-list-collaborators] Caller auth_user_id: ${authUserId}`);

    // Get caller's mesh_user record to check user_type and agent_id
    const callerCheck = await fetchSupabaseJson(
      `/rest/v1/mesh_users?select=id,user_type,domain,agent_id&auth_user_id=eq.${authUserId}`,
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
        "[admin-list-collaborators] Failed to get caller info:",
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
      console.log(
        "[admin-list-collaborators] No mesh_user record found for auth_user_id:",
        authUserId,
      );
      return jsonResponse(
        {
          error: "forbidden",
          message: "User not found in mesh_users table",
        },
        403,
      );
    }

    const callerRecord = callerData[0] as {
      id?: string;
      user_type?: string;
      domain?: string;
      agent_id?: string;
    };
    const callerId = callerRecord.id;
    const userType = callerRecord.user_type;
    const domain = callerRecord.domain;

    console.log(
      `[admin-list-collaborators] Caller user_type: ${userType}, domain: ${domain}`,
    );

    // Check if user is siteadmin, agent or minisiteadmin
    const isSiteadmin = userType === "siteadmin";
    const isAgent = userType === "agent";
    const isMinisiteadmin = userType === "minisiteadmin";

    if (!isSiteadmin && !isAgent && !isMinisiteadmin) {
      console.log(
        `[admin-list-collaborators] Access denied: user_type=${userType}`,
      );
      return jsonResponse(
        {
          error: "forbidden",
          message: "Only siteadmins, agents and minisiteadmins can list collaborators",
        },
        403,
      );
    }

    console.log(`[admin-list-collaborators] Access granted: user_type=${userType}`);

    // Build query based on role
    let queryUrl = `/rest/v1/mesh_users?select=id,mesh_username,email,display_name,user_type,parent_agent_id,domain,created_at&user_type=eq.colaborador&order=created_at.desc`;

    // Filter by domain for minisiteadmin, by parent_agent_id for agent
    // Siteadmin sees ALL collaborators (no filter)
    if (isMinisiteadmin) {
      console.log(
        `[admin-list-collaborators] Filtering by domain: ${domain}`,
      );
      queryUrl += `&domain=eq.${encodeURIComponent(domain ?? "")}`;
    } else if (isAgent) {
      // Agent: filter by parent_agent_id
      console.log(
        `[admin-list-collaborators] Filtering by parent_agent_id: ${callerId}`,
      );
      queryUrl += `&parent_agent_id=eq.${encodeURIComponent(callerId ?? "")}`;
    } else if (isSiteadmin) {
      // Siteadmin: no filter, sees all collaborators
      console.log("[admin-list-collaborators] Siteadmin: no filter applied");
    }

    const collaboratorsQuery = await fetchSupabaseJson(
      queryUrl,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          Accept: "application/json",
        },
      },
    );

    if (!collaboratorsQuery.ok) {
      console.error(
        "[admin-list-collaborators] Error fetching collaborators:",
        collaboratorsQuery.status,
        collaboratorsQuery.text,
      );
      return jsonResponse(
        {
          error: "database_error",
          message: "Failed to fetch collaborators",
          details: collaboratorsQuery.text,
        },
        502,
      );
    }

    const collaborators = Array.isArray(collaboratorsQuery.data)
      ? collaboratorsQuery.data
      : [];
    console.log(`[admin-list-collaborators] Found ${collaborators.length} collaborators`);

    // Get permission counts per collaborator
    if (collaborators.length > 0) {
      const collaboratorIds = collaborators.map((c: { id: string }) => c.id);

      const permissionsQuery = await fetchSupabaseJson(
        `/rest/v1/mesh_group_permissions?select=collaborator_id&collaborator_id=in.(${collaboratorIds.join(",")})&revoked_at=is.null`,
        {
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            Accept: "application/json",
          },
        },
      );

      if (permissionsQuery.ok && Array.isArray(permissionsQuery.data)) {
        const countMap = permissionsQuery.data.reduce(
          (acc: Record<string, number>, perm: { collaborator_id: string }) => {
            acc[perm.collaborator_id] = (acc[perm.collaborator_id] || 0) + 1;
            return acc;
          },
          {},
        );

        const enrichedCollaborators = collaborators.map(
          (collab: { id: string }) => ({
            ...collab,
            active_permission_count: countMap[collab.id] || 0,
          }),
        );

        return jsonResponse(
          {
            success: true,
            collaborators: enrichedCollaborators,
            count: enrichedCollaborators.length,
          } as Record<string, unknown>,
          200,
        );
      }
    }

    return jsonResponse(
      {
        success: true,
        collaborators: collaborators.map((collab) => ({
          ...collab,
          active_permission_count: 0,
        })),
        count: collaborators.length,
      } as Record<string, unknown>,
      200,
    );
  } catch (err) {
    // CRITICAL: Catch all errors and return with CORS headers
    console.error("[admin-list-collaborators] Unhandled error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(
      { error: "internal_error", message },
      500,
    );
  }
}

serve(handler);