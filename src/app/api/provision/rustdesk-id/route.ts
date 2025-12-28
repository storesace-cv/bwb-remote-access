import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  initializeDebugLogger,
  correlationId,
  logInfo,
  logWarn,
  logError,
  safeError,
} from "@/lib/debugLogger";

export const runtime = "nodejs";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

interface RustDeskIdBody {
  provision_id?: string;
  device_fingerprint?: string;
  rustdesk_id?: string;
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
  initializeDebugLogger();
  const requestId = correlationId("provision_rustdesk_id");
  const clientIp =
    req.headers.get("x-forwarded-for") ??
    req.headers.get("x-real-ip") ??
    "unknown";

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    logError(
      "provision_rustdesk_id",
      "Missing Supabase configuration for RustDesk ID endpoint",
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

  let body: RustDeskIdBody;
  try {
    body = (await req.json()) as RustDeskIdBody;
  } catch (error) {
    logWarn("provision_rustdesk_id", "Invalid JSON body received", {
      requestId,
      clientIp,
      error: safeError(error),
    });

    return NextResponse.json(
      { error: "invalid_json", message: "Body must be valid JSON" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const provisionId = body.provision_id?.toString().trim() ?? "";
  const deviceFingerprint = body.device_fingerprint?.toString().trim() ?? "";
  const rustdeskId = body.rustdesk_id?.toString().trim() ?? "";

  logInfo("provision_rustdesk_id", "RustDesk ID registration request received", {
    requestId,
    clientIp,
    hasProvisionId: Boolean(provisionId),
    hasDeviceFingerprint: Boolean(deviceFingerprint),
    rustdeskIdLength: rustdeskId.length,
  });

  if (!deviceFingerprint || !rustdeskId) {
    logWarn("provision_rustdesk_id", "Missing required fields", {
      requestId,
      clientIp,
      hasProvisionId: Boolean(provisionId),
      hasDeviceFingerprint: Boolean(deviceFingerprint),
      hasRustdeskId: Boolean(rustdeskId),
    });

    return NextResponse.json(
      {
        error: "invalid_payload",
        message: "device_fingerprint and rustdesk_id are required.",
      },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const rustdeskIdPattern = /^\d{6,12}$/u;
  if (!rustdeskIdPattern.test(rustdeskId)) {
    logWarn("provision_rustdesk_id", "Invalid RustDesk ID format", {
      requestId,
      clientIp,
      rustdeskId,
    });

    return NextResponse.json(
      {
        error: "invalid_rustdesk_id",
        message: "RustDesk ID must be a numeric string between 6 and 12 digits.",
      },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    logError(
      "provision_rustdesk_id",
      "Failed to create Supabase admin client for RustDesk ID endpoint",
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

  const nowIso = new Date().toISOString();

  try {
    const {
      data: deviceRow,
      error: deviceError,
    } = await admin
      .from("android_devices")
      .select("id, device_id, owner, mesh_username, deleted_at")
      .eq("device_id", deviceFingerprint)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (deviceError) {
      logError(
        "provision_rustdesk_id",
        "Error fetching android_devices row by fingerprint",
        {
          requestId,
          clientIp,
          deviceFingerprint,
          error: safeError(deviceError),
        },
      );

      return NextResponse.json(
        {
          error: "database_error",
          message: "Failed to resolve device for provided fingerprint",
        },
        { status: 502, headers: CORS_HEADERS },
      );
    }

    if (!deviceRow || deviceRow.deleted_at) {
      logWarn(
        "provision_rustdesk_id",
        "No active android_devices row found for fingerprint",
        {
          requestId,
          clientIp,
          deviceFingerprint,
        },
      );

      return NextResponse.json(
        {
          error: "device_not_found",
          message:
            "No active device found for the provided device_fingerprint.",
        },
        { status: 404, headers: CORS_HEADERS },
      );
    }

    const {
      data: conflictingDevices,
      error: conflictingError,
    } = await admin
      .from("android_devices")
      .select("id")
      .eq("device_id", rustdeskId)
      .neq("id", deviceRow.id)
      .is("deleted_at", null);

    if (conflictingError) {
      logError(
        "provision_rustdesk_id",
        "Error checking for RustDesk ID conflicts in android_devices",
        {
          requestId,
          clientIp,
          rustdeskId,
          error: safeError(conflictingError),
        },
      );

      return NextResponse.json(
        {
          error: "database_error",
          message: "Failed to verify RustDesk ID uniqueness",
        },
        { status: 502, headers: CORS_HEADERS },
      );
    }

    if (Array.isArray(conflictingDevices) && conflictingDevices.length > 0) {
      const conflictingIds = conflictingDevices.map((d) => d.id);

      logWarn(
        "provision_rustdesk_id",
        "Found other active android_devices rows with same RustDesk ID; soft-deleting conflicts",
        {
          requestId,
          clientIp,
          rustdeskId,
          conflictingIds,
          keptDeviceRowId: deviceRow.id,
        },
      );

      const { error: softDeleteError } = await admin
        .from("android_devices")
        .update({
          deleted_at: nowIso,
          updated_at: nowIso,
        })
        .in("id", conflictingIds);

      if (softDeleteError) {
        logError(
          "provision_rustdesk_id",
          "Error soft-deleting conflicting android_devices rows for RustDesk ID",
          {
            requestId,
            clientIp,
            rustdeskId,
            conflictingIds,
            error: safeError(softDeleteError),
          },
        );

        return NextResponse.json(
          {
            error: "database_error",
            message: "Failed to resolve RustDesk ID conflicts",
          },
          { status: 502, headers: CORS_HEADERS },
        );
      }
    }

    const {
      error: updateError,
    } = await admin
      .from("android_devices")
      .update({
        device_id: rustdeskId,
        provisioning_status: "ready",
        updated_at: nowIso,
        last_seen_at: nowIso,
      })
      .eq("id", deviceRow.id);

    if (updateError) {
      logError(
        "provision_rustdesk_id",
        "Error updating android_devices with final RustDesk ID",
        {
          requestId,
          clientIp,
          deviceFingerprint,
          rustdeskId,
          deviceRowId: deviceRow.id,
          error: safeError(updateError),
        },
      );

      return NextResponse.json(
        {
          error: "database_error",
          message: "Failed to update device with RustDesk ID",
        },
        { status: 502, headers: CORS_HEADERS },
      );
    }

    logInfo(
      "provision_rustdesk_id",
      "RustDesk ID registration completed successfully",
      {
        requestId,
        clientIp,
        provisionId,
        deviceFingerprint,
        rustdeskId,
        deviceRowId: deviceRow.id,
        owner: deviceRow.owner,
        meshUsername: deviceRow.mesh_username,
      },
    );

    return NextResponse.json(
      {
        success: true,
      },
      { status: 200, headers: CORS_HEADERS },
    );
  } catch (error) {
    logError(
      "provision_rustdesk_id",
      "Unhandled error while processing RustDesk ID registration",
      {
        requestId,
        clientIp,
        deviceFingerprint,
        rustdeskId,
        error: safeError(error),
      },
    );

    return NextResponse.json(
      {
        error: "internal_error",
        message: "Erro interno ao registar RustDesk ID.",
      },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}