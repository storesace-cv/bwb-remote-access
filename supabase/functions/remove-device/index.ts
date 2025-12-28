import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

const supabaseAdmin = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "DELETE") {
    return new Response(
      JSON.stringify({ error: "method_not_allowed", message: "Only DELETE method is allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const authHeader = req.headers.get("Authorization");
  const authUserId = getAuthUserId(authHeader);

  console.log("[remove-device] Request received from auth_user_id:", authUserId ?? "anonymous");

  if (!authUserId) {
    return new Response(
      JSON.stringify({ error: "unauthorized", message: "Missing or invalid Authorization header" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let body: RemoveDeviceBody;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "invalid_json", message: "Request body must be valid JSON" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const deviceIdRaw = typeof body.device_id === "string" ? body.device_id.trim() : "";
  const deviceId = deviceIdRaw.replace(/\s+/g, "");

  if (!deviceId || deviceId.length === 0) {
    return new Response(
      JSON.stringify({ error: "missing_device_id", message: "device_id is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  console.log("[remove-device] Attempting to delete device:", deviceId);

  try {
    const { data: caller, error: callerError } = await supabaseAdmin
      .from("mesh_users")
      .select("id, user_type, domain, agent_id")
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    if (callerError) {
      console.error("[remove-device] Error fetching caller mesh_user:", callerError);
      return new Response(
        JSON.stringify({ error: "database_error", message: "Failed to verify user permissions" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!caller) {
      console.log("[remove-device] No mesh_user found for auth_user_id:", authUserId);
      return new Response(
        JSON.stringify({ error: "forbidden", message: "User not found in mesh_users" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[remove-device] Caller info:", {
      user_type: caller.user_type,
      domain: caller.domain,
      agent_id: caller.agent_id,
    });

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
      console.error("[remove-device] Error fetching device:", deviceError);
      return new Response(
        JSON.stringify({ error: "database_error", message: "Failed to query device" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!device) {
      console.log("[remove-device] Device not found:", deviceId);
      return new Response(
        JSON.stringify({ error: "not_found", message: "Device not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const typedDevice = device as AndroidDevice;

    if (typedDevice.deleted_at !== null) {
      console.log("[remove-device] Device already deleted:", deviceId);
      return new Response(
        JSON.stringify({ error: "already_deleted", message: "Device is already deleted" }),
        { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const deviceDomain = typedDevice.mesh_users?.domain ?? null;

    console.log("[remove-device] Device info:", {
      device_id: typedDevice.device_id,
      agent_id: typedDevice.agent_id,
      owner: typedDevice.owner,
      device_domain: deviceDomain,
    });

    let canDelete = false;
    let denialReason = "";

    const callerType = caller.user_type as string;

    if (callerType === "siteadmin") {
      canDelete = true;
      console.log("[remove-device] Permission granted: siteadmin can delete all devices");
    } else if (callerType === "minisiteadmin") {
      if (deviceDomain === caller.domain) {
        canDelete = true;
        console.log("[remove-device] Permission granted: minisiteadmin can delete devices in their domain");
      } else {
        denialReason = `Device belongs to domain '${deviceDomain}', you can only delete devices in your domain '${caller.domain}'`;
      }
    } else if (callerType === "agent") {
      if (typedDevice.agent_id === caller.agent_id) {
        canDelete = true;
        console.log("[remove-device] Permission granted: agent can delete devices in their tenant");
      } else {
        denialReason = "Device does not belong to your tenant";
      }
    } else {
      denialReason = `User type '${callerType}' is not allowed to delete devices. Only agents, minisiteadmins, and siteadmins can delete devices.`;
    }

    if (!canDelete) {
      console.log("[remove-device] Permission denied:", denialReason);
      return new Response(
        JSON.stringify({ 
          error: "forbidden", 
          message: denialReason || "You do not have permission to delete this device" 
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
      console.error("[remove-device] Update error:", updateError);
      return new Response(
        JSON.stringify({ error: "database_error", message: "Failed to delete device" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!deletedDevice) {
      console.log("[remove-device] No device was deleted (concurrent modification?)");
      return new Response(
        JSON.stringify({ error: "not_found", message: "Device not found or already deleted" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[remove-device] Device deleted successfully:", {
      id: deletedDevice.id,
      device_id: deletedDevice.device_id,
      deleted_by_user_type: callerType,
    });

    return new Response(
      JSON.stringify({
        success: true,
        device: deletedDevice,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[remove-device] Unexpected error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: "internal_error", message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});