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
      password: providedPassword,
      display_name,
      mesh_username,
      mesh_user_id,
      email_confirm = false,
      user_type = "colaborador",
    } = body;

    // Gerar password automática se não for fornecida (RustDesk usa password hardcoded)
    const generateRandomPassword = (): string => {
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%";
      let result = "";
      for (let i = 0; i < 16; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    };
    
    const password = providedPassword?.trim() || generateRandomPassword();

    if (!email || !mesh_user_id) {
      logger.warn("Missing required fields", { hasEmail: !!email, hasMeshUserId: !!mesh_user_id }, callerId);
      return jsonResponse(
        { error: "email e mesh_user_id são obrigatórios" },
        400,
        corsHeaders,
      );
    }

    logger.info("Activating user", { email: email.charAt(0) + "***@" + email.split("@")[1] }, callerId);

    // PRIMEIRO: Verificar se o mesh_user existe
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

    // Se o mesh_user já tem auth_user_id, apenas actualizar os dados
    if (meshExisting.auth_user_id) {
      logger.info("User already activated, updating data", { auth_user_id: meshExisting.auth_user_id }, callerId);
      
      const updatePayload: Record<string, unknown> = {
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
        return jsonResponse(
          { error: `Erro ao atualizar mesh_users: ${updateError.message}` },
          500,
          corsHeaders,
        );
      }

      return jsonResponse(
        {
          success: true,
          auth_user_id: meshExisting.auth_user_id,
          mesh_user_id,
          message: "Utilizador actualizado com sucesso (já estava activado)",
        },
        200,
        corsHeaders,
      );
    }

    // SEGUNDO: Verificar se já existe um auth user com este email
    const { data: existingAuthUsers, error: listError } = await adminClient.auth.admin.listUsers();
    
    let authUserId: string | null = null;
    
    if (!listError && existingAuthUsers?.users) {
      const existingUser = existingAuthUsers.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
      if (existingUser) {
        authUserId = existingUser.id;
        logger.info("Found existing auth user", { authUserId }, callerId);
      }
    }

    // Se não existe auth user, criar um novo
    if (!authUserId) {
      logger.info("Creating new auth user", { email: email.charAt(0) + "***@" + email.split("@")[1] }, callerId);

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

      authUserId = createdUser.user.id;
      logger.info("Auth user created", { authUserId }, callerId);
    }

    // TERCEIRO: Actualizar mesh_users com o auth_user_id
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

      return jsonResponse(
        { error: `Erro ao atualizar mesh_users: ${updateError.message}` },
        500,
        corsHeaders,
      );
    }

    logger.info("User activated and linked successfully", { authUserId, mesh_user_id }, callerId);

    return jsonResponse(
      {
        success: true,
        message: "Utilizador activado e associado com sucesso",
        auth_user_id: authUserId,
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
