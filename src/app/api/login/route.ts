/**
 * Login Route - MeshCentral Authentication + Supabase JWT
 * 
 * Fluxo simplificado:
 * 1. Valida credenciais no MeshCentral
 * 2. Se válido, faz signInWithPassword no Supabase (mesma password)
 * 3. Se utilizador não existe no Supabase, cria-o com signUp
 * 4. Retorna JWT directo do Supabase
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateMeshCredentials, ensureSupabaseUser } from "@/lib/mesh-auth";
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

// Supabase client for auth operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://kqwaibgvmzcqeoctukoy.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtxd2FpYmd2bXpjcWVvY3R1a295Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1MjQxOTMsImV4cCI6MjA4MDEwMDE5M30.8C3b_iSn4EXKSkmef40XzF7Y4Uqy7i-OLfXNsRiGC3s";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

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

  const email = body.email?.toString().trim().toLowerCase();
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

    // =========================================
    // STEP 1: Validate against MeshCentral
    // =========================================
    logInfo("login", "Step 1: Authenticating against MeshCentral", {
      requestId,
      emailMasked: maskEmail(email),
      domain: fullDomain,
    });

    const authResult = await validateMeshCredentials(email, password, fullDomain);

    if (!authResult.ok) {
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

    // =========================================
    // STEP 2: Try signInWithPassword in Supabase
    // =========================================
    logInfo("login", "Step 2: Attempting Supabase signInWithPassword", {
      requestId,
      emailMasked: maskEmail(email),
    });

    let signInResult = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    // =========================================
    // STEP 3: If user doesn't exist, create with signUp
    // =========================================
    if (signInResult.error) {
      const errorCode = (signInResult.error as { code?: string }).code;
      const isInvalidCreds = errorCode === "invalid_credentials" || signInResult.error.status === 400;

      if (isInvalidCreds) {
        logInfo("login", "Step 3: User not in Supabase Auth, creating with signUp", {
          requestId,
          emailMasked: maskEmail(email),
        });

        // Create user in Supabase Auth with same password
        const signUpResult = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: email.split("@")[0],
            },
          },
        });

        if (signUpResult.error) {
          logWarn("login", "Supabase signUp failed", {
            requestId,
            emailMasked: maskEmail(email),
            error: signUpResult.error.message,
          });

          // If user already exists, try sign in again
          if (signUpResult.error.message?.includes("already registered")) {
            logInfo("login", "User already exists, retrying signIn", {
              requestId,
              emailMasked: maskEmail(email),
            });
            
            // Maybe password changed - update it via admin API would be needed
            // For now, return error
            return NextResponse.json(
              { message: "Password no Supabase difere do MeshCentral. Contacte o administrador." },
              { status: 401, headers: CORS_HEADERS }
            );
          }

          return NextResponse.json(
            { message: "Erro ao criar utilizador no sistema." },
            { status: 500, headers: CORS_HEADERS }
          );
        }

        // If signUp was successful and returned a session, use it
        if (signUpResult.data?.session?.access_token) {
          logInfo("login", "SignUp successful with immediate session", {
            requestId,
            emailMasked: maskEmail(email),
            tokenLength: signUpResult.data.session.access_token.length,
          });

          // Ensure user is mirrored to mesh_users table
          await ensureSupabaseUser(email, fullDomain);

          return NextResponse.json(
            { token: signUpResult.data.session.access_token },
            { status: 200, headers: CORS_HEADERS }
          );
        }

        // SignUp succeeded but no immediate session - try signIn again
        logInfo("login", "SignUp successful, attempting signIn again", {
          requestId,
          emailMasked: maskEmail(email),
        });

        signInResult = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInResult.error) {
          logWarn("login", "SignIn after SignUp failed", {
            requestId,
            emailMasked: maskEmail(email),
            error: signInResult.error.message,
          });

          return NextResponse.json(
            { message: "Erro ao autenticar após criação de conta." },
            { status: 500, headers: CORS_HEADERS }
          );
        }
      } else {
        // Other error (not invalid credentials)
        logWarn("login", "Supabase signIn failed with unexpected error", {
          requestId,
          emailMasked: maskEmail(email),
          error: signInResult.error.message,
          errorCode,
        });

        return NextResponse.json(
          { message: signInResult.error.message || "Erro de autenticação." },
          { status: 500, headers: CORS_HEADERS }
        );
      }
    }

    // =========================================
    // STEP 4: Return JWT
    // =========================================
    const token = signInResult.data?.session?.access_token;

    if (!token) {
      logWarn("login", "SignIn succeeded but no access_token", {
        requestId,
        emailMasked: maskEmail(email),
        hasSession: Boolean(signInResult.data?.session),
      });

      return NextResponse.json(
        { message: "Resposta sem token válido." },
        { status: 502, headers: CORS_HEADERS }
      );
    }

    // Ensure user is mirrored to mesh_users table
    await ensureSupabaseUser(email, fullDomain);

    logDebug("login", "Login completed successfully", {
      requestId,
      clientIp,
      emailMasked: maskEmail(email),
      tokenLength: token.length,
    });

    return NextResponse.json(
      { token },
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
