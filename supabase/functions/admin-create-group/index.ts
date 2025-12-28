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
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface CreateGroupRequest {
  name: string;
  description?: string;
  parent_group_id?: string;
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
  const correlationId = generateCorrelationId();
  const logger = createLogger("admin-create-group", correlationId);

  if (req.method === "OPTIONS") {
    logger.info("OPTIONS preflight request");
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      logger.warn("Invalid method", { method: req.method });
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
      `/rest/v1/mesh_users?select=id,user_type,domain,agent_id&auth_user_id=eq.${authUserId}`,
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

    const callerRecord = callerData[0] as { id?: string; user_type?: string; domain?: string; agent_id?: string };
    const callerId = callerRecord.id;
    const userType = callerRecord.user_type;
    const agentId = callerRecord.agent_id ?? null;

    logger.info("Caller info", { user_type: userType, agent_id: agentId }, authUserId);

    // Validate permissions
    if (!["agent", "minisiteadmin", "colaborador", "siteadmin"].includes(userType ?? "")) {
      logger.warn("Access denied", { user_type: userType }, authUserId);
      return jsonResponse(
        { error: "forbidden", message: "Only agents, minisiteadmins, siteadmins, and collaborators can create groups" },
        403,
        corsHeaders,
      );
    }

    logger.info("Access granted", { user_type: userType }, authUserId);

    // Parse request body
    const body = await req.json() as CreateGroupRequest;

    if (!body.name || !body.name.trim()) {
      logger.warn("Missing name", undefined, authUserId);
      return jsonResponse(
        { error: "bad_request", message: "name is required" },
        400,
        corsHeaders,
      );
    }

    const normalizedName = body.name.trim().toLowerCase().replace(/\s+/g, ' ');

    // Validate parent group if provided
    if (body.parent_group_id) {
      const parentCheck = await fetchSupabaseJson(
        `/rest/v1/mesh_groups?select=id,agent_id,level&id=eq.${body.parent_group_id}&deleted_at=is.null`,
        {
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            Accept: "application/json",
          },
        },
      );

      if (!parentCheck.ok) {
        logger.error("Error checking parent group", { status: parentCheck.status }, authUserId);
        return jsonResponse(
          { error: "database_error", message: "Failed to verify parent group" },
          502,
          corsHeaders,
        );
      }

      const parentData = Array.isArray(parentCheck.data) ? parentCheck.data : [];
      if (parentData.length === 0) {
        logger.warn("Parent group not found", { parent_group_id: body.parent_group_id }, authUserId);
        return jsonResponse(
          { error: "not_found", message: "Parent group not found" },
          404,
          corsHeaders,
        );
      }

      const parentGroup = parentData[0] as { agent_id: string; level: number };
      if (parentGroup.agent_id !== agentId) {
        logger.warn("Parent group not in tenant", { parent_agent_id: parentGroup.agent_id, caller_agent_id: agentId }, authUserId);
        return jsonResponse(
          { error: "forbidden", message: "Parent group does not belong to your tenant" },
          403,
          corsHeaders,
        );
      }

      // Enforce 2-level hierarchy
      if (parentGroup.level >= 1) {
        logger.warn("Hierarchy limit exceeded", { parent_level: parentGroup.level }, authUserId);
        return jsonResponse(
          {
            error: "hierarchy_limit",
            message: "Não é possível criar subgrupos dentro de subgrupos. O sistema suporta apenas 2 níveis: Grupos e Subgrupos.",
            details: "Parent group must be a root group (level 0)",
          },
          400,
          corsHeaders,
        );
      }
    }

    // Check for duplicate
    const existingQuery = await fetchSupabaseJson(
      `/rest/v1/mesh_groups?select=id,name,parent_group_id&agent_id=eq.${agentId}&deleted_at=is.null`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          Accept: "application/json",
        },
      },
    );

    if (existingQuery.ok && Array.isArray(existingQuery.data)) {
      const existingGroups = existingQuery.data as Array<{ name: string; parent_group_id: string | null }>;
      for (const existing of existingGroups) {
        const existingNormalized = existing.name.trim().toLowerCase().replace(/\s+/g, ' ');
        const sameLevel = body.parent_group_id
          ? existing.parent_group_id === body.parent_group_id
          : !existing.parent_group_id;

        if (existingNormalized === normalizedName && sameLevel) {
          logger.warn("Duplicate group name", { name: body.name }, authUserId);
          return jsonResponse(
            { error: "conflict", message: "Group with this name already exists at this level", existing_name: existing.name },
            409,
            corsHeaders,
          );
        }
      }
    }

    // Create group
    const insertPayload = {
      agent_id: agentId,
      owner_user_id: callerId,
      name: body.name.trim(),
      description: body.description?.trim() || null,
      parent_group_id: body.parent_group_id || null,
    };

    const createQuery = await fetchSupabaseJson(
      `/rest/v1/mesh_groups`,
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

    if (!createQuery.ok) {
      logger.error("Failed to create group", { status: createQuery.status }, authUserId);
      return jsonResponse(
        { error: "database_error", message: "Failed to create group", details: createQuery.text },
        502,
        corsHeaders,
      );
    }

    const groups = Array.isArray(createQuery.data) ? createQuery.data : [];
    if (groups.length === 0) {
      logger.error("Group created but not returned", undefined, authUserId);
      return jsonResponse(
        { error: "database_error", message: "Group created but not returned" },
        502,
        corsHeaders,
      );
    }

    const group = groups[0] as {
      id: string;
      name: string;
      description: string | null;
      path: string;
      level: number;
      parent_group_id: string | null;
      created_at: string;
    };

    logger.info("Group created successfully", { id: group.id, name: group.name }, authUserId);

    return jsonResponse(
      {
        success: true,
        group: {
          id: group.id,
          name: group.name,
          description: group.description,
          path: group.path,
          level: group.level,
          parent_group_id: group.parent_group_id,
          created_at: group.created_at,
        },
      } as Record<string, unknown>,
      201,
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
