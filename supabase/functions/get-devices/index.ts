export const config = { verify_jwt: false };

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

async function handler(req: Request): Promise<Response> {
  console.log(`[get-devices] Request received: ${req.method}`);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "GET") {
      return new Response(
        JSON.stringify({ error: "method_not_allowed" }),
        {
          status: 405,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("[get-devices] Missing environment variables");
      return new Response(
        JSON.stringify({
          error: "config_error",
          message: "Missing Supabase configuration",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.error("[get-devices] Missing or invalid Authorization header");
      return new Response(
        JSON.stringify({
          error: "unauthorized",
          message: "Missing token",
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const jwt = authHeader.substring(7);

    console.log("[get-devices] Validating JWT with Supabase Auth...");
    const authResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
      },
    });

    if (!authResponse.ok) {
      console.error(
        "[get-devices] JWT validation failed:",
        authResponse.status,
      );
      return new Response(
        JSON.stringify({
          error: "unauthorized",
          message: "Invalid or expired token",
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const user = await authResponse.json();
    const authUserId = user.id as string;
    console.log(`[get-devices] Authenticated user: ${authUserId}`);

    // Admin canónico e admin secundário (viewer) – alinhado com SoT
    const ADMIN_AUTH_USER_ID =
      Deno.env.get("ADMIN_AUTH_USER_ID") ??
      "9ebfa3dd-392c-489d-882f-8a1762cb36e8";
    const SECONDARY_ADMIN_AUTH_ID =
      Deno.env.get("SECONDARY_ADMIN_AUTH_USER_ID") ??
      "f5384288-837e-41fc-aa08-0020c1bafdec";

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Mapear auth.users.id → mesh_users.id (SoT: owner referencia mesh_users.id)
    const { data: meshUser, error: meshError } = await supabase
      .from("mesh_users")
      .select("id")
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    if (meshError) {
      console.error("[get-devices] Error fetching mesh_user:", meshError);
      return new Response(
        JSON.stringify({
          error: "database_error",
          message: "Failed to resolve mesh user",
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!meshUser) {
      console.error(
        "[get-devices] No mesh_user found for auth_user_id:",
        authUserId,
      );
      return new Response(
        JSON.stringify({
          error: "mesh_user_not_found",
          message: "User does not have a mesh_users mapping",
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ownerIds base: o próprio utilizador
    const ownerIds: string[] = [meshUser.id];

    // Se for o admin secundário (Jorge), acrescentar também o mesh_user do admin canónico
    if (
      authUserId === SECONDARY_ADMIN_AUTH_ID &&
      authUserId !== ADMIN_AUTH_USER_ID
    ) {
      const { data: canonicalMesh, error: canonicalMeshError } = await supabase
        .from("mesh_users")
        .select("id")
        .eq("auth_user_id", ADMIN_AUTH_USER_ID)
        .maybeSingle();

      if (canonicalMeshError) {
        console.error(
          "[get-devices] Error fetching canonical admin mesh_user:",
          canonicalMeshError,
        );
      } else if (canonicalMesh?.id && canonicalMesh.id !== meshUser.id) {
        ownerIds.push(canonicalMesh.id);
      }
    }

    console.log(
      `[get-devices] Fetching devices for owner ids: ${ownerIds.join(", ")}`,
    );

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
      console.warn(
        "[get-devices] View android_devices_grouping missing provisioning_status; retrying without filter",
      );
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
      console.error("[get-devices] Error fetching devices:", devicesError);
      return new Response(
        JSON.stringify({
          error: "database_error",
          message: "Failed to fetch devices",
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const safeDevices = Array.isArray(devices) ? devices : [];
    console.log(
      `[get-devices] Found ${safeDevices.length} devices before annotation`,
    );

    let annotatedDevices = safeDevices;

    try {
      const deviceIds = safeDevices
        .map((device) =>
          (device as { device_id?: string | null }).device_id ?? null,
        )
        .filter(
          (id): id is string => typeof id === "string" && id.length > 0,
        );

      if (deviceIds.length > 0) {
        const { data: tokenRows, error: tokensError } = await supabase
          .from("device_provisioning_tokens")
          .select("used_by_device_id")
          .in("used_by_device_id", deviceIds);

        if (tokensError) {
          console.error(
            "[get-devices] Error fetching provisioning tokens:",
            tokensError,
          );
        } else if (Array.isArray(tokenRows)) {
          const fromCodeSet = new Set(
            tokenRows
              .map(
                (row) =>
                  (row as { used_by_device_id: string | null })
                    .used_by_device_id ?? null,
              )
              .filter(
                (id): id is string =>
                  typeof id === "string" && id.length > 0,
              ),
          );

          annotatedDevices = safeDevices.map((device) => {
            const deviceId = (device as { device_id?: string | null }).device_id;
            const fromProvisioningCode =
              typeof deviceId === "string" && fromCodeSet.has(deviceId);
            return {
              ...device,
              from_provisioning_code: fromProvisioningCode,
            };
          });
        }
      }
    } catch (annotationError) {
      console.error(
        "[get-devices] Failed to annotate devices with provisioning source:",
        annotationError,
      );
    }

    // Extra safety gate: só devolvemos devices cujo device_id pareça um RustDesk ID válido (6–12 dígitos).
    const filteredDevices = annotatedDevices.filter((device) => {
      const deviceId = (device as { device_id?: string | null }).device_id;
      if (typeof deviceId !== "string") {
        return false;
      }
      const normalized = deviceId.replace(/\D/g, "");
      return normalized.length >= 6 && normalized.length <= 12;
    });

    console.log(
      `[get-devices] Returning ${filteredDevices.length} devices (after RustDesk ID shape filter)`,
    );

    return new Response(JSON.stringify(filteredDevices), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[get-devices] Unhandled error:", err);
    const message = err instanceof Error ? err.message : String(err);

    return new Response(
      JSON.stringify({
        error: "internal_error",
        message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
}

serve(handler);