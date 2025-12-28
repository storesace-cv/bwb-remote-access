// Sprint 1: Security Hardening - Centralized auth + structured logging
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.1";
import {
  validateJwt,
  createLogger,
  generateCorrelationId,
  jsonResponse,
  authErrorResponse,
  defaultCorsHeaders,
} from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  ...defaultCorsHeaders,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface AdminCreateUserBody {
  email?: string;
  password?: string;
  display_name?: string;
  mesh_username?: string;
  mesh_user_id?: string;
  email_confirm?: boolean;
  user_type?: string;
}

serve(async (req: Request) => {
  const correlationId = generateCorrelationId();
  const logger = createLogger("admin-create-auth-user", correlationId);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Validate JWT using centralized auth
    const authHeader = req.headers.get("Authorization");
    const authResult = await validateJwt(authHeader, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, logger);

    if (!authResult.ok) {
      return authErrorResponse(authResult, corsHeaders);
    }

    const callerId = authResult.context.authUserId;
    if (!callerId) {
      logger.warn("No user ID in token");
      return jsonResponse(
        { error: "unauthorized", message: "Invalid user" },
        401,
        corsHeaders,
      );
    }

    logger.info("Caller validated", undefined, callerId);

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const body = (await req.json()) as AdminCreateUserBody;
    const {
      email,
      password,
      display_name,
      mesh_username,
      mesh_user_id,
      email_confirm = false,
      user_type = "colaborador",
    } = body;

    if (!email || !password || !mesh_user_id) {
      logger.warn("Missing required fields", { hasEmail: !!email, hasPassword: !!password, hasMeshUserId: !!mesh_user_id }, callerId);
      return jsonResponse(
        { error: "email, password e mesh_user_id são obrigatórios" },
        400,
        corsHeaders,
      );
    }

    logger.info("Creating auth user", { email: email.charAt(0) + "***@" + email.split("@")[1] }, callerId);

    const { data: createdUser, error: createError } =
      await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm,
        user_metadata: {
          display_name: display_name || null,
        },
      });

    if (createError || !createdUser.user) {
      logger.error("Error creating user", { error: createError?.message }, callerId);
      return jsonResponse(
        { error: createError?.message || "Erro ao criar utilizador" },
        500,
        corsHeaders,
      );
    }

    const authUserId = createdUser.user.id;
    logger.info("Auth user created", { authUserId }, callerId);

    const { data: meshExisting, error: meshExistingError } = await adminClient
      .from("mesh_users")
      .select("*")
      .eq("id", mesh_user_id)
      .maybeSingle();

    if (meshExistingError) {
      logger.error("Error checking mesh_users", { error: meshExistingError.message }, callerId);
      return jsonResponse(
        { error: meshExistingError.message },
        500,
        corsHeaders,
      );
    }

    if (!meshExisting) {
      logger.warn("Mesh user not found", { mesh_user_id }, callerId);
      return jsonResponse(
        { error: `mesh_user_id ${mesh_user_id} não encontrado em mesh_users` },
        404,
        corsHeaders,
      );
    }

    if (meshExisting.auth_user_id && meshExisting.auth_user_id !== authUserId) {
      logger.warn("Mesh user already linked", { mesh_user_id, existing_auth_user_id: meshExisting.auth_user_id }, callerId);
      return jsonResponse(
        { error: `mesh_user_id ${mesh_user_id} já está associado a outro utilizador` },
        409,
        corsHeaders,
      );
    }

    const updatePayload: Record<string, unknown> = {
      auth_user_id: authUserId,
      email,
      user_type,
    };

    if (display_name) {
      updatePayload.display_name = display_name;
    }

    const { error: updateError } = await adminClient
      .from("mesh_users")
      .update(updatePayload)
      .eq("id", mesh_user_id);

    if (updateError) {
      logger.error("Error updating mesh_users", { error: updateError.message }, callerId);

      // Rollback: delete the auth user
      await adminClient.auth.admin.deleteUser(authUserId);

      return jsonResponse(
        { error: `Erro ao atualizar mesh_users: ${updateError.message}` },
        500,
        corsHeaders,
      );
    }

    logger.info("User created and linked successfully", { authUserId, mesh_user_id }, callerId);

    return jsonResponse(
      {
        message: "Utilizador criado e associado com sucesso",
        user_id: authUserId,
        mesh_user_id,
      },
      200,
      corsHeaders,
    );
  } catch (error) {
    logger.error("Unexpected error", { error: error instanceof Error ? error.message : String(error) });
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Erro inesperado" },
      500,
      corsHeaders,
    );
  }
});
