import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";

const SYNC_API_URL_DEFAULT = "http://127.0.0.1:3001/sync";

function getBearerToken(req: Request): string | null {
  const header =
    req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const match = header.match(/Bearer\s+(.+)/i);
  return match ? match[1] : null;
}

export async function POST(req: Request) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.json(
      {
        error: "config_error",
        message: "Supabase URL or anon key not configured",
      },
      { status: 500 },
    );
  }

  const jwt = getBearerToken(req);
  if (!jwt) {
    return NextResponse.json(
      {
        error: "unauthorized",
        message: "Missing Authorization Bearer token",
      },
      { status: 401 },
    );
  }

  const authResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      apikey: SUPABASE_ANON_KEY,
    },
  });

  if (!authResponse.ok) {
    return NextResponse.json(
      {
        error: "unauthorized",
        message: "Invalid or expired session token",
      },
      { status: 401 },
    );
  }

  let userId: string | null = null;
  try {
    const authJson = (await authResponse.json()) as { id?: string } | null;
    userId = authJson?.id ?? null;
  } catch {
    userId = null;
  }

  const syncSecret = process.env.SYNC_API_SECRET ?? "";
  if (!syncSecret) {
    return NextResponse.json(
      {
        error: "sync_api_not_configured",
        message: "SYNC_API_SECRET is not configured on this server",
      },
      { status: 501 },
    );
  }

  const syncUrl =
    process.env.SYNC_API_URL && process.env.SYNC_API_URL.length > 0
      ? process.env.SYNC_API_URL
      : SYNC_API_URL_DEFAULT;

  try {
    const syncResponse = await fetch(syncUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${syncSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reason: "dashboard_refresh",
        triggered_by: userId,
        triggered_at: new Date().toISOString(),
      }),
    });

    let payload: unknown = null;
    try {
      payload = await syncResponse.json();
    } catch {
      payload = null;
    }

    if (!syncResponse.ok) {
      const status = syncResponse.status || 502;
      const message =
        (payload as { message?: string } | null)?.message ??
        "Failed to trigger sync with RustDesk";

      return NextResponse.json(
        {
          error:
            (payload as { error?: string } | null)?.error ??
            "sync_api_error",
          message,
          status,
        },
        { status },
      );
    }

    return NextResponse.json(
      {
        success: true,
        ...(payload as Record<string, unknown> | null),
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Unexpected error contacting sync API";

    return NextResponse.json(
      {
        error: "sync_api_unreachable",
        message,
      },
      { status: 502 },
    );
  }
}