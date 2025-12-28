// Sprint 1: Security Hardening - Centralized auth + structured logging
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  validateJwt,
  createLogger,
  generateCorrelationId,
  jsonResponse,
  authErrorResponse,
  defaultCorsHeaders,
} from "../_shared/auth.ts";

const corsHeaders = {
  ...defaultCorsHeaders,
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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
  const correlationId = generateCorrelationId();
  const logger = createLogger("admin-list-mesh-users", correlationId);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    logger.warn("Method not allowed", { method: req.method });
    return jsonResponse({ error: "method_not_allowed" }, 405, corsHeaders);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    logger.error("Missing Supabase configuration");
    return jsonResponse(
      { error: "config_error", message: "Missing Supabase configuration" },
      500,
      corsHeaders,
    );
  }

  try {
    // Validate JWT using centralized auth
    const authHeader = req.headers.get("Authorization");
    const authResult = await validateJwt(authHeader, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, logger);

    if (!authResult.ok) {
      return authErrorResponse(authResult, corsHeaders);
    }

    const authUserId = authResult.context.authUserId;
    if (!authUserId) {
      logger.warn("No user ID in token");
      return jsonResponse(
        { error: "unauthorized", message: "Invalid user" },
        401,
        corsHeaders,
      );
    }

    logger.info("User authenticated", undefined, authUserId);

    // Get caller's mesh_user record
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
      logger.error("Failed to get caller info", { status: callerCheck.status }, authUserId);
      return jsonResponse(
        { error: "forbidden", message: "Failed to verify user permissions" },
        403,
        corsHeaders,
      );
    }

    const callerData = Array.isArray(callerCheck.data) ? callerCheck.data : [];
    if (callerData.length === 0) {
      logger.warn("No mesh_user record found", undefined, authUserId);
      return jsonResponse(
        { error: "forbidden", message: "User not found in mesh_users table" },
        403,
        corsHeaders,
      );
    }

    const callerRecord = callerData[0] as { user_type?: string; domain?: string };
    const userType = callerRecord.user_type;
    const userDomain = callerRecord.domain ?? null;

    logger.info("Caller info", { user_type: userType, domain: userDomain }, authUserId);

    // Check permissions
    const isSiteadmin = userType === "siteadmin";
    const isMinisiteadmin = userType === "minisiteadmin";
    const isAgent = userType === "agent";

    if (!isSiteadmin && !isMinisiteadmin && !isAgent) {
      logger.warn("Access denied", { user_type: userType }, authUserId);
      return jsonResponse(
        { error: "forbidden", message: "Only siteadmins, minisiteadmins, and agents can access this endpoint" },
        403,
        corsHeaders,
      );
    }

    logger.info("Access granted", { user_type: userType }, authUserId);

    // Build query based on role
    let queryUrl = `/rest/v1/mesh_users?select=id,mesh_username,display_name,domain,user_type,auth_user_id,email,created_at&order=domain.asc.nullsfirst,mesh_username.asc`;

    if (isMinisiteadmin && userDomain) {
      logger.info("Filtering by domain", { domain: userDomain }, authUserId);
      queryUrl += `&domain=eq.${encodeURIComponent(userDomain)}`;
    } else if (isAgent && userDomain) {
      logger.info("Filtering by domain", { domain: userDomain }, authUserId);
      queryUrl += `&domain=eq.${encodeURIComponent(userDomain)}`;
    }

    const meshQuery = await fetchSupabaseJson(queryUrl, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Accept: "application/json",
      },
    });

    if (!meshQuery.ok) {
      logger.error("Error fetching mesh_users", { status: meshQuery.status }, authUserId);
      return jsonResponse(
        { error: "database_error", message: "Failed to fetch mesh users" },
        502,
        corsHeaders,
      );
    }

    const rows = Array.isArray(meshQuery.data) ? meshQuery.data : [];
    logger.info("Returning users", { count: rows.length }, authUserId);

    return jsonResponse({ users: rows } as Record<string, unknown>, 200, corsHeaders);
  } catch (err) {
    logger.error("Unhandled error", { error: err instanceof Error ? err.message : String(err) });
    return jsonResponse(
      { error: "internal_error", message: err instanceof Error ? err.message : String(err) },
      500,
      corsHeaders,
    );
  }
}

serve(handler);
