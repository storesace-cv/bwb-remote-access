/**
 * Login Route - MeshCentral Authentication + Supabase JWT
 * 
 * Fluxo:
 * 1. Valida credenciais no MeshCentral (password real do utilizador)
 * 2. Se válido, faz signInWithPassword no Supabase com PASSWORD FIXA
 * 3. Se utilizador não existe no Supabase, cria-o com PASSWORD FIXA
 * 4. Retorna JWT do Supabase
 * 
 * A password no Supabase é SEMPRE "Admin1234!" para todos os utilizadores.
 * A autenticação real é feita pelo MeshCentral.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateMeshCredentials, ensureSupabaseUser } from "@/lib/mesh-auth";

export const runtime = "nodejs";

// Password fixa para todos os utilizadores no Supabase
// A autenticação real é feita no MeshCentral
const SUPABASE_FIXED_PASSWORD = "Admin1234!";

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
  let body: LoginRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { message: "Pedido inválido" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const email = body.email?.toString().trim().toLowerCase();
  const password = body.password?.toString() ?? "";
  const requestedDomain = body.domain?.toString().trim() || "mesh";

  console.log("[Login] Request received for:", email, "domain:", requestedDomain);

  if (!email || !password) {
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
    console.log("[Login] Step 1: Validating against MeshCentral...");

    const authResult = await validateMeshCredentials(email, password, fullDomain);

    if (!authResult.ok) {
      console.log("[Login] MeshCentral authentication FAILED:", authResult.error);
      return NextResponse.json(
        {
          message: authResult.error || "Credenciais inválidas.",
          error: "invalid_credentials",
        },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    console.log("[Login] MeshCentral authentication SUCCESS");

    // =========================================
    // STEP 2: SignIn to Supabase with FIXED password
    // =========================================
    console.log("[Login] Step 2: Signing into Supabase with fixed password...");

    let signInResult = await supabase.auth.signInWithPassword({
      email,
      password: SUPABASE_FIXED_PASSWORD,
    });

    // =========================================
    // STEP 3: If user doesn't exist in Supabase, create with FIXED password
    // =========================================
    if (signInResult.error) {
      console.log("[Login] Supabase signIn failed:", signInResult.error.message);
      
      // Check if it's invalid credentials (user doesn't exist or wrong password)
      const errorMessage = signInResult.error.message?.toLowerCase() || "";
      const isInvalidCreds = errorMessage.includes("invalid") || 
                             errorMessage.includes("credentials") ||
                             signInResult.error.status === 400;

      if (isInvalidCreds) {
        console.log("[Login] Step 3: Creating user in Supabase with fixed password...");

        // Create user in Supabase Auth with FIXED password
        const signUpResult = await supabase.auth.signUp({
          email,
          password: SUPABASE_FIXED_PASSWORD,
          options: {
            data: {
              full_name: email.split("@")[0],
            },
          },
        });

        if (signUpResult.error) {
          console.log("[Login] SignUp error:", signUpResult.error.message);

          // If user already exists with different password, we have a problem
          if (signUpResult.error.message?.includes("already registered")) {
            console.log("[Login] User exists with different password - need to reset");
            
            // Try to update password via admin API would be needed here
            // For now, return a specific error
            return NextResponse.json(
              { message: "Utilizador existe com password diferente. Contacte o administrador." },
              { status: 401, headers: CORS_HEADERS }
            );
          }

          return NextResponse.json(
            { message: "Erro ao criar utilizador." },
            { status: 500, headers: CORS_HEADERS }
          );
        }

        // If signUp returned a session, use it
        if (signUpResult.data?.session?.access_token) {
          console.log("[Login] SignUp successful with immediate session");

          // Ensure user is mirrored to mesh_users table
          await ensureSupabaseUser(email, fullDomain);

          return NextResponse.json(
            { token: signUpResult.data.session.access_token },
            { status: 200, headers: CORS_HEADERS }
          );
        }

        // SignUp succeeded but no immediate session - try signIn again
        console.log("[Login] SignUp successful, trying signIn again...");

        signInResult = await supabase.auth.signInWithPassword({
          email,
          password: SUPABASE_FIXED_PASSWORD,
        });

        if (signInResult.error) {
          console.log("[Login] SignIn after SignUp failed:", signInResult.error.message);
          return NextResponse.json(
            { message: "Erro ao autenticar após criação." },
            { status: 500, headers: CORS_HEADERS }
          );
        }
      } else {
        // Other error
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
      console.log("[Login] No token in response");
      return NextResponse.json(
        { message: "Resposta sem token." },
        { status: 502, headers: CORS_HEADERS }
      );
    }

    // Ensure user is mirrored to mesh_users table
    await ensureSupabaseUser(email, fullDomain);

    console.log("[Login] SUCCESS - JWT obtained, length:", token.length);

    return NextResponse.json(
      { token },
      { status: 200, headers: CORS_HEADERS }
    );

  } catch (error) {
    console.error("[Login] Unexpected error:", error);
    return NextResponse.json(
      { message: "Erro interno do servidor." },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
