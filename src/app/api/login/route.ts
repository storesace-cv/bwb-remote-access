import { NextResponse } from "next/server";
import { supabase } from "@/integrations/supabase/client";

import {
  correlationId,
  initializeDebugLogger,
  logDebug,
  logError,
  logInfo,
  logWarn,
  maskEmail,
  safeError,
} from "@/lib/debugLogger";

export const runtime = "nodejs";

interface LoginRequestBody {
  email?: string;
  password?: string;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function POST(req: Request) {
  initializeDebugLogger();
  const requestId = correlationId("login");
  const clientIp =
    req.headers.get("x-forwarded-for") ||
    req.headers.get("x-real-ip") ||
    "unknown";

  let body: LoginRequestBody;
  try {
    body = await req.json();
  } catch (error) {
    logWarn("login", "Invalid JSON body received", {
      requestId,
      clientIp,
      error: safeError(error),
    });
    return NextResponse.json(
      { message: "Pedido inválido" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const email = body.email?.toString().trim();
  const password = body.password?.toString() ?? "";

  logInfo("login", "Login request received", {
    requestId,
    clientIp,
    hasEmail: Boolean(email),
    emailMasked: maskEmail(email),
    payloadFields: Object.keys(body || {}),
  });

  if (!email || !password) {
    logWarn("login", "Missing credentials", {
      requestId,
      clientIp,
      emailMasked: maskEmail(email),
    });
    return NextResponse.json(
      { message: "Email e password são obrigatórios." },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      logWarn("login", "Supabase signInWithPassword returned an error", {
        requestId,
        clientIp,
        emailMasked: maskEmail(email),
        errorMessage: error.message,
        errorStatus: error.status,
        errorCode: (error as { code?: string }).code,
      });

      const rawCode = (error as { code?: string }).code;
      const statusFromError = error.status ?? 401;
      const isInvalidCreds =
        rawCode === "invalid_credentials" || statusFromError === 400;

      const status = isInvalidCreds ? 401 : statusFromError;
      const message = isInvalidCreds
        ? "Credenciais inválidas ou utilizador não existe."
        : error.message || "Falha no login";

      return NextResponse.json(
        {
          message,
          error: rawCode ?? "auth_error",
        },
        {
          status,
          headers: CORS_HEADERS,
        }
      );
    }

    const token =
      data?.session?.access_token &&
      typeof data.session.access_token === "string" &&
      data.session.access_token.trim().length > 0
        ? data.session.access_token
        : null;

    if (!token) {
      logWarn("login", "Login succeeded but access_token is missing or invalid", {
        requestId,
        clientIp,
        hasSession: Boolean(data?.session),
      });

      return NextResponse.json(
        { message: "Resposta sem token válido." },
        { status: 502, headers: CORS_HEADERS }
      );
    }

    logDebug("login", "Login completed successfully via Supabase Auth", {
      requestId,
      clientIp,
      emailMasked: maskEmail(email),
      tokenLength: token.length,
    });

    return NextResponse.json(
      { token },
      {
        status: 200,
        headers: CORS_HEADERS,
      }
    );
  } catch (error: unknown) {
    logError("login", "Unhandled error during Supabase Auth login", {
      requestId,
      clientIp,
      error: safeError(error),
    });

    return NextResponse.json(
      { message: "Erro interno ao processar login." },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}