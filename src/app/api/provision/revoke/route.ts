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
        status
      )
    `,
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (tokenError || !tokenRow) {
    // Idempotent: if token is unknown, treat as already revoked
    return NextResponse.json(
      {
        success: true,
        note: "Token already invalid or unknown",
      },
      { status: 200, headers: CORS_HEADERS },
    );
  }

  const codeRow = tokenRow.device_provisioning_codes;

  // Update token status if still active
  if (tokenRow.status === "active") {
    await admin
      .from("device_provisioning_tokens")
      .update({
        status: "revoked",
        expires_at: nowIso,
        last_seen_at: nowIso,
      })
      .eq("id", tokenRow.id);
  }

  if (codeRow?.id) {
    await admin
      .from("device_provisioning_codes")
      .update({
        status: "consumed",
        updated_at: nowIso,
      })
      .eq("id", codeRow.id);
  }

  return NextResponse.json(
    {
      success: true,
    },
    { status: 200, headers: CORS_HEADERS },
  );
}