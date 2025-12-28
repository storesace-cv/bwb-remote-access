import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface DeleteGroupRequest {
  group_id: string;
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
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
  if (req.method === "OPTIONS") {
    console.log("[admin-delete-group] OPTIONS preflight request");
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      console.log(`[admin-delete-group] Invalid method: ${req.method}`);
      return jsonResponse({ error: "method_not_allowed" }, 405);
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("[admin-delete-group] Missing Supabase env vars");
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
      console.log("[admin-delete-group] Missing Authorization header");
      return jsonResponse(
        {
          error: "unauthorized",
          message: "Missing or invalid Authorization header",
        },
        401,
      );
    }

    const jwt = authHeader.substring(7);

    const authCheck = await fetchSupabaseJson("/auth/v1/user", {
      headers: {
        Authorization: `Bearer ${jwt}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
      },
    });

    if (!authCheck.ok) {
      console.error(
        "[admin-delete-group] JWT validation failed:",
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
      console.log("[admin-delete-group] No user ID in token");
      return jsonResponse(
        {
          error: "unauthorized",
          message: "Invalid user",
        },
        401,
      );
    }

    console.log(`[admin-delete-group] Caller auth_user_id: ${authUserId}`);

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
        "[admin-delete-group] Failed to get caller info:",
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
      console.log("[admin-delete-group] No mesh_user record found for auth_user_id:", authUserId);
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
    const agentId = callerRecord.agent_id ?? null;

    console.log(
      `[admin-delete-group] Caller user_type: ${userType}, agent_id: ${agentId}`,
    );

    const isAgent = userType === "agent";
    const isMinisiteadmin = userType === "minisiteadmin";
    const isSiteadmin = userType === "siteadmin";

    if (!isAgent && !isMinisiteadmin && !isSiteadmin) {
      console.log(`[admin-delete-group] Access denied: user_type=${userType}`);
      return jsonResponse(
        {
          error: "forbidden",
          message: "Only agents, minisiteadmins, and siteadmins can delete groups",
        },
        403,
      );
    }

    if (!agentId) {
      console.log("[admin-delete-group] Missing agent_id for caller");
      return jsonResponse(
        {
          error: "forbidden",
          message: "User does not belong to a valid tenant",
        },
        403,
      );
    }

    const body = (await req.json()) as DeleteGroupRequest;

    if (!body.group_id || !body.group_id.trim()) {
      return jsonResponse(
        {
          error: "bad_request",
          message: "group_id is required",
        },
        400,
      );
    }

    const groupId = body.group_id.trim();

    const groupCheck = await fetchSupabaseJson(
      `/rest/v1/mesh_groups?select=id,agent_id,name,level,parent_group_id,deleted_at&deleted_at=is.null&id=eq.${groupId}`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          Accept: "application/json",
        },
      },
    );

    if (!groupCheck.ok) {
      console.error(
        "[admin-delete-group] Error fetching group:",
        groupCheck.status,
        groupCheck.text,
      );
      return jsonResponse(
        {
          error: "database_error",
          message: "Failed to fetch group",
          details: groupCheck.text,
        },
        502,
      );
    }

    const groupData = Array.isArray(groupCheck.data) ? groupCheck.data : [];
    if (groupData.length === 0) {
      return jsonResponse(
        {
          error: "not_found",
          message: "Group not found",
        },
        404,
      );
    }

    const group = groupData[0] as {
      id: string;
      agent_id: string;
      name: string;
      level: number;
      parent_group_id: string | null;
    };

    if (group.agent_id !== agentId) {
      console.log(
        `[admin-delete-group] Group does not belong to caller's tenant. group.agent_id=${group.agent_id}, caller.agent_id=${agentId}`,
      );
      return jsonResponse(
        {
          error: "forbidden",
          message: "Group does not belong to your tenant",
        },
        403,
      );
    }

    const deviceQuery = await fetchSupabaseJson(
      `/rest/v1/android_devices?select=id&deleted_at=is.null&group_id=eq.${groupId}&limit=1`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          Accept: "application/json",
        },
      },
    );

    if (!deviceQuery.ok) {
      console.error(
        "[admin-delete-group] Error checking devices:",
        deviceQuery.status,
        deviceQuery.text,
      );
      return jsonResponse(
        {
          error: "database_error",
          message: "Failed to verify devices linked to group",
          details: deviceQuery.text,
        },
        502,
      );
    }

    const deviceData = Array.isArray(deviceQuery.data) ? deviceQuery.data : [];
    if (deviceData.length > 0) {
      console.log(
        `[admin-delete-group] Group has devices, cannot delete. group_id=${groupId}`,
      );
      return jsonResponse(
        {
          error: "group_has_devices",
          message: "Não é possível apagar um grupo com dispositivos associados.",
        },
        409,
      );
    }

    const childQuery = await fetchSupabaseJson(
      `/rest/v1/mesh_groups?select=id&deleted_at=is.null&parent_group_id=eq.${groupId}&limit=1`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          Accept: "application/json",
        },
      },
    );

    if (!childQuery.ok) {
      console.error(
        "[admin-delete-group] Error checking child groups:",
        childQuery.status,
        childQuery.text,
      );
      return jsonResponse(
        {
          error: "database_error",
          message: "Failed to verify child groups",
          details: childQuery.text,
        },
        502,
      );
    }

    const childData = Array.isArray(childQuery.data) ? childQuery.data : [];
    if (childData.length > 0) {
      console.log(
        `[admin-delete-group] Group has child groups, cannot delete. group_id=${groupId}`,
      );
      return jsonResponse(
        {
          error: "group_has_children",
          message: "Não é possível apagar um grupo com subgrupos associados.",
        },
        409,
      );
    }

    const now = new Date().toISOString();
    const deletePayload = {
      deleted_at: now,
    };

    const deleteQuery = await fetchSupabaseJson(
      `/rest/v1/mesh_groups?id=eq.${groupId}&deleted_at=is.null`,
      {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(deletePayload),
      },
    );

    if (!deleteQuery.ok) {
      console.error(
        "[admin-delete-group] Failed to soft-delete group:",
        deleteQuery.status,
        deleteQuery.text,
      );
      return jsonResponse(
        {
          error: "database_error",
          message: "Failed to delete group",
          details: deleteQuery.text,
        },
        502,
      );
    }

    const deletedGroups = Array.isArray(deleteQuery.data) ? deleteQuery.data : [];
    if (deletedGroups.length === 0) {
      return jsonResponse(
        {
          error: "database_error",
          message: "Group delete operation did not return any record",
        },
        502,
      );
    }

    console.log(
      `[admin-delete-group] Successfully soft-deleted group: ${groupId} by user ${callerId}`,
    );

    return jsonResponse(
      {
        success: true,
        message: "Group deleted successfully",
        group_id: groupId,
      } as Record<string, unknown>,
      200,
    );
  } catch (err) {
    console.error("[admin-delete-group] Unhandled error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(
      { error: "internal_error", message },
      500,
    );
  }
}

serve(handler);