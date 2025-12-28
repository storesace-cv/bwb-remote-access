// Version: 2025-12-22T22:40:00Z - Initial implementation
// Purpose: Create minisiteadmin users (domain super-admins)
// Access: Only siteadmins can create minisiteadmins
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface CreateMinisiteadminRequest {
  email: string;
  password: string;
  mesh_username: string;
  display_name?: string;
  domain: string;
}

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
  // CRITICAL: Handle OPTIONS first, before ANY other code
  if (req.method === "OPTIONS") {
    console.log("[admin-create-minisiteadmin] OPTIONS preflight request");
    return new Response("ok", { headers: corsHeaders });
  }

  // Wrap entire handler in try-catch to ensure errors return CORS headers
  try {
    if (req.method !== "POST") {
      console.log(`[admin-create-minisiteadmin] Invalid method: ${req.method}`);
      return jsonResponse({ error: "method_not_allowed" }, 405);
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("[admin-create-minisiteadmin] Missing Supabase env vars");
      return jsonResponse(
        {
          error: "config_error",
          message: "Missing Supabase configuration",
        },
        500,
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("[admin-create-minisiteadmin] Missing Authorization header");
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
        "[admin-create-minisiteadmin] JWT validation failed:",
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
      console.log("[admin-create-minisiteadmin] No user ID in token");
      return jsonResponse(
        {
          error: "unauthorized",
          message: "Invalid user",
        },
        401,
      );
    }

    console.log(`[admin-create-minisiteadmin] Caller auth_user_id: ${authUserId}`);

    // Get caller's mesh_user record to verify they are a siteadmin
    const callerCheck = await fetchSupabaseJson(
      `/rest/v1/mesh_users?select=id,user_type,domain&auth_user_id=eq.${authUserId}`,
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
        "[admin-create-minisiteadmin] Failed to get caller info:",
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
      console.log("[admin-create-minisiteadmin] No mesh_user record found for auth_user_id:", authUserId);
      return jsonResponse(
        {
          error: "forbidden",
          message: "User not found in mesh_users table",
        },
        403,
      );
    }

    const callerRecord = callerData[0] as { id?: string; user_type?: string; domain?: string };
    const userType = callerRecord.user_type;

    console.log(`[admin-create-minisiteadmin] Caller user_type: ${userType}`);

    // CRITICAL: Only siteadmins can create minisiteadmins
    if (userType !== "siteadmin") {
      console.log(`[admin-create-minisiteadmin] Access denied: user_type=${userType}`);
      return jsonResponse(
        {
          error: "forbidden",
          message: "Only siteadmins can create minisiteadmin users",
        },
        403,
      );
    }

    console.log(`[admin-create-minisiteadmin] Access granted: user_type=${userType}`);

    // Parse request body
    const body = await req.json() as CreateMinisiteadminRequest;

    // Validate required fields
    if (!body.email || !body.email.trim()) {
      return jsonResponse(
        {
          error: "bad_request",
          message: "email is required",
        },
        400,
      );
    }

    if (!body.password || body.password.length < 6) {
      return jsonResponse(
        {
          error: "bad_request",
          message: "password is required and must be at least 6 characters",
        },
        400,
      );
    }

    if (!body.mesh_username || !body.mesh_username.trim()) {
      return jsonResponse(
        {
          error: "bad_request",
          message: "mesh_username is required",
        },
        400,
      );
    }

    if (!body.domain || !body.domain.trim()) {
      return jsonResponse(
        {
          error: "bad_request",
          message: "domain is required for minisiteadmin",
        },
        400,
      );
    }

    const email = body.email.trim().toLowerCase();
    const meshUsername = body.mesh_username.trim().toLowerCase();
    const domain = body.domain.trim();
    const displayName = body.display_name?.trim() || meshUsername;

    // Check if email already exists in auth.users
    const emailCheck = await fetchSupabaseJson(
      `/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
      {
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          apikey: SUPABASE_SERVICE_ROLE_KEY,
        },
      },
    );

    if (emailCheck.ok) {
      const existingUsers = Array.isArray(emailCheck.data) ? emailCheck.data : [];
      if (existingUsers.length > 0) {
        return jsonResponse(
          {
            error: "conflict",
            message: "User with this email already exists",
          },
          409,
        );
      }
    }

    // Check if mesh_username already exists in the domain
    const usernameCheck = await fetchSupabaseJson(
      `/rest/v1/mesh_users?select=id&domain=eq.${encodeURIComponent(domain)}&mesh_username=eq.${encodeURIComponent(meshUsername)}`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          Accept: "application/json",
        },
      },
    );

    if (usernameCheck.ok && Array.isArray(usernameCheck.data)) {
      if (usernameCheck.data.length > 0) {
        return jsonResponse(
          {
            error: "conflict",
            message: "Username already exists in this domain",
          },
          409,
        );
      }
    }

    // Create auth user using Admin API
    const createAuthUser = await fetchSupabaseJson(
      `/auth/v1/admin/users`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email,
          password: body.password,
          email_confirm: true,
          user_metadata: {
            display_name: displayName,
          },
        }),
      },
    );

    if (!createAuthUser.ok) {
      console.error(
        "[admin-create-minisiteadmin] Failed to create auth user:",
        createAuthUser.status,
        createAuthUser.text,
      );
      return jsonResponse(
        {
          error: "auth_error",
          message: "Failed to create authentication user",
          details: createAuthUser.text,
        },
        502,
      );
    }

    const authUserData = createAuthUser.data as { id?: string } | null;
    const newAuthUserId = authUserData?.id;

    if (!newAuthUserId) {
      console.error("[admin-create-minisiteadmin] No auth user ID returned");
      return jsonResponse(
        {
          error: "auth_error",
          message: "Failed to get new user ID",
        },
        502,
      );
    }

    console.log(`[admin-create-minisiteadmin] Created auth user: ${newAuthUserId}`);

    // Create mesh_users entry with user_type='minisiteadmin'
    // Minisiteadmins:
    // - parent_agent_id = NULL (they are top-level)
    // - agent_id = self-reference (they own their domain tenant)
    const domainKey = domain === "" ? "mesh" : domain;
    const externalUserId = domain === "" || domain === "mesh" 
      ? `user//${meshUsername}`
      : `user/${domain}/${meshUsername}`;

    const insertPayload = {
      auth_user_id: newAuthUserId,
      mesh_username: meshUsername,
      display_name: displayName,
      email: email,
      domain: domain,
      domain_key: domainKey,
      external_user_id: externalUserId,
      user_type: "minisiteadmin",
      parent_agent_id: null,
      agent_id: null, // Will be updated after insert to self-reference
      source: "app",
    };

    const createMeshUser = await fetchSupabaseJson(
      `/rest/v1/mesh_users`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(insertPayload),
      },
    );

    if (!createMeshUser.ok) {
      console.error(
        "[admin-create-minisiteadmin] Failed to create mesh_user:",
        createMeshUser.status,
        createMeshUser.text,
      );

      // Rollback: Delete auth user
      await fetchSupabaseJson(
        `/auth/v1/admin/users/${newAuthUserId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            apikey: SUPABASE_SERVICE_ROLE_KEY,
          },
        },
      );

      return jsonResponse(
        {
          error: "database_error",
          message: "Failed to create minisiteadmin record",
          details: createMeshUser.text,
        },
        502,
      );
    }

    const meshUsers = Array.isArray(createMeshUser.data) ? createMeshUser.data : [];
    if (meshUsers.length === 0) {
      console.error("[admin-create-minisiteadmin] No mesh_user returned");
      return jsonResponse(
        {
          error: "database_error",
          message: "Minisiteadmin created but not returned",
        },
        502,
      );
    }

    const meshUser = meshUsers[0] as { id: string };
    const meshUserId = meshUser.id;

    // Update agent_id to self-reference
    const updateAgentId = await fetchSupabaseJson(
      `/rest/v1/mesh_users?id=eq.${meshUserId}`,
      {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ agent_id: meshUserId }),
      },
    );

    if (!updateAgentId.ok) {
      console.error(
        "[admin-create-minisiteadmin] Failed to update agent_id:",
        updateAgentId.status,
        updateAgentId.text,
      );
      // Non-critical error, but log it
    }

    console.log(`[admin-create-minisiteadmin] Successfully created minisiteadmin: ${meshUserId} in domain: ${domain}`);

    return jsonResponse(
      {
        success: true,
        minisiteadmin: {
          id: meshUserId,
          auth_user_id: newAuthUserId,
          email: email,
          mesh_username: meshUsername,
          display_name: displayName,
          domain: domain,
          user_type: "minisiteadmin",
        },
      } as Record<string, unknown>,
      201,
    );
  } catch (err) {
    // CRITICAL: Catch all errors and return with CORS headers
    console.error("[admin-create-minisiteadmin] Unhandled error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(
      { error: "internal_error", message },
      500,
    );
  }
}

serve(handler);