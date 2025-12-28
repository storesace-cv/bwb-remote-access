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
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface RevokePermissionRequest {
  permission_id?: string;
  collaborator_id?: string;
  group_id?: string;
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
  const correlationId = generateCorrelationId();
  const logger = createLogger("admin-revoke-permission", correlationId);

  if (req.method === "OPTIONS") {
    logger.info("OPTIONS preflight request");
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
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

    const callerRecord = callerData[0] as { id?: string; user_type?: string; domain?: string; agent_id?: string };
    const callerId = callerRecord.id;
    const userType = callerRecord.user_type;

    logger.info("Caller info", { user_type: userType }, authUserId);

    if (!["agent", "minisiteadmin", "siteadmin"].includes(userType ?? "")) {
      logger.warn("Access denied", { user_type: userType }, authUserId);
      return jsonResponse(
        { error: "forbidden", message: "Only agents, minisiteadmins, and siteadmins can revoke permissions" },
        403,
        corsHeaders,
      );
    }

    logger.info("Access granted", { user_type: userType }, authUserId);

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
        logger.error("Failed to revoke permission", { status: revokeQuery.status }, authUserId);
        return jsonResponse(
          { error: "database_error", message: "Failed to revoke permission", details: revokeQuery.text },
          502,
          corsHeaders,
        );
      }

      const revokedPerms = Array.isArray(revokeQuery.data) ? revokeQuery.data : [];
      if (revokedPerms.length === 0) {
        logger.warn("Permission not found or already revoked", { permission_id: body.permission_id }, authUserId);
        return jsonResponse(
          { error: "not_found", message: "Permission not found or already revoked" },
          404,
          corsHeaders,
        );
      }

      logger.info("Permission revoked", { permission_id: body.permission_id }, authUserId);
      return jsonResponse(
        { success: true, message: "Permission revoked successfully", permission_id: body.permission_id } as Record<string, unknown>,
        200,
        corsHeaders,
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
        logger.error("Failed to revoke permission", { status: revokeQuery.status }, authUserId);
        return jsonResponse(
          { error: "database_error", message: "Failed to revoke permission", details: revokeQuery.text },
          502,
          corsHeaders,
        );
      }

      const revokedPerms = Array.isArray(revokeQuery.data) ? revokeQuery.data : [];
      if (revokedPerms.length === 0) {
        logger.warn("Permission not found or already revoked", undefined, authUserId);
        return jsonResponse(
          { error: "not_found", message: "Permission not found or already revoked" },
          404,
          corsHeaders,
        );
      }

      logger.info("Permission revoked", { collaborator_id: body.collaborator_id, group_id: body.group_id }, authUserId);
      return jsonResponse(
        {
          success: true,
          message: "Permission revoked successfully",
          collaborator_id: body.collaborator_id,
          group_id: body.group_id,
        } as Record<string, unknown>,
        200,
        corsHeaders,
      );
    } else {
      logger.warn("Missing required fields", undefined, authUserId);
      return jsonResponse(
        { error: "bad_request", message: "Either permission_id OR (collaborator_id + group_id) required" },
        400,
        corsHeaders,
      );
    }
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
