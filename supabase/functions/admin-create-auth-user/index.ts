// Version: 2025-12-22T05:00:00Z - Create Supabase Auth user and link to mesh_users
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
      console.error("[admin-create-auth-user] JWT validation failed:", authCheckResponse.status);
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

    console.log("[admin-create-auth-user] Caller validated:", authUser.id);

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
      user_type = "colaborador" // ✅ DEFAULT: colaborador (lowercase)
    } = body;

    if (!email || !password || !mesh_user_id) {
      return new Response(
        JSON.stringify({ 
          error: "email, password e mesh_user_id são obrigatórios" 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
      console.error("Error creating user:", createError);
      return new Response(
        JSON.stringify({
          error: createError?.message || "Erro ao criar utilizador",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authUserId = createdUser.user.id;

    const { data: meshExisting, error: meshExistingError } = await adminClient
      .from("mesh_users")
      .select("*")
      .eq("id", mesh_user_id)
      .maybeSingle();

    if (meshExistingError) {
      console.error("Error checking mesh_users:", meshExistingError);
      return new Response(
        JSON.stringify({ error: meshExistingError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!meshExisting) {
      return new Response(
        JSON.stringify({ 
          error: `mesh_user_id ${mesh_user_id} não encontrado em mesh_users` 
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (meshExisting.auth_user_id && meshExisting.auth_user_id !== authUserId) {
      return new Response(
        JSON.stringify({ 
          error: `mesh_user_id ${mesh_user_id} já está associado a outro utilizador` 
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const updatePayload: Record<string, unknown> = {
      auth_user_id: authUserId,
      email,
      user_type, // ✅ Normalized: agent | colaborador | inactivo | candidato
    };

    if (display_name) {
      updatePayload.display_name = display_name;
    }

    const { error: updateError } = await adminClient
      .from("mesh_users")
      .update(updatePayload)
      .eq("id", mesh_user_id);

    if (updateError) {
      console.error("Error updating mesh_users:", updateError);
      
      await adminClient.auth.admin.deleteUser(authUserId);

      return new Response(
        JSON.stringify({
          error: `Erro ao atualizar mesh_users: ${updateError.message}`,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        message: "Utilizador criado e associado com sucesso",
        user_id: authUserId,
        mesh_user_id,
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