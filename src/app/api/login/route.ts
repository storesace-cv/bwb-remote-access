/**
 * Login Route - MeshCentral Authentication with Supabase JWT
 * 
 * Flow:
 * 1. Authenticate against MeshCentral
 * 2. Mirror user to Supabase (mesh_users, profiles, auth.users)
 * 3. Return JWT for edge functions
 */

import { NextResponse } from "next/server";
import { validateMeshCredentials, ensureSupabaseUser, ensureProfileExists, getSupabaseJWT } from "@/lib/mesh-auth";
import {
  correlationId,
  initializeDebugLogger,
  logDebug,
  logInfo,
  logWarn,
  maskEmail,
  safeError,
} from "@/lib/debugLogger";

export const runtime = "nodejs";

interface LoginRequestBody {
  email?: string;
  password?: string;
  domain?: string;
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
  const requestedDomain = body.domain?.toString().trim() || "mesh";

  logInfo("login", "Login request received", {
    requestId,
    clientIp,
    hasEmail: Boolean(email),
    emailMasked: maskEmail(email),
    domain: requestedDomain,
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
    // Map short domain to full domain
    const domainMap: Record<string, string> = {
      mesh: "mesh.bwb.pt",
      zonetech: "zonetech.bwb.pt",
      zsangola: "zsangola.bwb.pt",
    };
    const fullDomain = domainMap[requestedDomain] || "mesh.bwb.pt";

    // 1. Authenticate against MeshCentral
    logInfo("login", "Authenticating against MeshCentral", {
      requestId,
      emailMasked: maskEmail(email),
      domain: fullDomain,
    });

    const authResult = await validateMeshCentralCredentials(email, password, fullDomain);

    if (!authResult.success) {
      logWarn("login", "MeshCentral authentication failed", {
        requestId,
        clientIp,
        emailMasked: maskEmail(email),
        error: authResult.error,
      });

      return NextResponse.json(
        {
          message: authResult.error || "Credenciais inválidas ou utilizador não existe.",
          error: "invalid_credentials",
        },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    logInfo("login", "MeshCentral authentication successful", {
      requestId,
      emailMasked: maskEmail(email),
    });

    // 2. Mirror user to Supabase tables
    const meshUser = await ensureSupabaseUser(email, fullDomain);
    
    if (!meshUser?.auth_user_id) {
      logWarn("login", "Could not mirror user to Supabase", {
        requestId,
        emailMasked: maskEmail(email),
      });
      
      return NextResponse.json(
        { message: "Erro interno ao configurar utilizador." },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    // Ensure profile exists
    await ensureProfileExists(meshUser.auth_user_id, email);

    // 3. Get JWT from Supabase Auth
    const jwtResult = await getSupabaseJWT(email, meshUser.auth_user_id);

    if (!jwtResult?.token) {
      logWarn("login", "Could not get JWT from Supabase", {
        requestId,
        emailMasked: maskEmail(email),
        error: jwtResult?.error,
      });

      return NextResponse.json(
        { message: "Erro ao obter token de autenticação." },
        { status: 502, headers: CORS_HEADERS }
      );
    }

    logDebug("login", "Login completed successfully", {
      requestId,
      clientIp,
      emailMasked: maskEmail(email),
      tokenLength: jwtResult.token.length,
    });

    return NextResponse.json(
      { token: jwtResult.token },
      { status: 200, headers: CORS_HEADERS }
    );

  } catch (error) {
    logWarn("login", "Unexpected error during login", {
      requestId,
      clientIp,
      error: safeError(error),
    });

    return NextResponse.json(
      { message: "Erro interno do servidor." },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
