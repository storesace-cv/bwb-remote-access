import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import type { Database } from "@/integrations/supabase/types";
import {
  initializeDebugLogger,
  correlationId,
  logInfo,
  logWarn,
  logError,
  safeError,
} from "@/lib/debugLogger";
import { getCanonicalBaseUrl } from "@/lib/baseUrl";

export const runtime = "nodejs";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const SUPPORTED_ABIS = new Set(["arm64-v8a", "armeabi-v7a", "x86_64"]);

interface ProvisionStartBody {
  tenant_id?: string;
  user_id?: string;
  abi?: string;
  device_fingerprint?: string;
  device_name?: string;
  model?: string;
  os_version?: string;
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

function getBaseUrl(): string {
  let url =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_VERCEL_URL ??
    "http://localhost:3000";

  if (!url) {
    url = "http://localhost:3000";
  }

  if (!url.startsWith("http")) {
    url = `https://${url}`;
  }

  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: Request) {
  initializeDebugLogger();
  const requestId = correlationId("provision_start");
  const clientIp =
    req.headers.get("x-forwarded-for") ??
    req.headers.get("x-real-ip") ??
    "unknown";

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    logError(
      "provision_start",
      "Missing Supabase configuration for provisioning start endpoint",
      {
        requestId,
        hasSupabaseUrl: Boolean(SUPABASE_URL),
        hasServiceRoleKey: Boolean(SUPABASE_SERVICE_ROLE_KEY),
      },
    );

    return NextResponse.json(
      {
        error: "config_error",
        message: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
      },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  let body: ProvisionStartBody;
  try {
    body = (await req.json()) as ProvisionStartBody;
  } catch (error) {
    logWarn("provision_start", "Invalid JSON body received", {
      requestId,
      clientIp,
      error: safeError(error),
    });

    return NextResponse.json(
      { error: "invalid_json", message: "Body must be valid JSON" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const tenantId = body.tenant_id?.toString().trim() ?? "";
  const userId = body.user_id?.toString().trim() ?? "";
  const abi = body.abi?.toString().trim() ?? "";
  const deviceFingerprint = body.device_fingerprint?.toString().trim() ?? "";
  const deviceName = body.device_name?.toString().trim() || null;
  const model = body.model?.toString().trim() || null;
  const osVersion = body.os_version?.toString().trim() || null;

  logInfo("provision_start", "Provision start request received", {
    requestId,
    clientIp,
    hasTenantId: Boolean(tenantId),
    hasUserId: Boolean(userId),
    abi,
    hasDeviceFingerprint: Boolean(deviceFingerprint),
    deviceName,
    model,
    osVersion,
  });

  if (!tenantId || !userId || !abi || !deviceFingerprint) {
    logWarn("provision_start", "Missing required fields", {
      requestId,
      clientIp,
      hasTenantId: Boolean(tenantId),
      hasUserId: Boolean(userId),
      hasAbi: Boolean(abi),
      hasDeviceFingerprint: Boolean(deviceFingerprint),
    });

    return NextResponse.json(
      {
        error: "invalid_payload",
        message:
          "tenant_id, user_id, abi e device_fingerprint são obrigatórios.",
      },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  if (!SUPPORTED_ABIS.has(abi)) {
    logWarn("provision_start", "Unsupported ABI requested", {
      requestId,
      clientIp,
      abi,
    });

    return NextResponse.json(
      {
        error: "unsupported_abi",
        message:
          "ABI não suportado. Valores permitidos: arm64-v8a, armeabi-v7a, x86_64.",
      },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const ADMIN_AUTH_USER_ID =
    process.env.ADMIN_AUTH_USER_ID ??
    "9ebfa3dd-392c-489d-882f-8a1762cb36e8";

  if (userId === ADMIN_AUTH_USER_ID) {
    logWarn(
      "provision_start",
      "Refusing provisioning start for canonical admin user",
      {
        requestId,
        userId,
        clientIp,
      },
    );
    return NextResponse.json(
      {
        error: "forbidden",
        message:
          "A conta de administração não pode ser usada para provisionamento. Usa uma conta de técnico/loja.",
      },
      { status: 403, headers: CORS_HEADERS },
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    logError(
      "provision_start",
      "Failed to create Supabase admin client for provisioning",
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

  try {
    const {
      data: meshUser,
      error: meshError,
    } = await admin
      .from("mesh_users")
      .select("id, mesh_username")
      .eq("auth_user_id", userId)
      .maybeSingle();

    if (meshError) {
      logError(
        "provision_start",
        "Error fetching mesh_users mapping for auth user",
        {
          requestId,
          userId,
          error: safeError(meshError),
        },
      );

      return NextResponse.json(
        {
          error: "database_error",
          message: "Failed to resolve mesh user for provided user_id",
        },
        { status: 502, headers: CORS_HEADERS },
      );
    }

    if (!meshUser) {
      logWarn("provision_start", "No mesh_users mapping found for auth user", {
        requestId,
        userId,
      });

      return NextResponse.json(
        {
          error: "mesh_user_not_found",
          message:
            "Utilizador não tem mapping em mesh_users. Contacta o administrador.",
        },
        { status: 404, headers: CORS_HEADERS },
      );
    }

    const nowIso = new Date().toISOString();

    const upsertPayload = {
      device_id: deviceFingerprint,
      owner: meshUser.id,
      mesh_username: meshUser.mesh_username,
      friendly_name: deviceName,
      notes: null as string | null,
      last_seen_at: nowIso,
      rustdesk_password: null as string | null,
      provisioning_status: "provisioning",
      deleted_at: null as string | null,
      updated_at: nowIso,
    };

    logInfo("provision_start", "Upserting pending_provision device", {
      requestId,
      ownerMeshUserId: meshUser.id,
      meshUsername: meshUser.mesh_username,
      deviceFingerprint,
      deviceName,
      model,
      osVersion,
    });

    const {
      data: upsertData,
      error: upsertError,
    } = await admin
      .from("android_devices")
      .upsert(upsertPayload, { onConflict: "device_id" })
      .select(
        "id, device_id, owner, mesh_username, friendly_name, notes, last_seen_at, created_at, deleted_at",
      )
      .maybeSingle();

    if (upsertError) {
      logError(
        "provision_start",
        "Error upserting pending_provision device into android_devices",
        {
          requestId,
          ownerMeshUserId: meshUser.id,
          error: safeError(upsertError),
        },
      );

      return NextResponse.json(
        {
          error: "database_error",
          message: "Failed to create or update pending_provision device",
        },
        { status: 502, headers: CORS_HEADERS },
      );
    }

    const provisionId = crypto.randomUUID();
    const baseUrl = getBaseUrl();
    const apkUrl = `https://rustdesk.bwb.pt/apk/rustdesk/latest?abi=${encodeURIComponent(
      abi,
    )}`;
    const configUrl = `${baseUrl}/api/provision/config?provision_id=${encodeURIComponent(
      provisionId,
    )}`;

    logInfo("provision_start", "Provisioning start completed successfully", {
      requestId,
      tenantId,
      userId,
      abi,
      apkUrl,
      configUrl,
      deviceRowId: upsertData?.id,
      deviceId: upsertData?.device_id,
    });

    return NextResponse.json(
      {
        provision_id: provisionId,
        config_url: configUrl,
        apk_url: apkUrl,
      },
      { status: 201, headers: CORS_HEADERS },
    );
  } catch (error) {
    logError(
      "provision_start",
      "Unhandled error while processing provisioning start",
      {
        requestId,
        clientIp,
        error: safeError(error),
      },
    );

    return NextResponse.json(
      {
        error: "internal_error",
        message: "Erro interno ao iniciar provisioning.",
      },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}