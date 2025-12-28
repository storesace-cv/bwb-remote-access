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

interface ClaimBody {
  code?: string;
  device_hint?: string;
  nonce?: string;
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

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function generateProvisionToken(): string {
  const raw = crypto.randomBytes(32).toString("base64");
  const safe = raw
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
  return `p_${safe}`;
}

function getClientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for") ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
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

  let body: ClaimBody;
  try {
    body = (await req.json()) as ClaimBody;
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "Body must be valid JSON" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const codeRaw = typeof body.code === "string" ? body.code.trim() : "";
  const code = codeRaw.replace(/\D+/g, "");
  if (code.length !== 4) {
    return NextResponse.json(
      {
        error: "invalid_code",
        message: "Code must be a 4-digit string",
      },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const deviceHint =
    typeof body.device_hint === "string" ? body.device_hint : undefined;
  const nonce =
    typeof body.nonce === "string" && body.nonce.length > 0
      ? body.nonce
      : undefined;

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

  const clientIp = getClientIp(req);
  const now = new Date();
  const nowIso = now.toISOString();

  // Global rate limiting per IP: max ~20 attempts per 60 seconds
  const ipWindowStart = new Date(now.getTime() - 60 * 1000).toISOString();
  const { data: recentIpAttempts, error: ipError } = await admin
    .from("device_provisioning_attempts")
    .select("id")
    .eq("client_ip", clientIp)
    .gte("attempted_at", ipWindowStart);

  if (ipError) {
    return NextResponse.json(
      {
        error: "database_error",
        message: "Failed to check rate limits",
      },
      { status: 502, headers: CORS_HEADERS },
    );
  }

  const ipCount = Array.isArray(recentIpAttempts)
    ? recentIpAttempts.length
    : 0;
  if (ipCount > 20) {
    return NextResponse.json(
      {
        error: "rate_limited",
        message: "Too many attempts from this IP. Try again later.",
      },
      { status: 429, headers: CORS_HEADERS },
    );
  }

  // Fetch latest code row
  const {
    data: codeRows,
    error: codeError,
  } = await admin
    .from("device_provisioning_codes")
    .select("*")
    .eq("code", code)
    .order("created_at", { ascending: false })
    .limit(1);

  const codeData = Array.isArray(codeRows) && codeRows.length > 0
    ? codeRows[0]
    : null;

  const insertAttempt = async (success: boolean) => {
    await admin.from("device_provisioning_attempts").insert({
      code,
      client_ip: clientIp,
      success,
    });
  };

  if (codeError || !codeData) {
    await insertAttempt(false);
    return NextResponse.json(
      {
        error: "invalid_code",
        message: "Invalid or expired code",
      },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  // Check TTL and status on code
  const codeExpiresAt = new Date(codeData.expires_at);
  const currentStatus: string = codeData.status ?? "unused";

  if (codeExpiresAt.getTime() < now.getTime()) {
    if (currentStatus === "unused" || currentStatus === "claimed") {
      await admin
        .from("device_provisioning_codes")
        .update({
          status: "expired",
          updated_at: nowIso,
        })
        .eq("id", codeData.id);
    }
    await insertAttempt(false);
    return NextResponse.json(
      {
        error: "expired_code",
        message: "Install code has expired",
      },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  if (
    currentStatus === "expired" ||
    currentStatus === "consumed" ||
    currentStatus === "locked"
  ) {
    await insertAttempt(false);
    return NextResponse.json(
      {
        error: "code_locked",
        message: "This code is no longer usable",
      },
      { status: 423, headers: CORS_HEADERS },
    );
  }

  // Per-code rate limiting and lockout
  const codeWindowStart = new Date(
    now.getTime() - 15 * 60 * 1000,
  ).toISOString();
  const {
    data: recentCodeAttempts,
    error: recentCodeError,
  } = await admin
    .from("device_provisioning_attempts")
    .select("success")
    .eq("code", code)
    .eq("client_ip", clientIp)
    .gte("attempted_at", codeWindowStart);

  if (recentCodeError) {
    await insertAttempt(false);
    return NextResponse.json(
      {
        error: "database_error",
        message: "Failed to check per-code rate limits",
      },
      { status: 502, headers: CORS_HEADERS },
    );
  }

  const failuresForCode =
    Array.isArray(recentCodeAttempts)
      ? recentCodeAttempts.filter((r) => r.success === false).length
      : 0;

  if (failuresForCode >= 5) {
    await admin
      .from("device_provisioning_codes")
      .update({
        status: "locked",
        locked_until: new Date(
          now.getTime() + 15 * 60 * 1000,
        ).toISOString(),
        updated_at: nowIso,
      })
      .eq("id", codeData.id);

    await insertAttempt(false);
    return NextResponse.json(
      {
        error: "code_locked",
        message: "Too many failed attempts for this code",
      },
      { status: 423, headers: CORS_HEADERS },
    );
  }

  // Fetch mesh_users data for the user_id from the code
  const authUserId = codeData.user_id;
  const {
    data: meshUser,
    error: meshUserError,
  } = await admin
    .from("mesh_users")
    .select("id, domain_key, domain, mesh_username, display_name")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (meshUserError) {
    await insertAttempt(false);
    return NextResponse.json(
      {
        error: "database_error",
        message: "Failed to fetch user tenant information",
      },
      { status: 502, headers: CORS_HEADERS },
    );
  }

  if (!meshUser) {
    await insertAttempt(false);
    return NextResponse.json(
      {
        error: "user_not_found",
        message: "User account not properly configured",
      },
      { status: 404, headers: CORS_HEADERS },
    );
  }

  // At this point, code is valid to claim
  const provisionToken = generateProvisionToken();
  const tokenHash = sha256(provisionToken);
  const nonceHash = nonce ? sha256(nonce) : null;
  const tokenExpiresAt = new Date(
    now.getTime() + 15 * 60 * 1000,
  ).toISOString();

  const { error: tokenInsertError } = await admin
    .from("device_provisioning_tokens")
    .insert({
      code_id: codeData.id,
      token_hash: tokenHash,
      status: "active",
      device_hint: deviceHint ?? null,
      expires_at: tokenExpiresAt,
      client_ip: clientIp,
      nonce_hash: nonceHash,
    });

  if (tokenInsertError) {
    await insertAttempt(false);
    return NextResponse.json(
      {
        error: "database_error",
        message: "Failed to create provisioning token",
      },
      { status: 502, headers: CORS_HEADERS },
    );
  }

  await admin
    .from("device_provisioning_codes")
    .update({
      status: "claimed",
      last_attempt_at: nowIso,
      last_client_ip: clientIp,
      updated_at: nowIso,
    })
    .eq("id", codeData.id);

  await insertAttempt(true);

  // Return token with user_id and tenant_id
  return NextResponse.json(
    {
      token: provisionToken,
      expires_in: 15 * 60,
      user_id: authUserId,
      tenant_id: meshUser.domain_key || meshUser.domain || "default",
      account_email: meshUser.mesh_username || null,
      display_name: meshUser.display_name || null,
    },
    { status: 200, headers: CORS_HEADERS },
  );
}