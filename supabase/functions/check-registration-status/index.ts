// Edge Function para verificar status de sessão de registro
export const config = { verify_jwt: false };

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

// Função para fazer matching temporal (SEM acesso ao SQLite)
async function performTemporalMatching(
  supabase: any,
  sessionId: string,
  userId: string,
  sessionClickedAt: string
): Promise<{ device_id: string; friendly_name?: string } | null> {
  try {
    console.log(`[check-registration-status] Starting temporal matching for session ${sessionId}`);
    console.log(`[check-registration-status] Session clicked_at: ${sessionClickedAt}`);
    
    // Janela temporal: de clicked_at até clicked_at + 8 minutos
    const clickedDate = new Date(sessionClickedAt);
    const windowStart = clickedDate;
    const windowEnd = new Date(clickedDate.getTime() + 8 * 60 * 1000);
    const windowStartISO = windowStart.toISOString();
    const windowEndISO = windowEnd.toISOString();
    
    console.log(
      `[check-registration-status] Looking for devices with last_seen_at between ${windowStartISO} and ${windowEndISO}`,
    );
    
    // Buscar dispositivos órfãos vistos na janela [clicked_at, clicked_at + 8min]
    // Usa last_seen_at em vez de created_at para detectar conexões recentes
    const { data: orphanDevices, error: orphanError } = await supabase
      .from("android_devices")
      .select("device_id, friendly_name, last_seen_at, created_at")
      .is("owner", null)
      .is("deleted_at", null)
      .gte("last_seen_at", windowStartISO)
      .lte("last_seen_at", windowEndISO)
      .order("last_seen_at", { ascending: false });
    
    if (orphanError) {
      console.error("[check-registration-status] Error fetching orphans:", orphanError);
      return null;
    }
    
    if (!orphanDevices || orphanDevices.length === 0) {
      console.log("[check-registration-status] No orphan devices found in time window");
      console.log(
        `[check-registration-status] Window: ${windowStartISO} to ${windowEndISO}`,
      );
      return null;
    }
    
    console.log(`[check-registration-status] Found ${orphanDevices.length} orphan devices:`);
    orphanDevices.forEach(d => {
      console.log(`  - ${d.device_id}: last_seen=${d.last_seen_at}, created=${d.created_at}`);
    });
    
    // Pegar o dispositivo mais recente (primeiro da lista já ordenada por last_seen_at DESC)
    const matchedDevice = orphanDevices[0];
    
    console.log(`[check-registration-status] Matched device: ${matchedDevice.device_id}`);
    
    // Buscar mesh_user
    const { data: meshUser } = await supabase
      .from("mesh_users")
      .select("id, mesh_username")
      .eq("auth_user_id", userId)
      .maybeSingle();
    
    if (!meshUser) {
      console.error("[check-registration-status] Mesh user not found for:", userId);
      return null;
    }
    
    console.log(`[check-registration-status] Assigning device to mesh_user: ${meshUser.id}`);
    
    // Atualizar device com owner
    const { error: updateError } = await supabase
      .from("android_devices")
      .update({
        owner: meshUser.id,
        mesh_username: meshUser.mesh_username,
      })
      .eq("device_id", matchedDevice.device_id);
    
    if (updateError) {
      console.error("[check-registration-status] Error updating device:", updateError);
      return null;
    }
    
    console.log(`[check-registration-status] Device ${matchedDevice.device_id} assigned to user ${userId}`);
    
    // Marcar sessão como completed
    const now = new Date().toISOString();
    await supabase
      .from("device_registration_sessions")
      .update({
        status: "completed",
        matched_device_id: matchedDevice.device_id,
        matched_at: now,
        updated_at: now,
      })
      .eq("id", sessionId);
    
    return {
      device_id: matchedDevice.device_id,
      friendly_name: matchedDevice.friendly_name,
    };
  } catch (err) {
    console.error("[check-registration-status] Error in temporal matching:", err);
    return null;
  }
}

async function handler(req: Request): Promise<Response> {
  console.log(`[check-registration-status] Request received: ${req.method}`);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "GET") {
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
      console.error("[check-registration-status] Missing environment variables");
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
      console.error("[check-registration-status] Missing Authorization header");
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
      console.error("[check-registration-status] JWT validation failed:", authResponse.status);
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

    // Pegar session_id da URL
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("session_id");

    if (!sessionId) {
      return new Response(
        JSON.stringify({ error: "invalid_request", message: "session_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Criar cliente Supabase
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Buscar sessão
    const { data: session, error: fetchError } = await supabase
      .from("device_registration_sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .single();

    if (fetchError || !session) {
      console.error("[check-registration-status] Session not found:", fetchError);
      return new Response(
        JSON.stringify({
          error: "not_found",
          message: "Session not found",
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Verificar se expirou
    const now = new Date();
    const expiresAt = new Date(session.expires_at);
    const isExpired = now > expiresAt;

    // Se expirou e status ainda é awaiting, atualizar
    if (isExpired && session.status === "awaiting_device") {
      await supabase
        .from("device_registration_sessions")
        .update({ 
          status: "expired",
          updated_at: new Date().toISOString()
        })
        .eq("id", sessionId);

      session.status = "expired";
    }

    // Se ainda está awaiting, tentar matching temporal
    let deviceInfo = null;
    if (session.status === "awaiting_device" && !isExpired) {
      console.log("[check-registration-status] Attempting temporal matching...");
      
      const matchResult = await performTemporalMatching(
        supabase,
        sessionId,
        userId,
        session.clicked_at
      );
      
      if (matchResult) {
        deviceInfo = matchResult;
        session.status = "completed";
        session.matched_device_id = matchResult.device_id;
        session.matched_at = new Date().toISOString();
      }
    }
    // Se completou, buscar informações do device
    else if (session.status === "completed" && session.matched_device_id) {
      const { data: device } = await supabase
        .from("android_devices")
        .select("device_id, friendly_name, notes")
        .eq("device_id", session.matched_device_id)
        .single();

      if (device) {
        deviceInfo = device;
      }
    }

    // Calcular tempo restante
    const timeRemaining = isExpired ? 0 : Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));

    return new Response(
      JSON.stringify({
        success: true,
        status: session.status,
        expires_at: session.expires_at,
        time_remaining_seconds: timeRemaining,
        device_info: deviceInfo,
        matched_at: session.matched_at,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("[check-registration-status] Unhandled error:", err);
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