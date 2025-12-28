import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const runtime = "nodejs";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

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
  const provisionId = url.searchParams.get("provision_id") ?? null;

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

  return NextResponse.json(
    {
      provision_id: provisionId,
      bundle: {
        version: 1,
        rustdesk: {
          host: settings.host,
          relay: settings.relay,
          key: settings.key,
        },
      },
    },
    { status: 200, headers: CORS_HEADERS },
  );
}