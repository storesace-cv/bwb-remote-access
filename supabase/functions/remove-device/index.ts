// Sprint 1: Security Hardening - Centralized auth + structured logging
export const config = { verify_jwt: false };

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  validateJwt,
  validateDeviceId,
  createLogger,
  generateCorrelationId,
  jsonResponse,
  authErrorResponse,
  defaultCorsHeaders,
} from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  ...defaultCorsHeaders,
  "Access-Control-Allow-Methods": "DELETE, OPTIONS",
};

interface RemoveDeviceBody {
  device_id?: unknown;
}

interface MeshUser {
  id: string;
  user_type: string;
  domain: string;
  agent_id: string;
}

interface AndroidDevice {
  id: string;
  device_id: string;
  owner: string | null;
  agent_id: string | null;
  deleted_at: string | null;
  mesh_users?: {
    domain: string;
  } | null;
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

serve(async (req) => {
  const correlationId = generateCorrelationId();
  const logger = createLogger("remove-device", correlationId);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "DELETE") {
    logger.warn("Method not allowed", { method: req.method });
    return jsonResponse(
      { error: "method_not_allowed", message: "Only DELETE method is allowed" },
      405,
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
      { error: "unauthorized", message: "Missing or invalid Authorization header" },
      401,
      corsHeaders,
    );
  }

  logger.info("Request received", { method: req.method }, authUserId);

  let body: RemoveDeviceBody;
  try {
    body = await req.json();
  } catch {
    logger.warn("Invalid JSON body", undefined, authUserId);
    return jsonResponse(
      { error: "invalid_json", message: "Request body must be valid JSON" },
      400,
      corsHeaders,
    );
  }

  // Validate device_id using centralized validation
  const deviceIdValidation = validateDeviceId(body.device_id);
  if (!deviceIdValidation.valid) {
    logger.warn("Invalid device_id", { error: deviceIdValidation.error }, authUserId);
    return jsonResponse(
      { error: "invalid_device_id", message: deviceIdValidation.error! },
      400,
      corsHeaders,
    );
  }
  const deviceId = deviceIdValidation.value;

  logger.info("Attempting to delete device", { deviceId }, authUserId);

  try {
    const { data: caller, error: callerError } = await supabaseAdmin
      .from("mesh_users")
      .select("id, user_type, domain, agent_id")
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    if (callerError) {
      logger.error("Error fetching caller mesh_user", { error: callerError.message }, authUserId);
      return jsonResponse(
        { error: "database_error", message: "Failed to verify user permissions" },
        500,
        corsHeaders,
      );
    }

    if (!caller) {
      logger.warn("No mesh_user found", undefined, authUserId);
      return jsonResponse(
        { error: "forbidden", message: "User not found in mesh_users" },
        403,
        corsHeaders,
      );
    }

    logger.info("Caller info", {
      user_type: caller.user_type,
      domain: caller.domain,
      agent_id: caller.agent_id,
    }, authUserId);

    const { data: device, error: deviceError } = await supabaseAdmin
      .from("android_devices")
      .select(`
        id,
        device_id,
        owner,
        agent_id,
        deleted_at,
        mesh_users!android_devices_owner_fkey (
          domain
        )
      `)
      .eq("device_id", deviceId)
      .maybeSingle();

    if (deviceError) {
      logger.error("Error fetching device", { error: deviceError.message }, authUserId);
      return jsonResponse(
        { error: "database_error", message: "Failed to query device" },
        500,
        corsHeaders,
      );
    }

    if (!device) {
      logger.warn("Device not found", { deviceId }, authUserId);
      return jsonResponse(
        { error: "not_found", message: "Device not found" },
        404,
        corsHeaders,
      );
    }

    const typedDevice = device as AndroidDevice;

    if (typedDevice.deleted_at !== null) {
      logger.warn("Device already deleted", { deviceId }, authUserId);
      return jsonResponse(
        { error: "already_deleted", message: "Device is already deleted" },
        410,
        corsHeaders,
      );
    }

    const deviceDomain = typedDevice.mesh_users?.domain ?? null;

    logger.info("Device info", {
      device_id: typedDevice.device_id,
      agent_id: typedDevice.agent_id,
      owner: typedDevice.owner,
      device_domain: deviceDomain,
    }, authUserId);

    let canDelete = false;
    let denialReason = "";
    const callerType = caller.user_type as string;

    if (callerType === "siteadmin") {
      canDelete = true;
      logger.info("Permission granted: siteadmin", undefined, authUserId);
    } else if (callerType === "minisiteadmin") {
      if (deviceDomain === caller.domain) {
        canDelete = true;
        logger.info("Permission granted: minisiteadmin in domain", undefined, authUserId);
      } else {
        denialReason = `Device belongs to domain '${deviceDomain}', you can only delete devices in your domain '${caller.domain}'`;
      }
    } else if (callerType === "agent") {
      if (typedDevice.agent_id === caller.agent_id) {
        canDelete = true;
        logger.info("Permission granted: agent in tenant", undefined, authUserId);
      } else {
        denialReason = "Device does not belong to your tenant";
      }
    } else {
      denialReason = `User type '${callerType}' is not allowed to delete devices. Only agents, minisiteadmins, and siteadmins can delete devices.`;
    }

    if (!canDelete) {
      logger.warn("Permission denied", { reason: denialReason }, authUserId);
      return jsonResponse(
        { error: "forbidden", message: denialReason || "You do not have permission to delete this device" },
        403,
        corsHeaders,
      );
    }

    const nowIso = new Date().toISOString();

    const { data: deletedDevice, error: updateError } = await supabaseAdmin
      .from("android_devices")
      .update({
        owner: null,
        mesh_username: null,
        friendly_name: null,
        notes: null,
        deleted_at: nowIso,
        updated_at: nowIso,
      })
      .eq("device_id", deviceId)
      .is("deleted_at", null)
      .select()
      .maybeSingle();

    if (updateError) {
      logger.error("Update error", { error: updateError.message }, authUserId);
      return jsonResponse(
        { error: "database_error", message: "Failed to delete device" },
        500,
        corsHeaders,
      );
    }

    if (!deletedDevice) {
      logger.warn("No device deleted (concurrent modification?)", { deviceId }, authUserId);
      return jsonResponse(
        { error: "not_found", message: "Device not found or already deleted" },
        404,
        corsHeaders,
      );
    }

    logger.info("Device deleted successfully", {
      id: deletedDevice.id,
      device_id: deletedDevice.device_id,
      deleted_by_user_type: callerType,
    }, authUserId);

    return jsonResponse(
      { success: true, device: deletedDevice },
      200,
      corsHeaders,
    );
  } catch (err) {
    logger.error("Unexpected error", { error: err instanceof Error ? err.message : String(err) }, authUserId);
    return jsonResponse(
      { error: "internal_error", message: err instanceof Error ? err.message : String(err) },
      500,
      corsHeaders,
    );
  }
});
