// Edge Function para gerar/obter token de registro do usuário
export const config = { verify_jwt: false };

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

async function handler(req: Request): Promise<Response> {
  console.log(`[get-registration-token] Request received: ${req.method}`);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({ error: "config_error", message: "Missing Supabase configuration" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validar JWT manualmente
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "unauthorized", message: "Missing token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const jwt = authHeader.substring(7);

    // Validar com Supabase Auth
    const authResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
      },
    });

    if (!authResponse.ok) {
      return new Response(
        JSON.stringify({ error: "unauthorized", message: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const user = await authResponse.json();
    const userId = user.id;

    console.log(`[get-registration-token] User authenticated: ${userId}`);

    // Criar cliente Supabase com service role
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Buscar token ativo existente ou criar novo
    const { data: existingTokens, error: fetchError } = await supabase
      .from("device_registration_tokens")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1);

    if (fetchError) {
      console.error("[get-registration-token] Error fetching token:", fetchError);
      return new Response(
        JSON.stringify({ error: "database_error", message: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let token;

    if (existingTokens && existingTokens.length > 0) {
      // Retornar token existente
      token = existingTokens[0];
      console.log(`[get-registration-token] Returning existing token for user ${userId}`);
    } else {
      // Criar novo token
      const { data: newToken, error: insertError } = await supabase
        .from("device_registration_tokens")
        .insert({
          user_id: userId,
          is_active: true,
        })
        .select()
        .single();

      if (insertError) {
        console.error("[get-registration-token] Error creating token:", insertError);
        return new Response(
          JSON.stringify({ error: "database_error", message: insertError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      token = newToken;
      console.log(`[get-registration-token] Created new token for user ${userId}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        token: token.token,
        expires_at: token.expires_at,
        created_at: token.created_at,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("[get-registration-token] Unhandled error:", err);
    const message = err instanceof Error ? err.message : String(err);

    return new Response(
      JSON.stringify({ error: "internal_error", message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
}

serve(handler);