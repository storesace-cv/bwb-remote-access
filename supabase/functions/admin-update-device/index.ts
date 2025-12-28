// Sprint 1: Security Hardening - Centralized auth + structured logging
export const config = { verify_jwt: false };

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
const ADMIN_AUTH_USER_ID =
  Deno.env.get("ADMIN_AUTH_USER_ID") ??
  "9ebfa3dd-392c-489d-882f-8a1762cb36e8";

interface AdminUpdateBody {
  device_id?: string;
  target_mesh_username?: string;
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
  const logger = createLogger("admin-update-device", correlationId);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    logger.warn("Method not allowed", { method: req.method });
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

  try {
    // Validate JWT using centralized auth
    const authHeader = req.headers.get("Authorization");
    const authResult = await validateJwt(authHeader, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, logger);

    if (!authResult.ok) {
      return authErrorResponse(authResult, corsHeaders);
    }

    const userId = authResult.context.authUserId;
    if (!userId || userId !== ADMIN_AUTH_USER_ID) {
      logger.warn("Forbidden: user is not admin", { userId }, userId);
      return jsonResponse(
        { error: "forbidden", message: "Only canonical admin can perform this action" },
        403,
        corsHeaders,
      );
    }

    logger.info("Admin authenticated", undefined, userId);

    let body: AdminUpdateBody;
    try {
      body = (await req.json()) as AdminUpdateBody;
    } catch (e) {
      logger.warn("Invalid JSON body", undefined, userId);
      return jsonResponse(
        { error: "invalid_json", message: "Request body must be valid JSON" },
        400,
        corsHeaders,
      );
    }

    const deviceId = body.device_id?.trim();
    const targetMeshUsername = body.target_mesh_username?.trim();

    if (!deviceId || !targetMeshUsername) {
      logger.warn("Missing required fields", { hasDeviceId: !!deviceId, hasTarget: !!targetMeshUsername }, userId);
      return jsonResponse(
        { error: "invalid_payload", message: "device_id and target_mesh_username are required" },
        400,
        corsHeaders,
      );
    }

    logger.info("Updating device", { deviceId, targetMeshUsername }, userId);

    // Resolve target user
    const meshQuery = await fetchSupabaseJson(
      `/rest/v1/mesh_users?mesh_username=eq.${encodeURIComponent(targetMeshUsername)}&select=id,mesh_username`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          Accept: "application/json",
        },
      },
    );

    if (!meshQuery.ok) {
      logger.error("Error fetching mesh_user", { status: meshQuery.status }, userId);
      return jsonResponse(
        { error: "database_error", message: "Failed to fetch mesh user" },
        502,
        corsHeaders,
      );
    }

    const meshRows = Array.isArray(meshQuery.data) ? meshQuery.data : [];
    if (meshRows.length === 0) {
      logger.warn("Target mesh user not found", { targetMeshUsername }, userId);
      return jsonResponse(
        { error: "mesh_user_not_found", message: "Target mesh user not found" },
        404,
        corsHeaders,
      );
    }

    const meshUser = meshRows[0] as { id: string; mesh_username?: string | null };

    const now = new Date().toISOString();
    const updatePayload = {
      owner: meshUser.id,
      mesh_username: meshUser.mesh_username ?? targetMeshUsername,
      notes: null,
      deleted_at: null,
      updated_at: now,
    };

    const updateQuery = await fetchSupabaseJson(
      `/rest/v1/android_devices?device_id=eq.${encodeURIComponent(deviceId)}`,
      {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(updatePayload),
      },
    );

    if (!updateQuery.ok) {
      logger.error("Error updating device", { status: updateQuery.status }, userId);
      return jsonResponse(
        { error: "database_error", message: "Failed to update device" },
        502,
        corsHeaders,
      );
    }

    const updatedRows = Array.isArray(updateQuery.data) ? updateQuery.data : [];
    if (updatedRows.length === 0) {
      logger.warn("Device not found", { deviceId }, userId);
      return jsonResponse(
        { error: "not_found", message: "Device not found" },
        404,
        corsHeaders,
      );
    }

    const updatedDevice = updatedRows[0] as Record<string, unknown>;
    logger.info("Device updated successfully", { deviceId }, userId);

    return jsonResponse(updatedDevice, 200, corsHeaders);
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
