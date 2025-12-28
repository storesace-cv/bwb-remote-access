export const config = { verify_jwt: false };

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RawCandidate {
  session_id?: string;
  user_id?: string;
  clicked_at?: string;
  ip_address?: string | null;
}

interface EnrichedCandidate {
  session_id: string;
  user_id: string;
  clicked_at: string | null;
  ip_address: string | null;
  email: string | null;
  mesh_username: string | null;
}

async function sendResendEmail(
  apiKey: string,
  from: string,
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Resend email failed: ${response.status} - ${text}`);
  }
}

async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "method_not_allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("[notify-ambiguous-device] Missing Supabase env vars");
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

    const body = await req.json() as {
      device_id?: string;
      rustdesk_ip?: string | null;
      reason?: string;
      candidates?: RawCandidate[];
    };

    const deviceId = body.device_id?.toString().trim();
    const reason = body.reason?.toString().trim();
    const candidates = Array.isArray(body.candidates) ? body.candidates : [];

    if (!deviceId || !reason) {
      return new Response(
        JSON.stringify({
          error: "invalid_payload",
          message: "device_id and reason are required",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const ADMIN_AUTH_USER_ID =
      Deno.env.get("ADMIN_AUTH_USER_ID") ??
      "9ebfa3dd-392c-489d-882f-8a1762cb36e8";

    const { data: adminMesh, error: adminMeshError } = await supabase
      .from("mesh_users")
      .select("id")
      .eq("auth_user_id", ADMIN_AUTH_USER_ID)
      .maybeSingle();

    if (adminMeshError || !adminMesh?.id) {
      console.error(
        "[notify-ambiguous-device] Failed to resolve admin mesh_user:",
        adminMeshError,
      );
      return new Response(
        JSON.stringify({
          error: "config_error",
          message: "Admin mesh user not configured correctly",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const enrichedCandidates: EnrichedCandidate[] = [];

    for (const raw of candidates) {
      if (!raw || !raw.user_id || !raw.session_id) {
        continue;
      }

      const userId = String(raw.user_id);
      const sessionId = String(raw.session_id);
      const clickedAt = raw.clicked_at ? String(raw.clicked_at) : null;
      const ipAddress = raw.ip_address ? String(raw.ip_address) : null;

      let email: string | null = null;
      try {
        const { data: userResult, error: userError } = await supabase.auth.admin.getUserById(
          userId,
        );
        if (userError) {
          console.warn(
            "[notify-ambiguous-device] Failed to fetch auth user",
            userId,
            userError.message,
          );
        } else if (userResult?.user?.email) {
          email = userResult.user.email;
        }
      } catch (authErr) {
        console.warn(
          "[notify-ambiguous-device] Unexpected error fetching auth user",
          userId,
          authErr,
        );
      }

      let meshUsername: string | null = null;
      try {
        const { data: meshUser, error: meshError } = await supabase
          .from("mesh_users")
          .select("mesh_username")
          .eq("auth_user_id", userId)
          .maybeSingle();

        if (meshError) {
          console.warn(
            "[notify-ambiguous-device] Failed to fetch mesh_user for",
            userId,
            meshError.message,
          );
        } else if (meshUser?.mesh_username) {
          meshUsername = meshUser.mesh_username;
        }
      } catch (meshErr) {
        console.warn(
          "[notify-ambiguous-device] Unexpected error fetching mesh_user",
          userId,
          meshErr,
        );
      }

      enrichedCandidates.push({
        session_id: sessionId,
        user_id: userId,
        clicked_at: clickedAt,
        ip_address: ipAddress,
        email,
        mesh_username: meshUsername,
      });
    }

    const { data: inserted, error: insertError } = await supabase
      .from("device_ambiguity_events")
      .insert({
        device_id: deviceId,
        rustdesk_ip: body.rustdesk_ip ?? null,
        reason,
        admin_mesh_user_id: adminMesh.id,
        candidate_sessions: enrichedCandidates,
      })
      .select()
      .single();

    if (insertError) {
      console.error(
        "[notify-ambiguous-device] Failed to insert device_ambiguity_events:",
        insertError,
      );
      return new Response(
        JSON.stringify({
          error: "database_error",
          message: insertError.message,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
    const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "";
    const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") ?? "";

    let emailStatus: "skipped" | "sent" | "failed" = "skipped";

    if (RESEND_API_KEY && EMAIL_FROM && ADMIN_EMAIL) {
      try {
        const createdAt = inserted.created_at as string | undefined;
        const rustdeskIp = (inserted.rustdesk_ip as string | null) ?? null;

        let candidatesHtml = "";
        if (enrichedCandidates.length > 0) {
          const rows = enrichedCandidates.map((c) => {
            const label =
              c.mesh_username ??
              c.email ??
              c.user_id;
            return `<li><strong>${label}</strong> — session_id=${c.session_id}, clicked_at=${c.clicked_at ?? "n/a"}, ip=${c.ip_address ?? "n/a"}</li>`;
          }).join("");
          candidatesHtml = `<ul>${rows}</ul>`;
        } else {
          candidatesHtml = "<p>Nenhuma sessão candidata foi encontrada na janela de matching.</p>";
        }

        const adminSubject =
          `[RustDesk Mesh] Dispositivo ambíguo atribuído ao admin (${deviceId})`;

        const adminHtml = `
          <p>Olá,</p>
          <p>O motor de matching temporal não conseguiu atribuir de forma inequívoca o seguinte dispositivo e, por isso, este foi atribuído ao administrador canónico.</p>
          <p><strong>Device ID:</strong> ${deviceId}</p>
          <p><strong>Motivo:</strong> ${reason}</p>
          <p><strong>RustDesk IP:</strong> ${rustdeskIp ?? "n/a"}</p>
          <p><strong>Data do evento:</strong> ${createdAt ?? "n/a"}</p>
          <p><strong>Utilizadores com sessões activas no botão "+ Adicionar Dispositivo" na janela de matching:</strong></p>
          ${candidatesHtml}
          <p>Os utilizadores listados serão notificados por email a indicar que o dispositivo foi encaminhado para o administrador para triagem manual.</p>
          <p>— Sistema RustDesk Mesh Integration</p>
        `;

        await sendResendEmail(
          RESEND_API_KEY,
          EMAIL_FROM,
          ADMIN_EMAIL,
          adminSubject,
          adminHtml,
        );

        for (const c of enrichedCandidates) {
          if (!c.email) continue;

          const userSubject =
            `[RustDesk Mesh] Novo dispositivo encaminhado para o administrador (${deviceId})`;

          const userHtml = `
            <p>Olá,</p>
            <p>Registámos uma tentativa de registo de dispositivo Android no sistema RustDesk Mesh Integration em que o motor de matching temporal não conseguiu atribuir o dispositivo com segurança a um único utilizador.</p>
            <p>Por esse motivo, o dispositivo foi atribuído automaticamente ao administrador canónico para triagem manual.</p>
            <p><strong>Device ID:</strong> ${deviceId}</p>
            <p><strong>Motivo técnico:</strong> ${reason}</p>
            <p><strong>O que isto significa para si?</strong></p>
            <ul>
              <li>O administrador recebeu um email com os detalhes deste evento, incluindo os utilizadores com sessões activas no botão "+ Adicionar Dispositivo".</li>
              <li>Se considerar que este dispositivo é seu, deverá contactar o administrador e indicar o Device ID acima.</li>
            </ul>
            <p>— Sistema RustDesk Mesh Integration</p>
          `;

          await sendResendEmail(
            RESEND_API_KEY,
            EMAIL_FROM,
            c.email,
            userSubject,
            userHtml,
          );
        }

        await supabase
          .from("device_ambiguity_events")
          .update({
            status: "sent",
            processed_at: new Date().toISOString(),
          })
          .eq("id", inserted.id as string);

        emailStatus = "sent";
      } catch (emailError) {
        console.error(
          "[notify-ambiguous-device] Failed to send emails:",
          emailError,
        );
        await supabase
          .from("device_ambiguity_events")
          .update({
            status: "failed",
            processed_at: new Date().toISOString(),
          })
          .eq("id", inserted.id as string);

        emailStatus = "failed";
      }
    } else {
      console.log(
        "[notify-ambiguous-device] Email configuration missing (RESEND_API_KEY/EMAIL_FROM/ADMIN_EMAIL); skipping email sending",
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        event_id: inserted.id,
        email_status: emailStatus,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("[notify-ambiguous-device] Unhandled error:", err);
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