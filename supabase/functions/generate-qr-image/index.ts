// Baseado no padrão da função /login que funciona
export const config = { verify_jwt: false };

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import QRCode from "https://esm.sh/qrcode@1.5.3";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

async function handler(req: Request): Promise<Response> {
  console.log(`[generate-qr-image] Request received: ${req.method}`);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "GET") {
      return new Response(JSON.stringify({ error: "method_not_allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("[generate-qr-image] Missing environment variables");
      return new Response(
        JSON.stringify({
          error: "config_error",
          message: "Missing Supabase configuration",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Validação manual do JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.error("[generate-qr-image] Missing or invalid Authorization header");
      return new Response(
        JSON.stringify({ error: "unauthorized", message: "Missing token" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const jwt = authHeader.substring(7);

    // Validar JWT com Supabase Auth
    console.log("[generate-qr-image] Validating JWT...");
    const authResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
      },
    });

    if (!authResponse.ok) {
      console.error(
        "[generate-qr-image] JWT validation failed:",
        authResponse.status,
      );
      return new Response(
        JSON.stringify({
          error: "unauthorized",
          message: "Invalid or expired token",
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const user = await authResponse.json();
    const userId = user.id;
    console.log(`[generate-qr-image] User authenticated: ${userId}`);

    // Criar cliente Supabase
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Buscar configuração RustDesk do banco
    const { data: settings, error: settingsError } = await supabase
      .from("rustdesk_settings")
      .select("host, relay, key")
      .eq("id", 1)
      .single();

    if (settingsError || !settings) {
      console.error("[generate-qr-image] Error fetching RustDesk settings:", settingsError);
      return new Response(
        JSON.stringify({
          error: "config_error",
          message: "RustDesk configuration not found",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Buscar ou criar token de registro
    const { data: tokenData, error: tokenError } = await supabase
      .from("device_registration_tokens")
      .select("token, expires_at")
      .eq("user_id", userId)
      .eq("is_active", true)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    let registrationToken;

    if (tokenError || !tokenData) {
      // Criar novo token
      const { data: newToken, error: insertError } = await supabase
        .from("device_registration_tokens")
        .insert({ user_id: userId })
        .select("token")
        .single();

      if (insertError || !newToken) {
        console.error("[generate-qr-image] Error creating registration token:", insertError);
        return new Response(
          JSON.stringify({
            error: "token_error",
            message: "Failed to create registration token",
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      registrationToken = newToken.token;
      console.log(`[generate-qr-image] Created new registration token for user ${userId}`);
    } else {
      registrationToken = tokenData.token;
      console.log(`[generate-qr-image] Using existing registration token for user ${userId}`);
    }

    const config = {
      host: settings.host,
      relay: settings.relay,
      key: settings.key,
      registration_token: registrationToken,
    };

    const configString = `config=${JSON.stringify(config)}`;
    console.log("[generate-qr-image] Generating QR with registration token");

    // Gerar QR code como SVG
    const svgString = await QRCode.toString(configString, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 2,
      width: 512,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    });

    const encoder = new TextEncoder();
    const svgBytes = encoder.encode(svgString);
    console.log(
      "[generate-qr-image] QR SVG generated successfully, size:",
      svgBytes.length,
    );

    return new Response(svgBytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "image/svg+xml",
        "Content-Length": svgBytes.length.toString(),
      },
    });
  } catch (err) {
    console.error("[generate-qr-image] Unhandled error:", err);
    const message = err instanceof Error ? err.message : String(err);

    return new Response(
      JSON.stringify({ error: "internal_error", message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
}

serve(handler);