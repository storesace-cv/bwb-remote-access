// Version: 2025-12-22T21:26:00Z - Re-deploy after syntax fix
// Previous: 2025-12-22T19:38:00Z - Fixed auth pattern to match admin-list-groups (service role key)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface CreateGroupRequest {
  name: string;
  description?: string;
  parent_group_id?: string;
}

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
    console.log("[admin-create-group] OPTIONS preflight request");
    return new Response("ok", { headers: corsHeaders });
  }

  // Wrap entire handler in try-catch to ensure errors return CORS headers
  try {
    if (req.method !== "POST") {
      console.log(`[admin-create-group] Invalid method: ${req.method}`);
      return jsonResponse({ error: "method_not_allowed" }, 405);
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("[admin-create-group] Missing Supabase env vars");
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
      console.log("[admin-create-group] Missing Authorization header");
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
        "[admin-create-group] JWT validation failed:",
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
      console.log("[admin-create-group] No user ID in token");
      return jsonResponse(
        {
          error: "unauthorized",
          message: "Invalid user",
        },
        401,
      );
    }

    console.log(`[admin-create-group] Caller auth_user_id: ${authUserId}`);

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
        "[admin-create-group] Failed to get caller info:",
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
      console.log("[admin-create-group] No mesh_user record found for auth_user_id:", authUserId);
      return jsonResponse(
        {
          error: "forbidden",
          message: "User not found in mesh_users table",
        },
        403,
      );
    }

    const callerRecord = callerData[0] as { id?: string; user_type?: string; domain?: string; agent_id?: string };
    const callerId = callerRecord.id;
    const userType = callerRecord.user_type;
    const agentId = callerRecord.agent_id ?? null;

    console.log(`[admin-create-group] Caller user_type: ${userType}, agent_id: ${agentId}`);

    // Validate user can create groups (agent, minisiteadmin, collaborator, or siteadmin)
    if (!["agent", "minisiteadmin", "colaborador", "siteadmin"].includes(userType ?? "")) {
      console.log(`[admin-create-group] Access denied: user_type=${userType}`);
      return jsonResponse(
        {
          error: "forbidden",
          message: "Only agents, minisiteadmins, siteadmins, and collaborators can create groups",
        },
        403,
      );
    }

    console.log(`[admin-create-group] Access granted: user_type=${userType}`);

    // Parse request body
    const body = await req.json() as CreateGroupRequest;

    if (!body.name || !body.name.trim()) {
      return jsonResponse(
        {
          error: "bad_request",
          message: "name is required",
        },
        400,
      );
    }

    // Normalize name for duplicate detection
    const normalizedName = body.name.trim().toLowerCase().replace(/\s+/g, ' ');

    // If parent_group_id is provided, verify it exists and belongs to the agent's tenant
    if (body.parent_group_id) {
      const parentCheck = await fetchSupabaseJson(
        `/rest/v1/mesh_groups?select=id,agent_id,level&id=eq.${body.parent_group_id}&deleted_at=is.null`,
        {
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            Accept: "application/json",
          },
        },
      );

      if (!parentCheck.ok) {
        console.error("[admin-create-group] Error checking parent group:", parentCheck.status, parentCheck.text);
        return jsonResponse(
          {
            error: "database_error",
            message: "Failed to verify parent group",
          },
          502,
        );
      }

      const parentData = Array.isArray(parentCheck.data) ? parentCheck.data : [];
      if (parentData.length === 0) {
        return jsonResponse(
          {
            error: "not_found",
            message: "Parent group not found",
          },
          404,
        );
      }

      const parentGroup = parentData[0] as { agent_id: string; level: number };
      if (parentGroup.agent_id !== agentId) {
        return jsonResponse(
          {
            error: "forbidden",
            message: "Parent group does not belong to your tenant",
          },
          403,
        );
      }

      // CRITICAL: Enforce 2-level hierarchy limit (level 0 = root, level 1 = subgroup)
      // Parent must be level 0 (root) to allow creating a subgroup
      if (parentGroup.level >= 1) {
        console.log(`[admin-create-group] Rejected: parent group level=${parentGroup.level}, max allowed=0`);
        return jsonResponse(
          {
            error: "hierarchy_limit",
            message: "Não é possível criar subgrupos dentro de subgrupos. O sistema suporta apenas 2 níveis: Grupos e Subgrupos.",
            details: "Parent group must be a root group (level 0)",
          },
          400,
        );
      }
    }

    // Check for duplicate group name at same level (using normalized name)
    const existingQuery = await fetchSupabaseJson(
      `/rest/v1/mesh_groups?select=id,name,parent_group_id&agent_id=eq.${agentId}&deleted_at=is.null`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          Accept: "application/json",
        },
      },
    );

    if (existingQuery.ok && Array.isArray(existingQuery.data)) {
      const existingGroups = existingQuery.data as Array<{ name: string; parent_group_id: string | null }>;
      for (const existing of existingGroups) {
        const existingNormalized = existing.name.trim().toLowerCase().replace(/\s+/g, ' ');
        const sameLevel = body.parent_group_id 
          ? existing.parent_group_id === body.parent_group_id
          : !existing.parent_group_id;

        if (existingNormalized === normalizedName && sameLevel) {
          return jsonResponse(
            {
              error: "conflict",
              message: "Group with this name already exists at this level",
              existing_name: existing.name,
            },
            409,
          );
        }
      }
    }

    // Create group using service role key (bypasses RLS)
    const insertPayload = {
      agent_id: agentId,
      owner_user_id: callerId,
      name: body.name.trim(),
      description: body.description?.trim() || null,
      parent_group_id: body.parent_group_id || null,
    };

    const createQuery = await fetchSupabaseJson(
      `/rest/v1/mesh_groups`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(insertPayload),
      },
    );

    if (!createQuery.ok) {
      console.error("[admin-create-group] Failed to create group:", createQuery.status, createQuery.text);
      return jsonResponse(
        {
          error: "database_error",
          message: "Failed to create group",
          details: createQuery.text,
        },
        502,
      );
    }

    const groups = Array.isArray(createQuery.data) ? createQuery.data : [];
    if (groups.length === 0) {
      return jsonResponse(
        {
          error: "database_error",
          message: "Group created but not returned",
        },
        502,
      );
    }

    const group = groups[0] as {
      id: string;
      name: string;
      description: string | null;
      path: string;
      level: number;
      parent_group_id: string | null;
      created_at: string;
    };

    console.log(`[admin-create-group] Successfully created group: ${group.id}`);

    return jsonResponse(
      {
        success: true,
        group: {
          id: group.id,
          name: group.name,
          description: group.description,
          path: group.path,
          level: group.level,
          parent_group_id: group.parent_group_id,
          created_at: group.created_at,
        },
      } as Record<string, unknown>,
      201,
    );
  } catch (err) {
    // CRITICAL: Catch all errors and return with CORS headers
    console.error("[admin-create-group] Unhandled error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(
      { error: "internal_error", message },
      500,
    );
  }
}

serve(handler);