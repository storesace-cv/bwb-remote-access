export const config = { verify_jwt: false };

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface AdminUpdateUserBody {
  id?: string;
  email?: string;
  password?: string;
  email_confirm?: boolean;
  ban?: boolean;
  display_name?: string;
  mesh_username?: string;
  mesh_user_id?: string;
  user_type?: string;
}

serve(async (req: Request) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization header is required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // CRITICAL: Validate JWT using service role key (consistent pattern)
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : authHeader;

    const authCheckResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
      },
    });

    if (!authCheckResponse.ok) {
      console.error("[admin-update-auth-user] JWT validation failed:", authCheckResponse.status);
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authUser = (await authCheckResponse.json()) as { id?: string } | null;
    if (!authUser?.id) {
      return new Response(
        JSON.stringify({ error: "Invalid user" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const callerAuthUserId = authUser.id;
    console.log("[admin-update-auth-user] Caller validated:", callerAuthUserId);

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Get caller's mesh_user record to determine their agent_id
    const { data: callerMeshUser } = await adminClient
      .from("mesh_users")
      .select("id, user_type, agent_id")
      .eq("auth_user_id", callerAuthUserId)
      .maybeSingle();

    if (!callerMeshUser) {
      return new Response(
        JSON.stringify({ error: "Caller not found in mesh_users" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const callerId = callerMeshUser.id;
    const callerAgentId = callerMeshUser.agent_id;

    console.log(`[admin-update-auth-user] Caller: ${callerId}, agent_id: ${callerAgentId}`);

    const body = (await req.json()) as AdminUpdateUserBody;
    const {
      id,
      email,
      password,
      email_confirm,
      ban,
      display_name,
      mesh_username,
      mesh_user_id,
      user_type,
    } = body;

    if (!id) {
      return new Response(
        JSON.stringify({ error: "User ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authUpdates: Record<string, unknown> = {};
    if (email) authUpdates.email = email;
    if (password) authUpdates.password = password;
    if (typeof email_confirm === "boolean") {
      authUpdates.email_confirm = email_confirm;
    }
    if (typeof ban === "boolean") {
      authUpdates.ban_duration = ban ? "876600h" : "none";
    }

    const metadataUpdates: Record<string, unknown> = {};
    if (display_name !== undefined) {
      metadataUpdates.display_name = display_name;
    }

    if (Object.keys(authUpdates).length > 0 || Object.keys(metadataUpdates).length > 0) {
      const updatePayload: Record<string, unknown> = { ...authUpdates };
      if (Object.keys(metadataUpdates).length > 0) {
        updatePayload.user_metadata = metadataUpdates;
      }

      const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(
        id,
        updatePayload
      );

      if (authUpdateError) {
        console.error("Error updating auth.users:", authUpdateError);
        return new Response(
          JSON.stringify({
            error: `Erro ao atualizar auth.users: ${authUpdateError.message}`,
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const meshUpdates: Record<string, unknown> = {};
    if (email) meshUpdates.email = email;
    if (display_name !== undefined) meshUpdates.display_name = display_name;
    if (user_type) meshUpdates.user_type = user_type;

    if (mesh_user_id) {
      const { data: meshTarget, error: meshTargetError } = await adminClient
        .from("mesh_users")
        .select("*")
        .eq("id", mesh_user_id)
        .maybeSingle();

      if (meshTargetError) {
        console.error("Error checking mesh_users target:", meshTargetError);
        return new Response(
          JSON.stringify({ error: meshTargetError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!meshTarget) {
        return new Response(
          JSON.stringify({ 
            error: `mesh_user_id ${mesh_user_id} não encontrado` 
          }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (meshTarget.auth_user_id && meshTarget.auth_user_id !== id) {
        return new Response(
          JSON.stringify({ 
            error: `mesh_user_id ${mesh_user_id} já está associado a outro utilizador` 
          }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: meshOld } = await adminClient
        .from("mesh_users")
        .select("id")
        .eq("auth_user_id", id)
        .maybeSingle();

      if (meshOld && meshOld.id !== mesh_user_id) {
        await adminClient
          .from("mesh_users")
          .update({ auth_user_id: null })
          .eq("id", meshOld.id);
      }

      meshUpdates.auth_user_id = id;
      if (mesh_username) meshUpdates.mesh_username = mesh_username;

      // CRITICAL FIX: When promoting candidato → colaborador, set parent_agent_id and agent_id
      if (user_type === "colaborador" && (!meshTarget.parent_agent_id || !meshTarget.agent_id)) {
        console.log(`[admin-update-auth-user] Promoting candidato to colaborador: setting parent_agent_id=${callerId}, agent_id=${callerAgentId}`);
        meshUpdates.parent_agent_id = callerId;
        meshUpdates.agent_id = callerAgentId;
      }

      const { error: meshTargetUpdateError } = await adminClient
        .from("mesh_users")
        .update(meshUpdates)
        .eq("id", mesh_user_id);

      if (meshTargetUpdateError) {
        console.error("Error updating mesh_users target:", meshTargetUpdateError);
        return new Response(
          JSON.stringify({
            error: `Erro ao atualizar mesh_users: ${meshTargetUpdateError.message}`,
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      if (Object.keys(meshUpdates).length > 0) {
        const { error: meshUpdateError } = await adminClient
          .from("mesh_users")
          .update(meshUpdates)
          .eq("auth_user_id", id);

        if (meshUpdateError) {
          console.error("Error updating mesh_users:", meshUpdateError);
        }
      }
    }

    return new Response(
      JSON.stringify({
        message: "Utilizador atualizado com sucesso",
        user_id: id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Erro inesperado",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});