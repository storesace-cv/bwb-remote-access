// Sprint 1: Security Hardening - Centralized auth + input validation + structured logging
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  validateJwt,
  validateDeviceId,
  validateMeshUsername,
  validateNotes,
  validateFriendlyName,
  createLogger,
  generateCorrelationId,
  jsonResponse,
  authErrorResponse,
  defaultCorsHeaders,
} from "../_shared/auth.ts";

export const config = { verify_jwt: false };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  ...defaultCorsHeaders,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RegisterDeviceBody {
  device_id?: unknown;
  friendly_name?: unknown;
  group_id?: unknown;
  notes?: unknown;
  rustdesk_password?: unknown;
  observations?: unknown;
  mesh_username?: unknown;
  last_seen?: unknown;
  subgroup_id?: unknown;
}

interface MeshUser {
  id: string;
  mesh_username: string | null;
  display_name: string | null;
  auth_user_id: string | null;
  domain: string;
  domain_key: string | null;
  agent_id: string | null;
}

interface AndroidDevice {
  id: string;
  device_id: string;
  owner: string | null;
  mesh_username: string | null;
  group_id: string | null;
  friendly_name: string | null;
  notes: string | null;
  rustdesk_password: string | null;
  last_seen_at: string | null;
  created_at: string;
  deleted_at: string | null;
  updated_at: string;
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function getMeshUserByAuthUserId(authUserId: string): Promise<MeshUser | null> {
  const { data, error } = await supabaseAdmin
    .from("mesh_users")
    .select("id, mesh_username, display_name, auth_user_id, domain, domain_key, agent_id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data;
}

async function getMeshUserByMeshUsername(meshUsername: string): Promise<MeshUser | null> {
  const { data, error } = await supabaseAdmin
    .from("mesh_users")
    .select("id, mesh_username, display_name, auth_user_id, domain, domain_key, agent_id")
    .eq("mesh_username", meshUsername)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data;
}

async function getGroupName(groupId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("mesh_groups")
    .select("name")
    .eq("id", groupId)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data?.name ?? null;
}

async function buildNotesField(
  groupId: string | null,
  subgroupId: string | null,
  observations: string | null,
): Promise<string | null> {
  const parts: string[] = [];

  if (groupId) {
    const groupName = await getGroupName(groupId);
    if (groupName) {
      parts.push(groupName);
    }
  }

  if (subgroupId) {
    const subgroupName = await getGroupName(subgroupId);
    if (subgroupName) {
      parts.push(subgroupName);
    }
  }

  if (observations) {
    parts.push(observations);
  }

  return parts.length > 0 ? parts.join(" | ") : null;
}

serve(async (req) => {
  const correlationId = generateCorrelationId();
  const logger = createLogger("register-device", correlationId);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  logger.info("Request received", { method: req.method });

  // Validate environment
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

  const { authUserId, isServiceRole } = authResult.context;

  // Parse request body
  let body: RegisterDeviceBody;
  try {
    body = await req.json();
  } catch {
    logger.warn("Invalid JSON body");
    return jsonResponse(
      { error: "invalid_json", message: "Request body must be valid JSON" },
      400,
      corsHeaders,
    );
  }

  // =========================================================================
  // STRICT INPUT VALIDATION
  // =========================================================================

  // Validate device_id (REQUIRED: digits only, 6-12 length)
  const deviceIdValidation = validateDeviceId(body.device_id);
  if (!deviceIdValidation.valid) {
    logger.warn("Invalid device_id", { error: deviceIdValidation.error });
    return jsonResponse(
      { error: "invalid_device_id", message: deviceIdValidation.error! },
      400,
      corsHeaders,
    );
  }
  const deviceId = deviceIdValidation.value;

  // Validate friendly_name (optional, max 255 chars)
  const friendlyNameValidation = validateFriendlyName(body.friendly_name);
  if (!friendlyNameValidation.valid) {
    logger.warn("Invalid friendly_name", { error: friendlyNameValidation.error });
    return jsonResponse(
      { error: "invalid_friendly_name", message: friendlyNameValidation.error! },
      400,
      corsHeaders,
    );
  }
  const friendlyNameParam = friendlyNameValidation.value;

  // Validate notes (optional, max 1000 chars)
  const notesValidation = validateNotes(body.notes);
  if (!notesValidation.valid) {
    logger.warn("Invalid notes", { error: notesValidation.error });
    return jsonResponse(
      { error: "invalid_notes", message: notesValidation.error! },
      400,
      corsHeaders,
    );
  }
  const notesRaw = body.notes;

  // Validate observations (same rules as notes)
  const observationsValidation = validateNotes(body.observations);
  if (!observationsValidation.valid) {
    logger.warn("Invalid observations", { error: observationsValidation.error });
    return jsonResponse(
      { error: "invalid_observations", message: observationsValidation.error! },
      400,
      corsHeaders,
    );
  }
  const observationsParam = observationsValidation.value;

  // Validate mesh_username for service role requests
  let meshUsernameParam: string | null = null;
  if (isServiceRole) {
    if (body.mesh_username !== undefined && body.mesh_username !== null) {
      const meshUsernameValidation = validateMeshUsername(body.mesh_username);
      if (!meshUsernameValidation.valid) {
        logger.warn("Invalid mesh_username", { error: meshUsernameValidation.error });
        return jsonResponse(
          { error: "invalid_mesh_username", message: meshUsernameValidation.error! },
          400,
          corsHeaders,
        );
      }
      meshUsernameParam = meshUsernameValidation.value;
    }
  }

  // Extract other parameters (less critical - using existing logic)
  const groupIdRaw = typeof body.group_id === "string" ? body.group_id.trim() : "";
  const groupIdParam = groupIdRaw.length > 0 ? groupIdRaw : null;

  const subgroupIdRaw = typeof body.subgroup_id === "string" ? body.subgroup_id.trim() : "";
  const subgroupIdParam = subgroupIdRaw.length > 0 ? subgroupIdRaw : null;

  const rustdeskPasswordRaw = typeof body.rustdesk_password === "string" ? body.rustdesk_password.trim() : "";
  const rustdeskPasswordParam = rustdeskPasswordRaw.length > 0 ? rustdeskPasswordRaw : null;

  const lastSeenRaw = typeof body.last_seen === "string" ? body.last_seen.trim() : "";
  const requestedLastSeen = lastSeenRaw.length > 0 ? lastSeenRaw : null;

  logger.info("Input validation passed", {
    deviceId,
    hasFriendlyName: !!friendlyNameParam,
    hasGroupId: !!groupIdParam,
    hasNotes: typeof notesRaw === "string",
  });

  // =========================================================================
  // RESOLVE CALLER
  // =========================================================================

  let caller: MeshUser | null = null;

  if (authUserId) {
    caller = await getMeshUserByAuthUserId(authUserId);
    if (!caller) {
      logger.warn("No mesh_user found for auth_user_id", undefined, authUserId);
      return jsonResponse(
        { error: "mesh_user_not_found", message: "No mesh_user found for this auth user" },
        404,
        corsHeaders,
      );
    }
  } else if (isServiceRole) {
    if (!meshUsernameParam) {
      logger.warn("mesh_username required for service role");
      return jsonResponse(
        { error: "mesh_username_required", message: "mesh_username is required when using service role authorization" },
        400,
        corsHeaders,
      );
    }

    caller = await getMeshUserByMeshUsername(meshUsernameParam);
    if (!caller) {
      logger.warn("No mesh_user found for mesh_username", { mesh_username: meshUsernameParam });
      return jsonResponse(
        { error: "mesh_user_not_found", message: "No mesh_user found for the provided mesh_username" },
        404,
        corsHeaders,
      );
    }
  }

  if (!caller) {
    logger.error("Unable to resolve mesh user");
    return jsonResponse(
      { error: "mesh_user_not_found", message: "Unable to resolve mesh user for this request" },
      404,
      corsHeaders,
    );
  }

  logger.info("Caller resolved", {
    callerId: caller.id,
    mesh_username: caller.mesh_username,
    domain: caller.domain,
  }, authUserId);

  // =========================================================================
  // FETCH EXISTING DEVICE
  // =========================================================================

  const { data: existingDeviceRows, error: deviceQueryError } = await supabaseAdmin
    .from("android_devices")
    .select("*")
    .eq("device_id", deviceId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (deviceQueryError) {
    logger.error("Error querying android_devices", { error: deviceQueryError.message });
    return jsonResponse(
      { error: "database_error", message: "Failed to query existing device" },
      500,
      corsHeaders,
    );
  }

  const existingDevice = existingDeviceRows && existingDeviceRows.length > 0
    ? (existingDeviceRows[0] as AndroidDevice)
    : null;

  logger.info("Existing device query", {
    found: !!existingDevice,
    existingOwner: existingDevice?.owner ?? null,
  });

  const existingOwner = existingDevice?.owner ?? null;
  const existingMeshUsername = existingDevice?.mesh_username ?? null;
  const existingGroupId = existingDevice?.group_id ?? null;
  const existingFriendlyName = existingDevice?.friendly_name ?? null;
  const existingNotes = existingDevice?.notes ?? null;
  const existingRustdeskPassword = existingDevice?.rustdesk_password ?? null;

  // =========================================================================
  // DETERMINE FINAL VALUES
  // =========================================================================

  let ownerForUpsert: string;
  let finalMeshUsername: string | null;

  if (existingOwner) {
    ownerForUpsert = existingOwner;
    finalMeshUsername = existingMeshUsername;
    logger.info("Device already has owner, keeping existing", { owner: ownerForUpsert });
  } else {
    ownerForUpsert = caller.id;
    finalMeshUsername = caller.mesh_username;
    logger.info("Device has no owner, assigning to caller", { owner: ownerForUpsert });
  }

  let finalNotes: string | null;
  if (typeof notesRaw === "string") {
    finalNotes = notesRaw;
  } else if (notesRaw === null) {
    finalNotes = null;
  } else if (groupIdParam !== null || subgroupIdParam !== null || observationsParam !== null) {
    finalNotes = await buildNotesField(groupIdParam, subgroupIdParam, observationsParam);
  } else {
    finalNotes = existingNotes ?? null;
  }

  const finalFriendlyName = friendlyNameParam ?? existingFriendlyName ?? null;
  const finalGroupId = subgroupIdParam ?? groupIdParam ?? existingGroupId ?? null;
  const finalRustdeskPassword = rustdeskPasswordParam ?? existingRustdeskPassword ?? null;

  const nowIso = new Date().toISOString();
  const existingLastSeen = existingDevice?.last_seen_at ?? null;
  const finalLastSeen = requestedLastSeen ?? existingLastSeen ?? nowIso;

  logger.info("Final values computed", {
    deviceId,
    owner: ownerForUpsert,
    hasNotes: !!finalNotes,
    hasGroupId: !!finalGroupId,
  });

  // =========================================================================
  // UPSERT DEVICE
  // =========================================================================

  const upsertRow: Record<string, unknown> = {
    device_id: deviceId,
    owner: ownerForUpsert,
    mesh_username: finalMeshUsername,
    agent_id: caller.agent_id,
    group_id: finalGroupId,
    friendly_name: finalFriendlyName,
    notes: finalNotes,
    rustdesk_password: finalRustdeskPassword,
    last_seen_at: finalLastSeen,
    deleted_at: null,
    updated_at: nowIso,
  };

  const { data: upsertedDevice, error: upsertError } = await supabaseAdmin
    .from("android_devices")
    .upsert(upsertRow, { onConflict: "device_id" })
    .select()
    .single();

  if (upsertError) {
    logger.error("Upsert failed", { error: upsertError.message });
    return jsonResponse(
      { error: "upsert_failed", message: upsertError.message },
      500,
      corsHeaders,
    );
  }

  logger.info("Device upserted successfully", {
    id: (upsertedDevice as AndroidDevice).id,
    device_id: (upsertedDevice as AndroidDevice).device_id,
  }, authUserId);

  return jsonResponse(
    { success: true, device: upsertedDevice },
    200,
    corsHeaders,
  );
});
