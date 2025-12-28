/**
 * Centralized JWT validation and structured logging for Edge Functions
 * Sprint 1: Security Hardening
 * 
 * This module provides:
 * 1. Consistent JWT validation with signature and expiration checks
 * 2. Detection of service_role vs user tokens
 * 3. Structured logging with correlation IDs
 */

// =============================================================================
// Types
// =============================================================================

export interface AuthContext {
  authUserId: string | null;
  role: string | null;
  isServiceRole: boolean;
}

export interface AuthResult {
  ok: boolean;
  context: AuthContext;
  error?: {
    code: string;
    message: string;
    status: number;
  };
}

export type LogLevel = "info" | "warn" | "error" | "debug";

export interface LogEntry {
  level: LogLevel;
  action: string;
  correlationId: string;
  authUserId?: string | null;
  message?: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

// =============================================================================
// Correlation ID Generation
// =============================================================================

/**
 * Generates a unique correlation ID for request tracing
 */
export function generateCorrelationId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${random}`;
}

// =============================================================================
// Structured Logging
// =============================================================================

/**
 * Creates a structured log entry and outputs to console
 */
export function log(
  level: LogLevel,
  action: string,
  correlationId: string,
  message?: string,
  data?: Record<string, unknown>,
  authUserId?: string | null,
): void {
  const entry: LogEntry = {
    level,
    action,
    correlationId,
    timestamp: new Date().toISOString(),
  };

  if (authUserId !== undefined) {
    entry.authUserId = authUserId;
  }

  if (message) {
    entry.message = message;
  }

  if (data && Object.keys(data).length > 0) {
    entry.data = data;
  }

  // Output as JSON for structured log aggregation
  const logLine = JSON.stringify(entry);

  switch (level) {
    case "error":
      console.error(logLine);
      break;
    case "warn":
      console.warn(logLine);
      break;
    case "debug":
      console.debug(logLine);
      break;
    default:
      console.log(logLine);
  }
}

/**
 * Creates a logger bound to a specific action and correlation ID
 */
export function createLogger(action: string, correlationId: string) {
  return {
    info: (message?: string, data?: Record<string, unknown>, authUserId?: string | null) =>
      log("info", action, correlationId, message, data, authUserId),
    warn: (message?: string, data?: Record<string, unknown>, authUserId?: string | null) =>
      log("warn", action, correlationId, message, data, authUserId),
    error: (message?: string, data?: Record<string, unknown>, authUserId?: string | null) =>
      log("error", action, correlationId, message, data, authUserId),
    debug: (message?: string, data?: Record<string, unknown>, authUserId?: string | null) =>
      log("debug", action, correlationId, message, data, authUserId),
  };
}

// =============================================================================
// JWT Parsing (Local - No Network Call)
// =============================================================================

interface JwtPayload {
  sub?: string;
  role?: string;
  exp?: number;
  iat?: number;
  aud?: string;
}

/**
 * Decodes a JWT payload without verifying signature (for claim extraction only)
 * Signature verification is done via Supabase Auth API
 */
function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return null;
    }

    // Base64URL decode the payload
    const payloadBase64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payloadJson = atob(payloadBase64);
    const payload = JSON.parse(payloadJson) as JwtPayload;

    return payload;
  } catch {
    return null;
  }
}

/**
 * Checks if a token has expired based on the exp claim
 */
function isTokenExpired(payload: JwtPayload): boolean {
  if (!payload.exp) {
    return false; // No expiration claim, consider valid
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  return payload.exp < nowSeconds;
}

// =============================================================================
// Service Role Detection
// =============================================================================

/**
 * Detects if the provided token is a service_role token
 * Service role tokens have role="service_role" in the JWT payload
 */
function isServiceRoleToken(token: string, serviceRoleKey: string): boolean {
  // Direct match with the service role key
  if (token === serviceRoleKey) {
    return true;
  }

  // Check the JWT role claim
  const payload = decodeJwtPayload(token);
  if (payload && payload.role === "service_role") {
    return true;
  }

  return false;
}

// =============================================================================
// JWT Validation
// =============================================================================

/**
 * Validates a JWT token against Supabase Auth API
 * 
 * @param authHeader - The Authorization header value (e.g., "Bearer eyJ...")
 * @param supabaseUrl - The Supabase project URL
 * @param serviceRoleKey - The Supabase service role key for API calls
 * @param logger - Optional logger for structured logging
 * @returns AuthResult with context or error
 */
export async function validateJwt(
  authHeader: string | null,
  supabaseUrl: string,
  serviceRoleKey: string,
  logger?: ReturnType<typeof createLogger>,
): Promise<AuthResult> {
  // Check for missing header
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    logger?.warn("Missing or invalid Authorization header");
    return {
      ok: false,
      context: { authUserId: null, role: null, isServiceRole: false },
      error: {
        code: "unauthorized",
        message: "Missing or invalid Authorization header",
        status: 401,
      },
    };
  }

  const token = authHeader.substring(7);

  // Check for empty token
  if (!token || token.trim().length === 0) {
    logger?.warn("Empty token provided");
    return {
      ok: false,
      context: { authUserId: null, role: null, isServiceRole: false },
      error: {
        code: "unauthorized",
        message: "Empty token provided",
        status: 401,
      },
    };
  }

  // Check if this is a service role token
  const isServiceRole = isServiceRoleToken(token, serviceRoleKey);
  if (isServiceRole) {
    logger?.info("Service role token detected");
    return {
      ok: true,
      context: {
        authUserId: null,
        role: "service_role",
        isServiceRole: true,
      },
    };
  }

  // Decode and check expiration locally first (fast fail)
  const payload = decodeJwtPayload(token);
  if (!payload) {
    logger?.warn("Failed to decode JWT payload");
    return {
      ok: false,
      context: { authUserId: null, role: null, isServiceRole: false },
      error: {
        code: "unauthorized",
        message: "Invalid token format",
        status: 401,
      },
    };
  }

  // Check expiration
  if (isTokenExpired(payload)) {
    logger?.warn("Token has expired", { exp: payload.exp });
    return {
      ok: false,
      context: { authUserId: null, role: null, isServiceRole: false },
      error: {
        code: "unauthorized",
        message: "Token has expired",
        status: 401,
      },
    };
  }

  // Validate signature via Supabase Auth API
  try {
    const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: serviceRoleKey,
      },
    });

    if (!authResponse.ok) {
      logger?.warn("JWT signature validation failed", { status: authResponse.status });
      return {
        ok: false,
        context: { authUserId: null, role: null, isServiceRole: false },
        error: {
          code: "unauthorized",
          message: "Invalid or expired token",
          status: 401,
        },
      };
    }

    const user = await authResponse.json() as { id?: string; role?: string };
    const authUserId = user.id ?? null;
    const role = payload.role ?? user.role ?? null;

    if (!authUserId) {
      logger?.warn("No user ID in validated token");
      return {
        ok: false,
        context: { authUserId: null, role: null, isServiceRole: false },
        error: {
          code: "unauthorized",
          message: "Invalid user",
          status: 401,
        },
      };
    }

    logger?.info("JWT validated successfully", undefined, authUserId);

    return {
      ok: true,
      context: {
        authUserId,
        role,
        isServiceRole: false,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger?.error("JWT validation request failed", { error: message });
    return {
      ok: false,
      context: { authUserId: null, role: null, isServiceRole: false },
      error: {
        code: "upstream_error",
        message: "Failed to validate token",
        status: 502,
      },
    };
  }
}

// =============================================================================
// Input Validation Helpers
// =============================================================================

/**
 * Validates a device_id: must be digits only, length 6-12
 */
export function validateDeviceId(deviceId: unknown): { valid: boolean; value: string; error?: string } {
  if (typeof deviceId !== "string") {
    return { valid: false, value: "", error: "device_id must be a string" };
  }

  const trimmed = deviceId.trim().replace(/\s+/g, "");

  if (trimmed.length === 0) {
    return { valid: false, value: "", error: "device_id is required" };
  }

  // Must be digits only
  if (!/^\d+$/.test(trimmed)) {
    return { valid: false, value: trimmed, error: "device_id must contain only digits" };
  }

  // Length must be 6-12
  if (trimmed.length < 6 || trimmed.length > 12) {
    return { valid: false, value: trimmed, error: "device_id must be between 6 and 12 digits" };
  }

  return { valid: true, value: trimmed };
}

/**
 * Validates a mesh_username: must be non-empty, allowed characters only
 * Allowed: alphanumeric, dots, underscores, hyphens, @ (for email-like usernames)
 */
export function validateMeshUsername(username: unknown): { valid: boolean; value: string; error?: string } {
  if (typeof username !== "string") {
    return { valid: false, value: "", error: "mesh_username must be a string" };
  }

  const trimmed = username.trim();

  if (trimmed.length === 0) {
    return { valid: false, value: "", error: "mesh_username is required" };
  }

  // Max length 255
  if (trimmed.length > 255) {
    return { valid: false, value: trimmed, error: "mesh_username must not exceed 255 characters" };
  }

  // Allowed characters: alphanumeric, dots, underscores, hyphens, @
  if (!/^[a-zA-Z0-9._@-]+$/.test(trimmed)) {
    return { valid: false, value: trimmed, error: "mesh_username contains invalid characters" };
  }

  return { valid: true, value: trimmed };
}

/**
 * Validates notes field: enforces maximum length
 */
export function validateNotes(notes: unknown): { valid: boolean; value: string | null; error?: string } {
  if (notes === null || notes === undefined) {
    return { valid: true, value: null };
  }

  if (typeof notes !== "string") {
    return { valid: false, value: null, error: "notes must be a string" };
  }

  const trimmed = notes.trim();

  // Max length 1000 characters
  if (trimmed.length > 1000) {
    return { valid: false, value: trimmed, error: "notes must not exceed 1000 characters" };
  }

  return { valid: true, value: trimmed.length > 0 ? trimmed : null };
}

/**
 * Validates a friendly_name: optional, max length 255
 */
export function validateFriendlyName(name: unknown): { valid: boolean; value: string | null; error?: string } {
  if (name === null || name === undefined) {
    return { valid: true, value: null };
  }

  if (typeof name !== "string") {
    return { valid: false, value: null, error: "friendly_name must be a string" };
  }

  const trimmed = name.trim();

  if (trimmed.length > 255) {
    return { valid: false, value: trimmed, error: "friendly_name must not exceed 255 characters" };
  }

  return { valid: true, value: trimmed.length > 0 ? trimmed : null };
}

// =============================================================================
// CORS Headers Helper
// =============================================================================

export const defaultCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, PATCH, OPTIONS",
};

/**
 * Creates a JSON response with CORS headers
 */
export function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
  corsHeaders: Record<string, string> = defaultCorsHeaders,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Creates an error response from an AuthResult error
 */
export function authErrorResponse(
  result: AuthResult,
  corsHeaders: Record<string, string> = defaultCorsHeaders,
): Response {
  if (!result.error) {
    return jsonResponse({ error: "unknown_error", message: "Unknown error" }, 500, corsHeaders);
  }
  return jsonResponse(
    { error: result.error.code, message: result.error.message },
    result.error.status,
    corsHeaders,
  );
}
