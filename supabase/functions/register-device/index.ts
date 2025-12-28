import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

interface MeshUser {
  id: string;
  mesh_username: string | null;
  display_name: string | null;
  auth_user_id: string | null;
  domain: string;
  domain_key: string | null;
  agent_id: string | null;
}

interface MeshGroup {
  id: string;
  name: string;
  description: string | null;
  parent_group_id: string | null;
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

function getAuthUserId(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1];

  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payloadBase64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payloadJson = atob(payloadBase64);
    const payload = JSON.parse(payloadJson) as { sub?: string };
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

function isServiceRoleRequest(authHeader: string | null): boolean {
  if (!authHeader) return false;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  const token = match[1];
  return token === SUPABASE_SERVICE_ROLE_KEY;
}

async function getMeshUserByAuthUserId(authUserId: string): Promise<MeshUser | null> {
  const { data, error } = await supabaseAdmin
    .from("mesh_users")
    .select("id, mesh_username, display_name, auth_user_id, domain, domain_key, agent_id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error) {
    console.error("[register-device] Error fetching mesh_user by auth_user_id:", error);
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
    console.error("[register-device] Error fetching mesh_user by mesh_username:", error);
    return null;
  }

  return data;
}

async function getGroupName(groupId: string): Promise<string | null> {
  console.log("[register-device] Fetching group name for group_id:", groupId);

  const { data, error } = await supabaseAdmin
    .from("mesh_groups")
    .select("name")
    .eq("id", groupId)
    .maybeSingle();

  if (error) {
    console.error("[register-device] Error fetching group name:", error);
    return null;
  }

  return data?.name ?? null;
}

async function buildNotesField(
  groupId: string | null,
  subgroupId: string | null,
  observations: string | null,
): Promise<string | null> {
  console.log("[register-device] Building notes field from:", {
    groupId,
    subgroupId,
    observations,
  });

  const parts: string[] = [];

  if (groupId) {
    const groupName = await getGroupName(groupId);
    if (groupName) {
      parts.push(groupName);
      console.log("[register-device] Added group name to notes:", groupName);
    }
  }

  if (subgroupId) {
    const subgroupName = await getGroupName(subgroupId);
    if (subgroupName) {
      parts.push(subgroupName);
      console.log("[register-device] Added subgroup name to notes:", subgroupName);
    }
  }

  if (observations) {
    parts.push(observations);
    console.log("[register-device] Added observations to notes");
  }

  const result = parts.length > 0 ? parts.join(" | ") : null;
  console.log("[register-device] Final notes field:", result);

  return result;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  const authUserId = getAuthUserId(authHeader);
  const serviceRole = isServiceRoleRequest(authHeader);

  console.log("[register-device] Request received:", {
    mode: authUserId ? "user_jwt" : serviceRole ? "service_role" : "anonymous",
    authUserId: authUserId ?? null,
  });

  if (!authUserId && !serviceRole) {
    return new Response(
      JSON.stringify({
        error: "unauthorized",
        message: "Missing or invalid Authorization header",
      }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  let body: RegisterDeviceBody;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "invalid_json", message: "Request body must be valid JSON" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const deviceIdRaw = typeof body.device_id === "string" ? body.device_id.trim() : "";
  const deviceId = deviceIdRaw.replace(/\s+/g, "");

  if (!deviceId || deviceId.length === 0) {
    return new Response(
      JSON.stringify({ error: "missing_device_id", message: "device_id is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const friendlyNameRaw = typeof body.friendly_name === "string" ? body.friendly_name.trim() : "";
  const friendlyNameParam = friendlyNameRaw.length > 0 ? friendlyNameRaw : null;

  const groupIdRaw = typeof body.group_id === "string" ? body.group_id.trim() : "";
  const groupIdParam = groupIdRaw.length > 0 ? groupIdRaw : null;

  const subgroupIdRaw =
    typeof body.subgroup_id === "string" ? body.subgroup_id.trim() : "";
  const subgroupIdParam = subgroupIdRaw.length > 0 ? subgroupIdRaw : null;

  const observationsRaw = typeof body.observations === "string" ? body.observations.trim() : "";
  const observationsParam = observationsRaw.length > 0 ? observationsRaw : null;

  const notesRaw = body.notes;

  const rustdeskPasswordRaw =
    typeof body.rustdesk_password === "string" ? body.rustdesk_password.trim() : "";
  const rustdeskPasswordParam =
    rustdeskPasswordRaw.length > 0 ? rustdeskPasswordRaw : null;

  const meshUsernameRaw =
    typeof body.mesh_username === "string" ? body.mesh_username.trim() : "";
  const meshUsernameParam = meshUsernameRaw.length > 0 ? meshUsernameRaw : null;

  const lastSeenRaw = typeof body.last_seen === "string" ? body.last_seen.trim() : "";
  const requestedLastSeen = lastSeenRaw.length > 0 ? lastSeenRaw : null;

  console.log("[register-device] Extracted params:", {
    deviceId,
    friendlyNameParam,
    groupIdParam,
    subgroupIdParam,
    observationsParam,
    rustdeskPasswordParam,
    meshUsernameParam,
    hasNotesRaw: typeof notesRaw === "string",
  });

  let caller: MeshUser | null = null;

  if (authUserId) {
    caller = await getMeshUserByAuthUserId(authUserId);
    if (!caller) {
      return new Response(
        JSON.stringify({
          error: "mesh_user_not_found",
          message: "No mesh_user found for this auth user",
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  } else if (serviceRole) {
    if (!meshUsernameParam) {
      return new Response(
        JSON.stringify({
          error: "mesh_username_required",
          message: "mesh_username is required when using service role authorization",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    caller = await getMeshUserByMeshUsername(meshUsernameParam);
    if (!caller) {
      return new Response(
        JSON.stringify({
          error: "mesh_user_not_found",
          message: "No mesh_user found for the provided mesh_username",
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  }

  if (!caller) {
    return new Response(
      JSON.stringify({
        error: "mesh_user_not_found",
        message: "Unable to resolve mesh user for this request",
      }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  console.log("[register-device] Caller mesh_user:", {
    id: caller.id,
    mesh_username: caller.mesh_username,
    domain: caller.domain,
  });

  const { data: existingDeviceRows, error: deviceQueryError } = await supabaseAdmin
    .from("android_devices")
    .select("*")
    .eq("device_id", deviceId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (deviceQueryError) {
    console.error("[register-device] Error querying android_devices:", deviceQueryError);
    return new Response(
      JSON.stringify({ error: "database_error", message: "Failed to query existing device" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const existingDevice =
    existingDeviceRows && existingDeviceRows.length > 0
      ? (existingDeviceRows[0] as AndroidDevice)
      : null;

  console.log(
    "[register-device] Existing device:",
    existingDevice
      ? {
          id: existingDevice.id,
          owner: existingDevice.owner,
          mesh_username: existingDevice.mesh_username,
          group_id: existingDevice.group_id,
          friendly_name: existingDevice.friendly_name,
          notes: existingDevice.notes,
        }
      : "none",
  );

  const existingOwner = existingDevice?.owner ?? null;
  const existingMeshUsername = existingDevice?.mesh_username ?? null;
  const existingGroupId = existingDevice?.group_id ?? null;
  const existingFriendlyName = existingDevice?.friendly_name ?? null;
  const existingNotes = existingDevice?.notes ?? null;
  const existingRustdeskPassword = existingDevice?.rustdesk_password ?? null;

  let ownerForUpsert: string;
  let finalMeshUsername: string | null;

  if (existingOwner) {
    ownerForUpsert = existingOwner;
    finalMeshUsername = existingMeshUsername;
    console.log(
      "[register-device] Device already has owner, keeping existing owner:",
      ownerForUpsert,
    );
  } else {
    ownerForUpsert = caller.id;
    finalMeshUsername = caller.mesh_username;
    console.log(
      "[register-device] Device has no owner, assigning to caller:",
      ownerForUpsert,
    );
  }

  let finalNotes: string | null;
  if (typeof notesRaw === "string") {
    finalNotes = notesRaw;
    console.log("[register-device] Using notes from payload (legacy format)");
  } else if (notesRaw === null) {
    finalNotes = null;
    console.log("[register-device] Notes explicitly set to null");
  } else if (groupIdParam !== null || subgroupIdParam !== null || observationsParam !== null) {
    console.log("[register-device] Building notes from group_id, subgroup_id and observations");
    finalNotes = await buildNotesField(groupIdParam, subgroupIdParam, observationsParam);
  } else {
    finalNotes = existingNotes ?? null;
    console.log("[register-device] Using existing notes or null");
  }

  const finalFriendlyName = friendlyNameParam ?? existingFriendlyName ?? null;
  const finalGroupId =
    subgroupIdParam ?? groupIdParam ?? existingGroupId ?? null;
  const finalRustdeskPassword =
    rustdeskPasswordParam ?? existingRustdeskPassword ?? null;

  const nowIso = new Date().toISOString();
  const existingLastSeen = existingDevice?.last_seen_at ?? null;
  const finalLastSeen = requestedLastSeen ?? existingLastSeen ?? nowIso;

  console.log("[register-device] Final values for upsert:", {
    deviceId,
    owner: ownerForUpsert,
    mesh_username: finalMeshUsername,
    group_id: finalGroupId,
    friendly_name: finalFriendlyName,
    notes: finalNotes,
    rustdesk_password: finalRustdeskPassword ? "***" : null,
    last_seen_at: finalLastSeen,
  });

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
    console.error("[register-device] Upsert error:", upsertError);
    return new Response(
      JSON.stringify({ error: "upsert_failed", message: upsertError.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  console.log("[register-device] Device upserted successfully:", {
    id: (upsertedDevice as AndroidDevice).id,
    device_id: (upsertedDevice as AndroidDevice).device_id,
    owner: (upsertedDevice as AndroidDevice).owner,
    group_id: (upsertedDevice as AndroidDevice).group_id,
    notes: (upsertedDevice as AndroidDevice).notes,
  });

  return new Response(
    JSON.stringify({
      success: true,
      device: upsertedDevice,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});