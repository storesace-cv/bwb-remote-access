/**
 * Admin Update Role Edge Function
 * 
 * Allows siteadmins to update role permissions.
 * POST /functions/v1/admin-update-role
 * 
 * Body: { role_id: string, permission_key: string, value: boolean }
 */

export const config = { verify_jwt: false };

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Lista de permissões válidas que podem ser alteradas
const VALID_PERMISSIONS = [
  "can_access_management_panel",
  "can_access_user_profile",
  "can_scan_qr",
  "can_provision_without_qr",
  "can_view_devices",
  "can_adopt_devices",
  "can_edit_devices",
  "can_delete_devices",
  "can_view_users",
  "can_create_users",
  "can_edit_users",
  "can_delete_users",
  "can_change_user_role",
  "can_view_groups",
  "can_create_groups",
  "can_edit_groups",
  "can_delete_groups",
  "can_assign_permissions",
  "can_access_all_domains",
  "can_access_own_domain_only",
  "can_manage_roles",
  "can_view_audit_logs",
  "can_access_meshcentral",
];

interface UpdateRoleBody {
  role_id: string;
  permission_key: string;
  value: boolean;
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
    // Validar Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization header is required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const jwt = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : authHeader;

    // Validar JWT
    const authCheckResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
      },
    });

    if (!authCheckResponse.ok) {
      console.error("[admin-update-role] JWT validation failed:", authCheckResponse.status);
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
    console.log("[admin-update-role] Caller validated:", callerAuthUserId);

    // Criar cliente admin
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Verificar se o caller tem permissão can_manage_roles
    const { data: callerMeshUser, error: callerError } = await adminClient
      .from("mesh_users")
      .select("id, user_type")
      .eq("auth_user_id", callerAuthUserId)
      .maybeSingle();

    if (callerError || !callerMeshUser) {
      console.error("[admin-update-role] Caller not found:", callerError);
      return new Response(
        JSON.stringify({ error: "User not found" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar permissões do role do caller
    const { data: callerRole, error: roleError } = await adminClient
      .from("roles")
      .select("can_manage_roles")
      .eq("name", callerMeshUser.user_type)
      .maybeSingle();

    if (roleError || !callerRole?.can_manage_roles) {
      console.error("[admin-update-role] Permission denied - can_manage_roles:", callerRole);
      return new Response(
        JSON.stringify({ error: "Não tem permissão para gerir roles" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse body
    const body = (await req.json()) as UpdateRoleBody;
    const { role_id, permission_key, value } = body;

    // Validar campos obrigatórios
    if (!role_id || !permission_key || typeof value !== "boolean") {
      return new Response(
        JSON.stringify({ error: "role_id, permission_key and value (boolean) are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validar que a permission_key é válida
    if (!VALID_PERMISSIONS.includes(permission_key)) {
      return new Response(
        JSON.stringify({ error: `Invalid permission key: ${permission_key}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verificar se o role existe
    const { data: targetRole, error: targetError } = await adminClient
      .from("roles")
      .select("id, name")
      .eq("id", role_id)
      .maybeSingle();

    if (targetError || !targetRole) {
      console.error("[admin-update-role] Role not found:", role_id);
      return new Response(
        JSON.stringify({ error: "Role não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Actualizar a permissão
    const { error: updateError } = await adminClient
      .from("roles")
      .update({ [permission_key]: value })
      .eq("id", role_id);

    if (updateError) {
      console.error("[admin-update-role] Update error:", updateError);
      return new Response(
        JSON.stringify({ error: `Erro ao actualizar: ${updateError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[admin-update-role] Updated role ${targetRole.name}: ${permission_key} = ${value}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Permissão actualizada com sucesso",
        role_id,
        permission_key,
        value,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[admin-update-role] Unexpected error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Erro inesperado",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
