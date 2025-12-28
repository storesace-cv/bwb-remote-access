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
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

// Temporal matching function
async function performTemporalMatching(
  supabase: ReturnType<typeof createClient>,
  sessionId: string,
  userId: string,
  sessionClickedAt: string,
  logger: ReturnType<typeof createLogger>,
): Promise<{ device_id: string; friendly_name?: string } | null> {
  try {
    logger.info("Starting temporal matching", { sessionId });

    const clickedDate = new Date(sessionClickedAt);
    const windowStart = clickedDate;
    const windowEnd = new Date(clickedDate.getTime() + 8 * 60 * 1000);
    const windowStartISO = windowStart.toISOString();
    const windowEndISO = windowEnd.toISOString();

    logger.info("Looking for orphan devices", { windowStart: windowStartISO, windowEnd: windowEndISO });

    const { data: orphanDevices, error: orphanError } = await supabase
      .from("android_devices")
      .select("device_id, friendly_name, last_seen_at, created_at")
      .is("owner", null)
      .is("deleted_at", null)
      .gte("last_seen_at", windowStartISO)
      .lte("last_seen_at", windowEndISO)
      .order("last_seen_at", { ascending: false });

    if (orphanError) {
      logger.error("Error fetching orphans", { error: orphanError.message });
      return null;
    }

    if (!orphanDevices || orphanDevices.length === 0) {
      logger.info("No orphan devices found in time window");
      return null;
    }

    logger.info("Found orphan devices", { count: orphanDevices.length });

    const matchedDevice = orphanDevices[0];
    logger.info("Matched device", { device_id: matchedDevice.device_id });

    const { data: meshUser } = await supabase
      .from("mesh_users")
      .select("id, mesh_username")
      .eq("auth_user_id", userId)
      .maybeSingle();

    if (!meshUser) {
      logger.error("Mesh user not found", undefined, userId);
      return null;
    }

    logger.info("Assigning device to mesh_user", { meshUserId: meshUser.id }, userId);

    const { error: updateError } = await supabase
      .from("android_devices")
      .update({
        owner: meshUser.id,
        mesh_username: meshUser.mesh_username,
      })
      .eq("device_id", matchedDevice.device_id);

    if (updateError) {
      logger.error("Error updating device", { error: updateError.message });
      return null;
    }

    logger.info("Device assigned successfully", { device_id: matchedDevice.device_id }, userId);

    const now = new Date().toISOString();
    await supabase
      .from("device_registration_sessions")
      .update({
        status: "completed",
        matched_device_id: matchedDevice.device_id,
        matched_at: now,
        updated_at: now,
      })
      .eq("id", sessionId);

    return {
      device_id: matchedDevice.device_id,
      friendly_name: matchedDevice.friendly_name,
    };
  } catch (err) {
    logger.error("Error in temporal matching", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

async function handler(req: Request): Promise<Response> {
  const correlationId = generateCorrelationId();
  const logger = createLogger("check-registration-status", correlationId);

  logger.info("Request received", { method: req.method });

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "GET") {
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

    // Get session_id from URL
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("session_id");

    if (!sessionId) {
      logger.warn("Missing session_id", undefined, userId);
      return jsonResponse(
        { error: "invalid_request", message: "session_id is required" },
        400,
        corsHeaders,
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch session
    const { data: session, error: fetchError } = await supabase
      .from("device_registration_sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .single();

    if (fetchError || !session) {
      logger.warn("Session not found", { sessionId }, userId);
      return jsonResponse(
        { error: "not_found", message: "Session not found" },
        404,
        corsHeaders,
      );
    }

    // Check expiration
    const now = new Date();
    const expiresAt = new Date(session.expires_at);
    const isExpired = now > expiresAt;

    // Update expired sessions
    if (isExpired && session.status === "awaiting_device") {
      await supabase
        .from("device_registration_sessions")
        .update({
          status: "expired",
          updated_at: new Date().toISOString(),
        })
        .eq("id", sessionId);

      session.status = "expired";
      logger.info("Session expired", { sessionId }, userId);
    }

    // Attempt temporal matching if still awaiting
    let deviceInfo = null;
    if (session.status === "awaiting_device" && !isExpired) {
      logger.info("Attempting temporal matching", { sessionId }, userId);

      const matchResult = await performTemporalMatching(
        supabase,
        sessionId,
        userId,
        session.clicked_at,
        logger,
      );

      if (matchResult) {
        deviceInfo = matchResult;
        session.status = "completed";
        session.matched_device_id = matchResult.device_id;
        session.matched_at = new Date().toISOString();
      }
    } else if (session.status === "completed" && session.matched_device_id) {
      const { data: device } = await supabase
        .from("android_devices")
        .select("device_id, friendly_name, notes")
        .eq("device_id", session.matched_device_id)
        .single();

      if (device) {
        deviceInfo = device;
      }
    }

    const timeRemaining = isExpired ? 0 : Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));

    logger.info("Returning status", { status: session.status, timeRemaining }, userId);

    return jsonResponse(
      {
        success: true,
        status: session.status,
        expires_at: session.expires_at,
        time_remaining_seconds: timeRemaining,
        device_info: deviceInfo,
        matched_at: session.matched_at,
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
