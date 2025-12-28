import { NextResponse } from "next/server";
import crypto from "crypto";
import type { Database } from "@/integrations/supabase/types";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

interface RegisterBody {
  device_id?: string;
  device_hint?: string;
  device_info?: Record<string, unknown>;
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function getBearerToken(req: Request): string | null {
  const header =
    req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const match = header.match(/Bearer\s+(.+)/i);
  return match ? match[1] : null;
}

function createAdminClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  return createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: Request) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      {
        error: "config_error",
        message: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
      },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  const tokenRaw = getBearerToken(req);
  if (!tokenRaw || !tokenRaw.startsWith("p_")) {
    return NextResponse.json(
      {
        error: "invalid_token",
        message: "Missing or invalid provisioning token",
      },
      { status: 401, headers: CORS_HEADERS },
    );
  }

  let body: RegisterBody;
  try {
    body = (await req.json()) as RegisterBody;
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "Body must be valid JSON" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const deviceId =
    typeof body.device_id === "string" && body.device_id.trim().length > 0
      ? body.device_id.trim()
      : "";
  if (!deviceId) {
    return NextResponse.json(
      {
        error: "invalid_payload",
        message: "device_id is required",
      },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      {
        error: "config_error",
        message: "Supabase admin client not available",
      },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  const tokenHash = sha256(tokenRaw);
  const now = new Date();
  const nowIso = now.toISOString();

  // Resolve token -> code -> user
  const {
    data: tokenRow,
    error: tokenError,
  } = await admin
    .from("device_provisioning_tokens")
    .select(
      `
      id,
      status,
      expires_at,
      code_id,
      device_provisioning_codes!device_provisioning_tokens_code_id_fkey (
        id,
        user_id,
        status,
        expires_at
      )
    `,
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (tokenError || !tokenRow) {
    return NextResponse.json(
      {
        error: "invalid_token",
        message: "Provisioning token not found",
      },
      { status: 401, headers: CORS_HEADERS },
    );
  }

  if (tokenRow.status !== "active") {
    return NextResponse.json(
      {
        error: "invalid_token",
        message: "Provisioning token is not active",
      },
      { status: 401, headers: CORS_HEADERS },
    );
  }

  const tokenExpiresAt = new Date(tokenRow.expires_at);
  if (tokenExpiresAt.getTime() < now.getTime()) {
    return NextResponse.json(
      {
        error: "invalid_token",
        message: "Provisioning token has expired",
      },
      { status: 401, headers: CORS_HEADERS },
    );
  }

  const codeRow = tokenRow.device_provisioning_codes;
  if (!codeRow) {
    return NextResponse.json(
      {
        error: "invalid_token",
        message: "Associated provisioning code not found",
      },
      { status: 401, headers: CORS_HEADERS },
    );
  }

  const codeExpiresAt = new Date(codeRow.expires_at);
  if (
    codeRow.status === "expired" ||
    codeRow.status === "consumed" ||
    codeRow.status === "locked" ||
    codeExpiresAt.getTime() < now.getTime()
  ) {
    return NextResponse.json(
      {
        error: "invalid_token",
        message: "Associated install code is no longer valid",
      },
      { status: 401, headers: CORS_HEADERS },
    );
  }

  const authUserId = codeRow.user_id as string | null;
  if (!authUserId) {
    return NextResponse.json(
      {
        error: "mesh_user_not_found",
        message: "Provisioning code is not linked to a valid user",
      },
      { status: 404, headers: CORS_HEADERS },
    );
  }

  // Resolve mesh user for this auth user
  const {
    data: meshUser,
    error: meshError,
  } = await admin
    .from("mesh_users")
    .select("id, mesh_username")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (meshError || !meshUser) {
    return NextResponse.json(
      {
        error: "mesh_user_not_found",
        message: "Mesh user mapping not found for this auth user",
      },
      { status: 404, headers: CORS_HEADERS },
    );
  }

  const meshUsername = meshUser.mesh_username;
  if (!meshUsername) {
    return NextResponse.json(
      {
        error: "mesh_user_not_found",
        message: "Mesh user has no mesh_username configured",
      },
      { status: 404, headers: CORS_HEADERS },
    );
  }

  // Delegate device registration to existing Edge Function register-device
  const registerUrl = `${SUPABASE_URL}/functions/v1/register-device`;
  const registerResponse = await fetch(registerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({
      device_id: deviceId,
      mesh_username: meshUsername,
      last_seen: nowIso,
    }),
  });

  const registerJson = await registerResponse.json().catch(() => null);

  if (!registerResponse.ok) {
    const message =
      (registerJson as { message?: string } | null)?.message ??
      "Failed to register device";
    return NextResponse.json(
      {
        error: "device_registration_failed",
        message,
      },
      { status: registerResponse.status, headers: CORS_HEADERS },
    );
  }

  // Update token bookkeeping
  await admin
    .from("device_provisioning_tokens")
    .update({
      used_by_device_id: deviceId,
      last_seen_at: nowIso,
    })
    .eq("id", tokenRow.id);

  // Keep code in claimed state; final consumption happens on revoke
  await admin
    .from("device_provisioning_codes")
    .update({
      updated_at: nowIso,
    })
    .eq("id", codeRow.id);

  return NextResponse.json(
    {
      success: true,
      state: "pending_adoption",
      device: {
        device_id: deviceId,
      },
    },
    { status: 200, headers: CORS_HEADERS },
  );
}