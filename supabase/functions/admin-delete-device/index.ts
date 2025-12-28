export const config = { verify_jwt: false };

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
const ADMIN_AUTH_USER_ID =
  Deno.env.get("ADMIN_AUTH_USER_ID") ??
  "9ebfa3dd-392c-489d-882f-8a1762cb36e8";

interface AdminDeleteBody {
  device_id?: string;
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
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[admin-delete-device] Missing Supabase env vars");
    return jsonResponse(
      {
        error: "config_error",
        message: "Missing Supabase configuration",
      },
      500,
    );
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
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
        "[admin-delete-device] JWT validation failed:",
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
    if (!user?.id || user.id !== ADMIN_AUTH_USER_ID) {
      console.error(
        "[admin-delete-device] Forbidden: user is not admin",
        user?.id,
      );
      return jsonResponse(
        {
          error: "forbidden",
          message: "Only canonical admin can perform this action",
        },
        403,
      );
    }

    let body: AdminDeleteBody;
    try {
      body = (await req.json()) as AdminDeleteBody;
    } catch (e) {
      console.error("[admin-delete-device] Invalid JSON body", e);
      return jsonResponse(
        {
          error: "invalid_json",
          message: "Request body must be JSON",
        },
        400,
      );
    }

    const deviceId = body.device_id?.trim();
    if (!deviceId) {
      return jsonResponse(
        {
          error: "invalid_payload",
          message: "device_id is required",
        },
        400,
      );
    }

    const now = new Date().toISOString();
    const updatePayload = {
      deleted_at: now,
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
      console.error(
        "[admin-delete-device] Error updating device:",
        updateQuery.status,
        updateQuery.text,
      );
      return jsonResponse(
        {
          error: "database_error",
          message: "Failed to delete device",
        },
        502,
      );
    }

    const updatedRows = Array.isArray(updateQuery.data)
      ? updateQuery.data
      : [];
    if (updatedRows.length === 0) {
      return jsonResponse(
        {
          error: "not_found",
          message: "Device not found",
        },
        404,
      );
    }

    return jsonResponse({ success: true }, 200);
  } catch (err) {
    console.error("[admin-delete-device] Unhandled error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(
      { error: "internal_error", message },
      500,
    );
  }
}

serve(handler);