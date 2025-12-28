// Sprint 1: Security Hardening - Centralized auth + structured logging
export const config = { verify_jwt: false };

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
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
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function handler(req: Request): Promise<Response> {
  const correlationId = generateCorrelationId();
  const logger = createLogger("start-registration-session", correlationId);

  logger.info("Request received", { method: req.method });

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      logger.warn("Method not allowed", { method: req.method });
      return jsonResponse({ error: "method_not_allowed" }, 405, corsHeaders);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      logger.error("Missing Supabase configuration");
      return jsonResponse(
        { error: "config_error", message: "Missing Supabase configuration" },
        500,
        corsHeaders,
      );
    }

    // Validate JWT using centralized auth
    const authHeader = req.headers.get("Authorization");
    const authResult = await validateJwt(authHeader, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, logger);

    if (!authResult.ok) {
      return authErrorResponse(authResult, corsHeaders);
    }

    const userId = authResult.context.authUserId;
    if (!userId) {
      logger.warn("No user ID in token");
      return jsonResponse(
        { error: "unauthorized", message: "Invalid user" },
        401,
        corsHeaders,
      );
    }

    logger.info("User authenticated", undefined, userId);

    const ADMIN_AUTH_USER_ID =
      Deno.env.get("ADMIN_AUTH_USER_ID") ??
      "9ebfa3dd-392c-489d-882f-8a1762cb36e8";

    if (userId === ADMIN_AUTH_USER_ID) {
      logger.warn("Canonical admin cannot start registration sessions", undefined, userId);
      return jsonResponse(
        {
          error: "forbidden",
          message: "A conta de administração não pode iniciar sessões de registo de dispositivos. Usa uma conta de técnico/loja.",
        },
        403,
        corsHeaders,
      );
    }

    // Capture request info
    const ip_address = req.headers.get("x-forwarded-for") ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const user_agent = req.headers.get("user-agent") || "unknown";

    // Try to get geolocation from body
    let geolocation = null;
    try {
      const body = await req.json();
      if (body.geolocation) {
        geolocation = body.geolocation;
      }
    } catch {
      // Empty or invalid body, no problem
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Expire old sessions
    const { error: expireError } = await supabase
      .from("device_registration_sessions")
      .update({
        status: "expired",
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("status", "awaiting_device")
      .lt("expires_at", new Date().toISOString());

    if (expireError) {
      logger.warn("Error expiring old sessions", { error: expireError.message }, userId);
    }

    // Create new session
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    const { data: session, error: insertError } = await supabase
      .from("device_registration_sessions")
      .insert({
        user_id: userId,
        clicked_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
        ip_address,
        user_agent,
        geolocation,
        status: "awaiting_device",
      })
      .select()
      .single();

    if (insertError) {
      logger.error("Error creating session", { error: insertError.message }, userId);
      return jsonResponse(
        { error: "database_error", message: insertError.message },
        500,
        corsHeaders,
      );
    }

    logger.info("Session created", { sessionId: session.id }, userId);

    return jsonResponse(
      {
        success: true,
        session_id: session.id,
        expires_at: session.expires_at,
        expires_in_seconds: 300,
      },
      200,
      corsHeaders,
    );
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
