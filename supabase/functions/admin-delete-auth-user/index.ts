// Version: 2025-12-22T05:00:00Z - Delete Supabase Auth user and unlink from mesh_users
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface AdminDeleteUserBody {
  id?: string; // auth.users.id
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
      console.error("[admin-delete-auth-user] JWT validation failed:", authCheckResponse.status);
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

    console.log("[admin-delete-auth-user] Caller validated:", authUser.id);

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const body = (await req.json()) as AdminDeleteUserBody;
    const { id } = body;

    if (!id) {
      return new Response(
        JSON.stringify({ error: "id é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 1: Unlink from mesh_users (set auth_user_id = NULL)
    const { error: unlinkError } = await adminClient
      .from("mesh_users")
      .update({ auth_user_id: null, user_type: "inactivo" })
      .eq("auth_user_id", id);

    if (unlinkError) {
      console.error("Error unlinking mesh_users:", unlinkError);
      // Continue anyway - user may not be linked
    }

    // Step 2: Delete from auth.users
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(id);

    if (deleteError) {
      console.error("Error deleting user:", deleteError);
      return new Response(
        JSON.stringify({
          error: deleteError.message || "Erro ao apagar utilizador",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        message: "Utilizador apagado com sucesso",
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