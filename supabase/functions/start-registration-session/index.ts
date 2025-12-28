// Edge Function para iniciar sessão de registro de dispositivo
export const config = { verify_jwt: false };

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function handler(req: Request): Promise<Response> {
  console.log(`[start-registration-session] Request received: ${req.method}`);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "method_not_allowed" }),
        {
          status: 405,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("[start-registration-session] Missing environment variables");
      return new Response(
        JSON.stringify({
          error: "config_error",
          message: "Missing Supabase configuration",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validar JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.error("[start-registration-session] Missing Authorization header");
      return new Response(
        JSON.stringify({ error: "unauthorized", message: "Missing token" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const jwt = authHeader.substring(7);

    // Validar JWT com Supabase Auth
    const authResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
      },
    });

    if (!authResponse.ok) {
      console.error("[start-registration-session] JWT validation failed:", authResponse.status);
      return new Response(
        JSON.stringify({
          error: "unauthorized",
          message: "Invalid or expired token",
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const user = await authResponse.json();
    const userId = user.id;
    console.log(`[start-registration-session] User authenticated: ${userId}`);

    const ADMIN_AUTH_USER_ID =
      Deno.env.get("ADMIN_AUTH_USER_ID") ??
      "9ebfa3dd-392c-489d-882f-8a1762cb36e8";

    if (userId === ADMIN_AUTH_USER_ID) {
      console.error(
        "[start-registration-session] Canonical admin is not allowed to start registration sessions",
      );
      return new Response(
        JSON.stringify({
          error: "forbidden",
          message:
            "A conta de administração não pode iniciar sessões de registo de dispositivos. Usa uma conta de técnico/loja.",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Capturar informações do request
    const ip_address = req.headers.get("x-forwarded-for") || 
                      req.headers.get("x-real-ip") || 
                      "unknown";
    const user_agent = req.headers.get("user-agent") || "unknown";

    // Tentar obter geolocation do body (se cliente enviou)
    let geolocation = null;
    try {
      const body = await req.json();
      if (body.geolocation) {
        geolocation = body.geolocation;
      }
    } catch {
      // Body vazio ou inválido, sem problema
    }

    // Criar cliente Supabase
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Expirar sessões antigas do usuário antes de criar nova
    const { error: expireError } = await supabase
      .from("device_registration_sessions")
      .update({ 
        status: "expired",
        updated_at: new Date().toISOString()
      })
      .eq("user_id", userId)
      .eq("status", "awaiting_device")
      .lt("expires_at", new Date().toISOString());

    if (expireError) {
      console.warn("[start-registration-session] Error expiring old sessions:", expireError);
    }

    // Criar nova sessão
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutos
    
    const { data: session, error: insertError } = await supabase
      .from("device_registration_sessions")
      .insert({
        user_id: userId,
        clicked_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
        ip_address,
        user_agent,
        geolocation,
        status: "awaiting_device",
      })
      .select()
      .single();

    if (insertError) {
      console.error("[start-registration-session] Error creating session:", insertError);
      return new Response(
        JSON.stringify({
          error: "database_error",
          message: insertError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`[start-registration-session] Session created: ${session.id}`);

    return new Response(
      JSON.stringify({
        success: true,
        session_id: session.id,
        expires_at: session.expires_at,
        expires_in_seconds: 300,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("[start-registration-session] Unhandled error:", err);
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