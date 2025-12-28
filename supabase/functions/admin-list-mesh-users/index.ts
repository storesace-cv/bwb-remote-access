// Version: 2025-12-22T00:32:00Z - Added minisiteadmin support
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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

  if (req.method !== "GET") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[admin-list-mesh-users] Missing Supabase env vars");
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
      console.log("[admin-list-mesh-users] Missing Authorization header");
      return jsonResponse(
        {
          error: "unauthorized",
          message: "Missing or invalid Authorization header",
        },
        401,
      );
    }

    const jwt = authHeader.substring(7);

    // Validate JWT using service role key to bypass RLS
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
        "[admin-list-mesh-users] JWT validation failed:",
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
    const authUserId = user?.id;

    if (!authUserId) {
      console.log("[admin-list-mesh-users] No user ID in token");
      return jsonResponse(
        {
          error: "unauthorized",
          message: "Invalid user",
        },
        401,
      );
    }

    console.log(`[admin-list-mesh-users] Caller auth_user_id: ${authUserId}`);

    // Get caller's mesh_user record to check user_type and domain
    // Use service_role to bypass RLS
    const callerCheck = await fetchSupabaseJson(
      `/rest/v1/mesh_users?select=user_type,domain&auth_user_id=eq.${authUserId}`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          Accept: "application/json",
        },
      },
    );

    if (!callerCheck.ok) {
      console.error(
        "[admin-list-mesh-users] Failed to get caller info:",
        callerCheck.status,
        callerCheck.text,
      );
      return jsonResponse(
        {
          error: "forbidden",
          message: "Failed to verify user permissions",
        },
        403,
      );
    }

    const callerData = Array.isArray(callerCheck.data) ? callerCheck.data : [];
    if (callerData.length === 0) {
      console.log("[admin-list-mesh-users] No mesh_user record found for auth_user_id:", authUserId);
      return jsonResponse(
        {
          error: "forbidden",
          message: "User not found in mesh_users table",
        },
        403,
      );
    }

    const callerRecord = callerData[0] as { user_type?: string; domain?: string };
    const userType = callerRecord.user_type;
    const userDomain = callerRecord.domain ?? null;

    console.log(`[admin-list-mesh-users] Caller user_type: ${userType}, domain: ${userDomain}`);

    // Check if user is siteadmin, minisiteadmin, or agent
    const isSiteadmin = userType === "siteadmin";
    const isMinisiteadmin = userType === "minisiteadmin";
    const isAgent = userType === "agent";

    if (!isSiteadmin && !isMinisiteadmin && !isAgent) {
      console.log(`[admin-list-mesh-users] Access denied: user_type=${userType}`);
      return jsonResponse(
        {
          error: "forbidden",
          message: "Only siteadmins, minisiteadmins, and agents can access this endpoint",
        },
        403,
      );
    }

    console.log(`[admin-list-mesh-users] Access granted: user_type=${userType}`);

    // Build query based on role
    // Use service_role to bypass RLS completely
    let queryUrl = `/rest/v1/mesh_users?select=id,mesh_username,display_name,domain,user_type,auth_user_id,email,created_at&order=domain.asc.nullsfirst,mesh_username.asc`;

    // Role-based filtering:
    // - Siteadmins see all domains (no filter)
    // - Minisiteadmins see only their domain
    // - Agents see only their domain
    if (isMinisiteadmin && userDomain) {
      console.log(`[admin-list-mesh-users] Minisiteadmin filtering by domain: ${userDomain}`);
      queryUrl += `&domain=eq.${encodeURIComponent(userDomain)}`;
    } else if (isAgent && userDomain) {
      console.log(`[admin-list-mesh-users] Agent filtering by domain: ${userDomain}`);
      queryUrl += `&domain=eq.${encodeURIComponent(userDomain)}`;
    }
    // Siteadmins see all domains (no filter applied)

    const meshQuery = await fetchSupabaseJson(
      queryUrl,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          Accept: "application/json",
        },
      },
    );

    if (!meshQuery.ok) {
      console.error(
        "[admin-list-mesh-users] Error fetching mesh_users:",
        meshQuery.status,
        meshQuery.text,
      );
      return jsonResponse(
        {
          error: "database_error",
          message: "Failed to fetch mesh users",
        },
        502,
      );
    }

    const rows = Array.isArray(meshQuery.data) ? meshQuery.data : [];
    console.log(`[admin-list-mesh-users] Returning ${rows.length} users`);

    return jsonResponse({ users: rows } as Record<string, unknown>, 200);
  } catch (err) {
    console.error("[admin-list-mesh-users] Unhandled error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(
      { error: "internal_error", message },
      500,
    );
  }
}

serve(handler);