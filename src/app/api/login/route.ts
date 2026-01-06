/**
 * Login Route - MeshCentral + Supabase JWT
 * 
 * 1. Valida credenciais no MeshCentral (password real)
 * 2. Se válido, faz signIn no Supabase com password FIXA
 * 3. Se utilizador não existe no Supabase, cria-o
 * 4. Retorna JWT
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateMeshCredentials, ensureSupabaseUser } from "@/lib/mesh-auth";

export const runtime = "nodejs";

const SUPABASE_FIXED_PASSWORD = "Admin1234!";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://kqwaibgvmzcqeoctukoy.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtxd2FpYmd2bXpjcWVvY3R1a295Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1MjQxOTMsImV4cCI6MjA4MDEwMDE5M30.8C3b_iSn4EXKSkmef40XzF7Y4Uqy7i-OLfXNsRiGC3s";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabase = createClient(supabaseUrl, supabaseAnonKey);
const supabaseAdmin = supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
}) : null;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: Request) {
  let body: { email?: string; password?: string; domain?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Pedido inválido" }, { status: 400, headers: CORS_HEADERS });
  }

  const email = body.email?.toString().trim().toLowerCase();
  const password = body.password?.toString() ?? "";
  const domain = body.domain?.toString().trim() || "mesh";

  console.log("[Login] Request:", email, "domain:", domain);

  if (!email || !password) {
    return NextResponse.json({ message: "Email e password são obrigatórios." }, { status: 400, headers: CORS_HEADERS });
  }

  const domainMap: Record<string, string> = {
    mesh: "mesh.bwb.pt",
    zonetech: "zonetech.bwb.pt", 
    zsangola: "zsangola.bwb.pt",
  };
  const fullDomain = domainMap[domain] || "mesh.bwb.pt";

  try {
    // STEP 1: Validate against MeshCentral
    // validateMeshCredentials expects (baseUrl, email, password)
    const meshUrl = `https://${fullDomain}`;
    console.log("[Login] Validating MeshCentral at:", meshUrl);
    const meshResult = await validateMeshCredentials(meshUrl, email, password);

    if (!meshResult.ok) {
      console.log("[Login] MeshCentral FAILED:", meshResult.error);
      return NextResponse.json(
        { message: meshResult.error || "Credenciais inválidas.", error: "invalid_credentials" },
        { status: 401, headers: CORS_HEADERS }
      );
    }
    console.log("[Login] MeshCentral OK");

    // STEP 2: Try signIn to Supabase with FIXED password
    console.log("[Login] Trying Supabase signIn...");
    let signInResult = await supabase.auth.signInWithPassword({
      email,
      password: SUPABASE_FIXED_PASSWORD,
    });

    // STEP 3: If failed, try to create user or update password
    if (signInResult.error) {
      console.log("[Login] SignIn failed:", signInResult.error.message);

      // Try to create user
      console.log("[Login] Creating user in Supabase...");
      const signUpResult = await supabase.auth.signUp({
        email,
        password: SUPABASE_FIXED_PASSWORD,
      });

      if (signUpResult.error) {
        console.log("[Login] SignUp failed:", signUpResult.error.message);

        // User exists but with different password - try to update via admin
        if (signUpResult.error.message?.includes("already registered") && supabaseAdmin) {
          console.log("[Login] Updating password via admin...");
          
          // Get user ID first
          const { data: userData } = await supabaseAdmin.auth.admin.listUsers();
          const existingUser = userData?.users?.find(u => u.email?.toLowerCase() === email);
          
          if (existingUser) {
            const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
              existingUser.id,
              { password: SUPABASE_FIXED_PASSWORD }
            );
            
            if (updateError) {
              console.log("[Login] Password update failed:", updateError.message);
              return NextResponse.json(
                { message: "Erro ao actualizar utilizador." },
                { status: 500, headers: CORS_HEADERS }
              );
            }
            
            console.log("[Login] Password updated, trying signIn again...");
            signInResult = await supabase.auth.signInWithPassword({
              email,
              password: SUPABASE_FIXED_PASSWORD,
            });
          }
        } else {
          return NextResponse.json(
            { message: "Erro ao criar utilizador." },
            { status: 500, headers: CORS_HEADERS }
          );
        }
      } else if (signUpResult.data?.session?.access_token) {
        // SignUp successful with session
        console.log("[Login] SignUp successful with session");
        await ensureSupabaseUser(email, fullDomain);
        return NextResponse.json(
          { token: signUpResult.data.session.access_token },
          { status: 200, headers: CORS_HEADERS }
        );
      } else {
        // SignUp successful, try signIn
        console.log("[Login] SignUp successful, trying signIn...");
        signInResult = await supabase.auth.signInWithPassword({
          email,
          password: SUPABASE_FIXED_PASSWORD,
        });
      }
    }

    // STEP 4: Return JWT
    if (signInResult.error) {
      console.log("[Login] Final signIn failed:", signInResult.error.message);
      return NextResponse.json(
        { message: "Erro de autenticação." },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    const token = signInResult.data?.session?.access_token;
    if (!token) {
      return NextResponse.json(
        { message: "Sem token." },
        { status: 502, headers: CORS_HEADERS }
      );
    }

    await ensureSupabaseUser(email, fullDomain);
    console.log("[Login] SUCCESS, token length:", token.length);

    return NextResponse.json({ token }, { status: 200, headers: CORS_HEADERS });

  } catch (error) {
    console.error("[Login] Error:", error);
    return NextResponse.json(
      { message: "Erro interno." },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
