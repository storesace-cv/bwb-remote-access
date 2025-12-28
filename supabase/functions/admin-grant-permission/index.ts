// Version: 2025-12-22T22:45:00Z - Fixed CDATA wrapper issue + auth pattern
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

interface GrantPermissionRequest {
  collaborator_id: string;
  group_id: string;
  permission?: "view" | "manage";
  notes?: string;
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
  if (req.method === "OPTIONS") {
    console.log("[admin-grant-permission] OPTIONS preflight request");
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      console.log(`[admin-grant-permission] Invalid method: ${req.method}`);
      return jsonResponse({ error: "method_not_allowed" }, 405);
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("[admin-grant-permission] Missing Supabase env vars");
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
      console.log("[admin-grant-permission] Missing Authorization header");
      return jsonResponse(
        {
          error: "unauthorized",
          message: "Missing or invalid Authorization header",
        },
        401,
      );
    }

    const jwt = authHeader.substring(7);

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
        "[admin-grant-permission] JWT validation failed:",
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
      console.log("[admin-grant-permission] No user ID in token");
      return jsonResponse(
        {
          error: "unauthorized",
          message: "Invalid user",
        },
        401,
      );
    }

    console.log(`[admin-grant-permission] Caller auth_user_id: ${authUserId}`);

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
        "[admin-grant-permission] Failed to get caller info:",
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
      console.log("[admin-grant-permission] No mesh_user record found for auth_user_id:", authUserId);
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
    const domain = callerRecord.domain;
    const agentId = callerRecord.agent_id ?? null;

    console.log(`[admin-grant-permission] Caller user_type: ${userType}, domain: ${domain}`);

    const isAgent = userType === "agent";
    const isMinisiteadmin = userType === "minisiteadmin";
    const isSiteadmin = userType === "siteadmin";

    if (!isAgent && !isMinisiteadmin && !isSiteadmin) {
      console.log(`[admin-grant-permission] Access denied: user_type=${userType}`);
      return jsonResponse(
        {
          error: "forbidden",
          message: "Only agents, minisiteadmins, and siteadmins can grant permissions",
        },
        403,
      );
    }

    console.log(`[admin-grant-permission] Access granted: user_type=${userType}`);

    const body = await req.json() as GrantPermissionRequest;

    if (!body.collaborator_id || !body.group_id) {
      return jsonResponse(
        {
          error: "bad_request",
          message: "collaborator_id and group_id are required",
        },
        400,
      );
    }

    const permission = body.permission || "view";
    if (!["view", "manage"].includes(permission)) {
      return jsonResponse(
        {
          error: "bad_request",
          message: "permission must be 'view' or 'manage'",
        },
        400,
      );
    }

    const collabCheck = await fetchSupabaseJson(
      `/rest/v1/mesh_users?select=id,user_type,parent_agent_id,agent_id,domain&id=eq.${body.collaborator_id}`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          Accept: "application/json",
        },
      },
    );

    if (!collabCheck.ok) {
      console.error("[admin-grant-permission] Error checking collaborator:", collabCheck.status, collabCheck.text);
      return jsonResponse(
        {
          error: "database_error",
          message: "Failed to verify collaborator",
        },
        502,
      );
    }

    const collabData = Array.isArray(collabCheck.data) ? collabCheck.data : [];
    if (collabData.length === 0) {
      return jsonResponse(
        {
          error: "not_found",
          message: "Collaborator not found",
        },
        404,
      );
    }

    const collaborator = collabData[0] as { parent_agent_id: string | null; domain: string };

    if (isAgent) {
      if (collaborator.parent_agent_id !== callerId) {
        return jsonResponse(
          {
            error: "forbidden",
            message: "Collaborator does not belong to your tenant",
          },
          403,
        );
      }
    } else if (isMinisiteadmin) {
      if (collaborator.domain !== domain) {
        return jsonResponse(
          {
            error: "forbidden",
            message: "Collaborator does not belong to your domain",
          },
          403,
        );
      }
    }

    const groupCheck = await fetchSupabaseJson(
      `/rest/v1/mesh_groups?select=id,agent_id,name,path&id=eq.${body.group_id}&deleted_at=is.null`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          Accept: "application/json",
        },
      },
    );

    if (!groupCheck.ok) {
      console.error("[admin-grant-permission] Error checking group:", groupCheck.status, groupCheck.text);
      return jsonResponse(
        {
          error: "database_error",
          message: "Failed to verify group",
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

    const group = groupData[0] as { agent_id: string; name: string; path: string };

    if (group.agent_id !== agentId) {
      return jsonResponse(
        {
          error: "forbidden",
          message: "Group does not belong to your tenant",
        },
        403,
      );
    }

    const existingQuery = await fetchSupabaseJson(
      `/rest/v1/mesh_group_permissions?select=id,revoked_at&collaborator_id=eq.${body.collaborator_id}&group_id=eq.${body.group_id}&revoked_at=is.null`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          Accept: "application/json",
        },
      },
    );

    if (existingQuery.ok && Array.isArray(existingQuery.data) && existingQuery.data.length > 0) {
      return jsonResponse(
        {
          error: "conflict",
          message: "Active permission already exists for this collaborator and group",
        },
        409,
      );
    }

    const insertPayload = {
      agent_id: agentId,
      collaborator_id: body.collaborator_id,
      group_id: body.group_id,
      permission: permission,
      granted_by: callerId,
      notes: body.notes || null,
    };

    const grantQuery = await fetchSupabaseJson(
      `/rest/v1/mesh_group_permissions`,
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

    if (!grantQuery.ok) {
      console.error("[admin-grant-permission] Failed to grant permission:", grantQuery.status, grantQuery.text);
      return jsonResponse(
        {
          error: "database_error",
          message: "Failed to grant permission",
          details: grantQuery.text,
        },
        502,
      );
    }

    const permissions = Array.isArray(grantQuery.data) ? grantQuery.data : [];
    if (permissions.length === 0) {
      return jsonResponse(
        {
          error: "database_error",
          message: "Permission granted but not returned",
        },
        502,
      );
    }

    const permissionRecord = permissions[0] as {
      id: string;
      collaborator_id: string;
      group_id: string;
      permission: string;
      granted_at: string;
      granted_by: string;
    };

    console.log(`[admin-grant-permission] Successfully granted permission: ${permissionRecord.id}`);

    return jsonResponse(
      {
        success: true,
        permission: {
          id: permissionRecord.id,
          collaborator_id: permissionRecord.collaborator_id,
          group_id: permissionRecord.group_id,
          group_name: group.name,
          group_path: group.path,
          permission: permissionRecord.permission,
          granted_at: permissionRecord.granted_at,
          granted_by: permissionRecord.granted_by,
        },
      } as Record<string, unknown>,
      201,
    );
  } catch (err) {
    console.error("[admin-grant-permission] Unhandled error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(
      { error: "internal_error", message },
      500,
    );
  }
}

serve(handler);