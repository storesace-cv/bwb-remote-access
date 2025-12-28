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
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
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

export async function GET(req: Request) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      {
        error: "config_error",
        message: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
      },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  const url = new URL(req.url);
  const tokenRaw = url.searchParams.get("token") ?? "";

  if (!tokenRaw || !tokenRaw.startsWith("p_")) {
    return NextResponse.json(
      {
        error: "invalid_token",
        message: "Missing or invalid provisioning token",
      },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const tokenHash = sha256(tokenRaw);
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

  const now = new Date();

  // Join token -> code to validate status and TTL
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
      device_hint,
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

  // Load RustDesk settings from DB
  const {
    data: settings,
    error: settingsError,
  } = await admin
    .from("rustdesk_settings")
    .select("host, relay, key")
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (settingsError || !settings) {
    return NextResponse.json(
      {
        error: "config_error",
        message: "RustDesk settings not configured",
      },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  const bundle = {
    version: 1,
    rustdesk: {
      host: settings.host,
      relay: settings.relay,
      key: settings.key,
    },
  };

  const bundleJson = JSON.stringify(bundle);
  const bundleHash = sha256(bundleJson);

  return NextResponse.json(
    {
      bundle,
      bundle_hash: bundleHash,
    },
    { status: 200, headers: CORS_HEADERS },
  );
}