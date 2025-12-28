import { NextResponse } from "next/server";
import crypto from "crypto";
import type { Database } from "@/integrations/supabase/types";
import { createClient } from "@supabase/supabase-js";
import {
  correlationId,
  initializeDebugLogger,
  logDebug,
  logError,
  logInfo,
  logWarn,
  safeError,
} from "@/lib/debugLogger";

export const runtime = "nodejs";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function getSupabaseAuthKey(): string | null {
  const key = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
  return key && key.length > 0 ? key : null;
}

function getBearerToken(req: Request): string | null {
  const header =
    req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const match = header.match(/Bearer\s+(.+)/i);
  return match ? match[1] : null;
}

function createAdminClient() {
  const key = getSupabaseAuthKey();
  if (!SUPABASE_URL || !key) {
    return null;
  }
  return createClient<Database>(SUPABASE_URL, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function createUserClient(jwt: string) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !jwt) {
    return null;
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    },
  });
}

function generateFourDigitCode(): string {
  const n = crypto.randomInt(0, 10000);
  return n.toString().padStart(4, "0");
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: Request) {
  initializeDebugLogger();
  const requestId = correlationId("provision_codes");
  const clientIp =
    req.headers.get("x-forwarded-for") ??
    req.headers.get("x-real-ip") ??
    "unknown";

  const hasAuthHeader =
    !!(req.headers.get("authorization") ?? req.headers.get("Authorization"));

  logInfo("provision_codes", "Incoming provision code request", {
    requestId,
    clientIp,
    hasAuthHeader,
  });

  const supabaseAuthKey = getSupabaseAuthKey();

  if (!SUPABASE_URL || !supabaseAuthKey) {
    logError(
      "provision_codes",
      "Missing Supabase configuration for provisioning codes endpoint",
      {
        requestId,
        hasSupabaseUrl: Boolean(SUPABASE_URL),
        hasServiceRoleKey: Boolean(SUPABASE_SERVICE_ROLE_KEY),
        hasAnonKey: Boolean(SUPABASE_ANON_KEY),
      },
    );
    return NextResponse.json(
      {
        error: "config_error",
        message:
          "Missing Supabase URL or API key for provisioning codes endpoint",
      },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  const token = getBearerToken(req);
  if (!token) {
    logWarn("provision_codes", "Missing Authorization Bearer token", {
      requestId,
      clientIp,
    });
    return NextResponse.json(
      { error: "unauthorized", message: "Missing Authorization Bearer token" },
      { status: 401, headers: CORS_HEADERS },
    );
  }

  let userId: string | null = null;

  try {
    logDebug(
      "provision_codes",
      "Validating JWT via Supabase Auth (/auth/v1/user)",
      {
        requestId,
      },
    );

    const authResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAuthKey,
      },
    });

    if (!authResponse.ok) {
      const bodyPreview = await authResponse.text().catch(() => "");
      logWarn(
        "provision_codes",
        "Supabase Auth validation failed for provisioning code request",
        {
          requestId,
          status: authResponse.status,
          statusText: authResponse.statusText,
          bodyPreview: bodyPreview.slice(0, 200),
        },
      );

      return NextResponse.json(
        {
          error: "unauthorized",
          message: "Invalid or expired token",
        },
        { status: 401, headers: CORS_HEADERS },
      );
    }

    const user = (await authResponse.json()) as { id?: string } | null;
    userId = user?.id ?? null;

    if (!userId) {
      logWarn(
        "provision_codes",
        "Supabase Auth response missing user id for provisioning request",
        {
          requestId,
        },
      );
      return NextResponse.json(
        {
          error: "unauthorized",
          message: "User payload missing id",
        },
        { status: 401, headers: CORS_HEADERS },
      );
    }

    const ADMIN_AUTH_USER_ID =
      process.env.ADMIN_AUTH_USER_ID ??
      "9ebfa3dd-392c-489d-882f-8a1762cb36e8";

    if (userId === ADMIN_AUTH_USER_ID) {
      logWarn(
        "provision_codes",
        "Canonical admin is not allowed to generate install codes",
        {
          requestId,
          userId,
        },
      );
      return NextResponse.json(
        {
          error: "forbidden",
          message:
            "A conta de administração não pode gerar códigos de instalação. Usa uma conta de técnico/loja.",
        },
        { status: 403, headers: CORS_HEADERS },
      );
    }

    logDebug("provision_codes", "JWT validated successfully", {
      requestId,
      hasUserId: Boolean(userId),
    });
  } catch (error) {
    logError(
      "provision_codes",
      "Unhandled error while validating JWT with Supabase Auth",
      {
        requestId,
        error: safeError(error),
      },
    );
    return NextResponse.json(
      {
        error: "auth_gateway_error",
        message: "Failed to validate token against Supabase Auth",
      },
      { status: 502, headers: CORS_HEADERS },
    );
  }

  const userClient = createUserClient(token);
  if (!userClient) {
    logError(
      "provision_codes",
      "Supabase user client not available for provisioning codes",
      {
        requestId,
        hasSupabaseUrl: Boolean(SUPABASE_URL),
        hasAnonKey: Boolean(SUPABASE_ANON_KEY),
      },
    );
    return NextResponse.json(
      {
        error: "config_error",
        message: "Supabase user client not available",
      },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    logError(
      "provision_codes",
      "Supabase admin client not available for provisioning codes",
      {
        requestId,
      },
    );
    return NextResponse.json(
      {
        error: "config_error",
        message: "Supabase admin client not available",
      },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);
  const nowIso = now.toISOString();
  const expiresAtIso = expiresAt.toISOString();

  let finalCode: string | null = null;

  logDebug(
    "provision_codes",
    "Starting collision-avoidance loop for 4-digit code",
    {
      requestId,
      maxAttempts: 20,
      nowIso,
      expiresAtIso,
    },
  );

  for (let i = 0; i < 20; i += 1) {
    const candidate = generateFourDigitCode();

    const { data, error } = await userClient
      .from("device_provisioning_codes")
      .select("id, status, expires_at")
      .eq("code", candidate)
      .in("status", ["unused", "claimed"])
      .gt("expires_at", nowIso)
      .limit(1);

    if (error) {
      logError(
        "provision_codes",
        "Failed to check existing provisioning codes for collision",
        {
          requestId,
          attempt: i + 1,
          error: safeError(error),
        },
      );
      return NextResponse.json(
        {
          error: "database_error",
          message: "Failed to check existing codes",
        },
        { status: 502, headers: CORS_HEADERS },
      );
    }

    const rows = Array.isArray(data) ? data : [];
    if (rows.length === 0) {
      finalCode = candidate;
      logDebug(
        "provision_codes",
        "Found available 4-digit provisioning code candidate",
        {
          requestId,
          attempt: i + 1,
        },
      );
      break;
    }

    if (i === 0) {
      logDebug(
        "provision_codes",
        "Initial 4-digit candidate already in use, retrying",
        {
          requestId,
        },
      );
    }
  }

  if (!finalCode) {
    logWarn(
      "provision_codes",
      "Unable to allocate unique 4-digit provisioning code after max attempts",
      {
        requestId,
      },
    );
    return NextResponse.json(
      {
        error: "capacity_exceeded",
        message: "Unable to allocate a unique install code at this time",
      },
      { status: 503, headers: CORS_HEADERS },
    );
  }

  const { data: insertData, error: insertError } = await userClient
    .from("device_provisioning_codes")
    .insert({
      user_id: userId,
      code: finalCode,
      expires_at: expiresAtIso,
      status: "unused",
    })
    .select("id, code, expires_at, status")
    .single();

  if (insertError || !insertData) {
    const safeInsertError = safeError(insertError);
    const rawCode =
      insertError && typeof insertError === "object"
        ? (insertError as { code?: string }).code ?? null
        : null;
    const rawMessage =
      insertError && typeof insertError === "object"
        ? (insertError as { message?: string }).message ?? null
        : null;

    logError(
      "provision_codes",
      "Failed to insert new provisioning code into device_provisioning_codes",
      {
        requestId,
        error: safeInsertError,
        errorCode: rawCode,
        errorMessage: rawMessage,
      },
    );

    return NextResponse.json(
      {
        error: "database_error",
        message: "Failed to create provisioning code",
        db_error_code: rawCode,
        db_error_message: rawMessage,
      },
      { status: 502, headers: CORS_HEADERS },
    );
  }

  const installUrl = `https://rustdesk.bwb.pt/i/${encodeURIComponent(
    insertData.code,
  )}`;

  logInfo("provision_codes", "Provisioning code successfully created", {
    requestId,
    userId,
    expiresAt: insertData.expires_at,
  });

  return NextResponse.json(
    {
      code: insertData.code,
      expires_at: insertData.expires_at,
      install_url: installUrl,
      status: insertData.status,
    },
    { status: 201, headers: CORS_HEADERS },
  );
}