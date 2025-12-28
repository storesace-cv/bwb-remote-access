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
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

async function handler(req: Request): Promise<Response> {
  const correlationId = generateCorrelationId();
  const logger = createLogger("get-qr", correlationId);

  logger.info("Request received", { method: req.method });

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "GET" && req.method !== "POST") {
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

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch RustDesk settings
    const { data: settings, error: settingsError } = await supabase
      .from("rustdesk_settings")
      .select("host, relay, key")
      .eq("id", 1)
      .single();

    if (settingsError || !settings) {
      logger.error("Error fetching RustDesk settings", { error: settingsError?.message }, userId);
      return jsonResponse(
        { error: "config_error", message: "RustDesk configuration not found" },
        500,
        corsHeaders,
      );
    }

    // Fetch or create registration token
    const { data: tokenData, error: tokenError } = await supabase
      .from("device_registration_tokens")
      .select("token, expires_at")
      .eq("user_id", userId)
      .eq("is_active", true)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    let registrationToken;

    if (tokenError || !tokenData) {
      // Create new token
      const { data: newToken, error: insertError } = await supabase
        .from("device_registration_tokens")
        .insert({ user_id: userId })
        .select("token")
        .single();

      if (insertError || !newToken) {
        logger.error("Error creating registration token", { error: insertError?.message }, userId);
        return jsonResponse(
          { error: "token_error", message: "Failed to create registration token" },
          500,
          corsHeaders,
        );
      }

      registrationToken = newToken.token;
      logger.info("Created new registration token", undefined, userId);
    } else {
      registrationToken = tokenData.token;
      logger.info("Using existing registration token", undefined, userId);
    }

    const config = {
      host: settings.host,
      relay: settings.relay,
      key: settings.key,
      registration_token: registrationToken,
    };

    const configString = `config=${JSON.stringify(config)}`;
    logger.info("Returning config with registration token", undefined, userId);

    return jsonResponse(
      { success: true, config: configString, raw_config: config },
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
