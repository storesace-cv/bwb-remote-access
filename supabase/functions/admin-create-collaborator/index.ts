<![CDATA[
// Version: 2025-12-22T19:54:00Z - Fixed auth pattern to match admin-list-groups (service role key)
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

interface CreateCollaboratorRequest {
  email: string;
  password: string;
  display_name?: string;
  mesh_username: string;
  email_confirm?: boolean;
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
    console.log("[admin-create-collaborator] OPTIONS preflight request");
    return new Response("ok", { headers: corsHeaders });
  }

  // Wrap entire handler in try-catch to ensure errors return CORS headers
  try {
    if (req.method !== "POST") {
      console.log(`[admin-create-collaborator] Invalid method: ${req.method}`);
      return jsonResponse({ error: "method_not_allowed" }, 405);
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("[admin-create-collaborator] Missing Supabase env vars");
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
      console.log("[admin-create-collaborator] Missing Authorization header");
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
        "[admin-create-collaborator] JWT validation failed:",
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
      console.log("[admin-create-collaborator] No user ID in token");
      return jsonResponse(
        {
          error: "unauthorized",
          message: "Invalid user",
        },
        401,
      );
    }

    console.log(`[admin-create-collaborator] Caller auth_user_id: ${authUserId}`);

    // Get caller's mesh_user record to check user_type and get agent context
    const callerCheck = await fetchSupabaseJson(
      `/rest/v1/mesh_users?select=id,user_type,agent_id,domain,domain_key&auth_user_id=eq.${authUserId}`,
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
        "[admin-create-collaborator] Failed to get caller info:",
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
      console.log("[admin-create-collaborator] No mesh_user record found for auth_user_id:", authUserId);
      return jsonResponse(
        {
          error: "forbidden",
          message: "User not found in mesh_users table",
        },
        403,
      );
    }

    const callerRecord = callerData[0] as { 
      id?: string; 
      user_type?: string; 
      agent_id?: string;
      domain?: string;
      domain_key?: string;
    };
    const callerId = callerRecord.id;
    const userType = callerRecord.user_type;
    const agentId = callerRecord.agent_id;
    const domain = callerRecord.domain;
    const domainKey = callerRecord.domain_key;

    console.log(`[admin-create-collaborator] Caller user_type: ${userType}, agent_id: ${agentId}`);

    // Check if user is agent, minisiteadmin, or siteadmin
    if (!["agent", "minisiteadmin", "siteadmin"].includes(userType ?? "")) {
      console.log(`[admin-create-collaborator] Access denied: user_type=${userType}`);
      return jsonResponse(
        {
          error: "forbidden",
          message: "Only agents, minisiteadmins, and siteadmins can create collaborators",
        },
        403,
      );
    }

    console.log(`[admin-create-collaborator] Access granted: user_type=${userType}`);

    // Parse request body
    const body = await req.json() as CreateCollaboratorRequest;
    const { email, password, display_name, mesh_username, email_confirm = false } = body;

    if (!email || !password || !mesh_username) {
      return jsonResponse(
        {
          error: "bad_request",
          message: "email, password, and mesh_username are required",
        },
        400,
      );
    }

    // Create auth user using Admin API
    const createUserPayload = {
      email,
      password,
      email_confirm,
      user_metadata: { display_name: display_name || null },
    };

    const createUserQuery = await fetchSupabaseJson(
      `/auth/v1/admin/users`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(createUserPayload),
      },
    );

    if (!createUserQuery.ok) {
      console.error("[admin-create-collaborator] Failed to create auth user:", createUserQuery.status, createUserQuery.text);
      return jsonResponse(
        {
          error: "auth_error",
          message: "Failed to create auth user",
          details: createUserQuery.text,
        },
        502,
      );
    }

    const userData = createUserQuery.data as { id?: string } | null;
    const newAuthUserId = userData?.id;

    if (!newAuthUserId) {
      return jsonResponse(
        {
          error: "auth_error",
          message: "Auth user created but no ID returned",
        },
        502,
      );
    }

    console.log(`[admin-create-collaborator] Created auth user: ${newAuthUserId}`);

    // Create mesh_users entry
    const meshUserPayload = {
      auth_user_id: newAuthUserId,
      mesh_username,
      email,
      display_name: display_name || null,
      user_type: "colaborador",
      parent_agent_id: callerId,
      agent_id: agentId,
      domain: domain,
      domain_key: domainKey,
    };

    const createMeshUserQuery = await fetchSupabaseJson(
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
        body: JSON.stringify(meshUserPayload),
      },
    );

    if (!createMeshUserQuery.ok) {
      console.error("[admin-create-collaborator] Failed to create mesh_users entry:", createMeshUserQuery.status, createMeshUserQuery.text);
      
      // Rollback: delete auth user
      console.log("[admin-create-collaborator] Rolling back auth user creation...");
      await fetchSupabaseJson(
        `/auth/v1/admin/users/${newAuthUserId}`,
        {
          method: "DELETE",
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
        },
      );

      return jsonResponse(
        {
          error: "database_error",
          message: "Failed to create mesh_users entry (auth user rolled back)",
          details: createMeshUserQuery.text,
        },
        502,
      );
    }

    const meshUserData = Array.isArray(createMeshUserQuery.data) ? createMeshUserQuery.data : [];
    if (meshUserData.length === 0) {
      return jsonResponse(
        {
          error: "database_error",
          message: "Mesh user created but not returned",
        },
        502,
      );
    }

    console.log(`[admin-create-collaborator] Successfully created collaborator: ${mesh_username}`);

    return jsonResponse(
      {
        success: true,
        message: "Collaborator created successfully",
        user_id: newAuthUserId,
        email,
        mesh_username,
      } as Record<string, unknown>,
      201,
    );
  } catch (err) {
    // CRITICAL: Catch all errors and return with CORS headers
    console.error("[admin-create-collaborator] Unhandled error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(
      { error: "internal_error", message },
      500,
    );
  }
}

serve(handler);
]]></![CDATA[>