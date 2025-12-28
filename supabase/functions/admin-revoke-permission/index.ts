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

interface RevokePermissionRequest {
  permission_id?: string;
  collaborator_id?: string;
  group_id?: string;
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
    console.log("[admin-revoke-permission] OPTIONS preflight request");
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      console.log(`[admin-revoke-permission] Invalid method: ${req.method}`);
      return jsonResponse({ error: "method_not_allowed" }, 405);
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("[admin-revoke-permission] Missing Supabase env vars");
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
      console.log("[admin-revoke-permission] Missing Authorization header");
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
        "[admin-revoke-permission] JWT validation failed:",
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
      console.log("[admin-revoke-permission] No user ID in token");
      return jsonResponse(
        {
          error: "unauthorized",
          message: "Invalid user",
        },
        401,
      );
    }

    console.log(`[admin-revoke-permission] Caller auth_user_id: ${authUserId}`);

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
        "[admin-revoke-permission] Failed to get caller info:",
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
      console.log("[admin-revoke-permission] No mesh_user record found for auth_user_id:", authUserId);
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

    console.log(`[admin-revoke-permission] Caller user_type: ${userType}`);

    if (!["agent", "minisiteadmin", "siteadmin"].includes(userType ?? "")) {
      console.log(`[admin-revoke-permission] Access denied: user_type=${userType}`);
      return jsonResponse(
        {
          error: "forbidden",
          message: "Only agents, minisiteadmins, and siteadmins can revoke permissions",
        },
        403,
      );
    }

    console.log(`[admin-revoke-permission] Access granted: user_type=${userType}`);

    const body = await req.json() as RevokePermissionRequest;

    if (body.permission_id) {
      const now = new Date().toISOString();
      const updatePayload = {
        revoked_at: now,
        revoked_by: callerId,
      };

      const revokeQuery = await fetchSupabaseJson(
        `/rest/v1/mesh_group_permissions?id=eq.${body.permission_id}&revoked_at=is.null`,
        {
          method: "PATCH",
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
            Accept: "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify(updatePayload),
        },
      );

      if (!revokeQuery.ok) {
        console.error("[admin-revoke-permission] Failed to revoke permission:", revokeQuery.status, revokeQuery.text);
        return jsonResponse(
          {
            error: "database_error",
            message: "Failed to revoke permission",
            details: revokeQuery.text,
          },
          502,
        );
      }

      const revokedPerms = Array.isArray(revokeQuery.data) ? revokeQuery.data : [];
      if (revokedPerms.length === 0) {
        return jsonResponse(
          {
            error: "not_found",
            message: "Permission not found or already revoked",
          },
          404,
        );
      }

      console.log(`[admin-revoke-permission] Successfully revoked permission: ${body.permission_id}`);
      return jsonResponse(
        {
          success: true,
          message: "Permission revoked successfully",
          permission_id: body.permission_id,
        } as Record<string, unknown>,
        200,
      );
    } else if (body.collaborator_id && body.group_id) {
      const now = new Date().toISOString();
      const updatePayload = {
        revoked_at: now,
        revoked_by: callerId,
      };

      const revokeQuery = await fetchSupabaseJson(
        `/rest/v1/mesh_group_permissions?collaborator_id=eq.${body.collaborator_id}&group_id=eq.${body.group_id}&revoked_at=is.null`,
        {
          method: "PATCH",
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
            Accept: "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify(updatePayload),
        },
      );

      if (!revokeQuery.ok) {
        console.error("[admin-revoke-permission] Failed to revoke permission:", revokeQuery.status, revokeQuery.text);
        return jsonResponse(
          {
            error: "database_error",
            message: "Failed to revoke permission",
            details: revokeQuery.text,
          },
          502,
        );
      }

      const revokedPerms = Array.isArray(revokeQuery.data) ? revokeQuery.data : [];
      if (revokedPerms.length === 0) {
        return jsonResponse(
          {
            error: "not_found",
            message: "Permission not found or already revoked",
          },
          404,
        );
      }

      console.log(`[admin-revoke-permission] Successfully revoked permission for collaborator: ${body.collaborator_id}, group: ${body.group_id}`);
      return jsonResponse(
        {
          success: true,
          message: "Permission revoked successfully",
          collaborator_id: body.collaborator_id,
          group_id: body.group_id,
        } as Record<string, unknown>,
        200,
      );
    } else {
      return jsonResponse(
        {
          error: "bad_request",
          message: "Either permission_id OR (collaborator_id + group_id) required",
        },
        400,
      );
    }
  } catch (err) {
    console.error("[admin-revoke-permission] Unhandled error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(
      { error: "internal_error", message },
      500,
    );
  }
}

serve(handler);