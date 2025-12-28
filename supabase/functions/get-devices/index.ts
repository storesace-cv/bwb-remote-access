// Sprint 1: Security Hardening - Centralized auth + structured logging
export const config = { verify_jwt: false };

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
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

async function handler(req: Request): Promise<Response> {
  const correlationId = generateCorrelationId();
  const logger = createLogger("get-devices", correlationId);

  logger.info("Request received", { method: req.method });

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "GET") {
      logger.warn("Method not allowed", { method: req.method });
      return jsonResponse({ error: "method_not_allowed" }, 405, corsHeaders);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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

    // Admin canónico e admin secundário (viewer)
    const ADMIN_AUTH_USER_ID =
      Deno.env.get("ADMIN_AUTH_USER_ID") ??
      "9ebfa3dd-392c-489d-882f-8a1762cb36e8";
    const SECONDARY_ADMIN_AUTH_ID =
      Deno.env.get("SECONDARY_ADMIN_AUTH_USER_ID") ??
      "f5384288-837e-41fc-aa08-0020c1bafdec";

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Mapear auth.users.id → mesh_users.id
    const { data: meshUser, error: meshError } = await supabase
      .from("mesh_users")
      .select("id")
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    if (meshError) {
      logger.error("Error fetching mesh_user", { error: meshError.message }, authUserId);
      return jsonResponse(
        { error: "database_error", message: "Failed to resolve mesh user" },
        502,
        corsHeaders,
      );
    }

    if (!meshUser) {
      logger.warn("No mesh_user found", undefined, authUserId);
      return jsonResponse(
        { error: "mesh_user_not_found", message: "User does not have a mesh_users mapping" },
        404,
        corsHeaders,
      );
    }

    // ownerIds base: o próprio utilizador
    const ownerIds: string[] = [meshUser.id];

    // Se for o admin secundário (Jorge), acrescentar também o mesh_user do admin canónico
    if (authUserId === SECONDARY_ADMIN_AUTH_ID && authUserId !== ADMIN_AUTH_USER_ID) {
      const { data: canonicalMesh, error: canonicalMeshError } = await supabase
        .from("mesh_users")
        .select("id")
        .eq("auth_user_id", ADMIN_AUTH_USER_ID)
        .maybeSingle();

      if (canonicalMeshError) {
        logger.warn("Error fetching canonical admin mesh_user", { error: canonicalMeshError.message });
      } else if (canonicalMesh?.id && canonicalMesh.id !== meshUser.id) {
        ownerIds.push(canonicalMesh.id);
      }
    }

    logger.info("Fetching devices", { ownerCount: ownerIds.length }, authUserId);

    let devices: unknown[] | null = null;
    let devicesError: { code?: string } | null = null;

    const firstTry = await supabase
      .from("android_devices_grouping")
      .select("*")
      .in("owner", ownerIds)
      .is("deleted_at", null)
      .eq("provisioning_status", "ready")
      .order("last_seen_at", { ascending: false });

    devices = (firstTry.data ?? null) as unknown[] | null;
    devicesError = (firstTry.error as { code?: string } | null) ?? null;

    if (devicesError?.code === "42703") {
      logger.warn("View missing provisioning_status, retrying without filter");
      const fallback = await supabase
        .from("android_devices_grouping")
        .select("*")
        .in("owner", ownerIds)
        .is("deleted_at", null)
        .order("last_seen_at", { ascending: false });

      devices = (fallback.data ?? null) as unknown[] | null;
      devicesError = (fallback.error as { code?: string } | null) ?? null;
    }

    if (devicesError) {
      logger.error("Error fetching devices", { error: JSON.stringify(devicesError) }, authUserId);
      return jsonResponse(
        { error: "database_error", message: "Failed to fetch devices" },
        502,
        corsHeaders,
      );
    }

    const safeDevices = Array.isArray(devices) ? devices : [];
    logger.info("Devices fetched", { count: safeDevices.length }, authUserId);

    let annotatedDevices = safeDevices;

    try {
      const deviceIds = safeDevices
        .map((device) => (device as { device_id?: string | null }).device_id ?? null)
        .filter((id): id is string => typeof id === "string" && id.length > 0);

      if (deviceIds.length > 0) {
        const { data: tokenRows, error: tokensError } = await supabase
          .from("device_provisioning_tokens")
          .select("used_by_device_id")
          .in("used_by_device_id", deviceIds);

        if (tokensError) {
          logger.warn("Error fetching provisioning tokens", { error: tokensError.message });
        } else if (Array.isArray(tokenRows)) {
          const fromCodeSet = new Set(
            tokenRows
              .map((row) => (row as { used_by_device_id: string | null }).used_by_device_id ?? null)
              .filter((id): id is string => typeof id === "string" && id.length > 0),
          );

          annotatedDevices = safeDevices.map((device) => {
            const deviceId = (device as { device_id?: string | null }).device_id;
            const fromProvisioningCode = typeof deviceId === "string" && fromCodeSet.has(deviceId);
            return { ...device, from_provisioning_code: fromProvisioningCode };
          });
        }
      }
    } catch (annotationError) {
      logger.warn("Failed to annotate devices", { error: String(annotationError) });
    }

    // Filter to valid RustDesk IDs (6–12 digits)
    const filteredDevices = annotatedDevices.filter((device) => {
      const deviceId = (device as { device_id?: string | null }).device_id;
      if (typeof deviceId !== "string") return false;
      const normalized = deviceId.replace(/\D/g, "");
      return normalized.length >= 6 && normalized.length <= 12;
    });

    logger.info("Returning devices", { count: filteredDevices.length }, authUserId);

    return new Response(JSON.stringify(filteredDevices), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
