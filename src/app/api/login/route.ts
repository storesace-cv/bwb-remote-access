/**
 * Login Route - Supabase JWT com Admin API
 * 
 * FLOW:
 * 1. Aceita email/password
 * 2. Usa Admin API para criar/atualizar utilizador (evita confirmação de email)
 * 3. Faz signIn no Supabase com password FIXA
 * 4. Retorna JWT
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ensureSupabaseUser } from "@/lib/mesh-auth";

export const runtime = "nodejs";

const SUPABASE_FIXED_PASSWORD = "Admin1234!";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://kqwaibgvmzcqeoctukoy.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtxd2FpYmd2bXpjcWVvY3R1a295Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1MjQxOTMsImV4cCI6MjA4MDEwMDE5M30.8C3b_iSn4EXKSkmef40XzF7Y4Uqy7i-OLfXNsRiGC3s";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabase = createClient(supabaseUrl, supabaseAnonKey);
const supabaseAdmin = supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
}) : null;

// Log configuration at startup
console.log("[Login] Config - URL:", supabaseUrl);
console.log("[Login] Config - Has Admin Key:", Boolean(supabaseServiceKey));

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: Request) {
  console.log("[Login] Request received");
  
  let body: { email?: string; password?: string; domain?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Pedido inválido" }, { status: 400, headers: CORS_HEADERS });
  }

  const email = body.email?.toString().trim().toLowerCase();
  const password = body.password?.toString() ?? "";
  const domain = body.domain?.toString().trim() || "mesh";

  console.log("[Login] Email:", email, "Domain:", domain);

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
    // STEP 1: Try signIn to Supabase with FIXED password
    console.log("[Login] Trying Supabase signIn with fixed password...");
    let signInResult = await supabase.auth.signInWithPassword({
      email,
      password: SUPABASE_FIXED_PASSWORD,
    });
    console.log("[Login] SignIn result:", signInResult.error?.message || "OK");

    // STEP 2: If failed, try to create user or update password
    if (signInResult.error) {
      console.log("[Login] SignIn failed, trying to create/update user...");

      // Try to create user
      const signUpResult = await supabase.auth.signUp({
        email,
        password: SUPABASE_FIXED_PASSWORD,
      });
      console.log("[Login] SignUp result:", signUpResult.error?.message || "OK");

      if (signUpResult.error) {
        // User exists but with different password - try to update via admin
        if (signUpResult.error.message?.includes("already registered") && supabaseAdmin) {
          console.log("[Login] User exists, updating password via admin...");
          
          const { data: userData } = await supabaseAdmin.auth.admin.listUsers();
          const existingUser = userData?.users?.find(u => u.email?.toLowerCase() === email);
          
          if (existingUser) {
            const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
              existingUser.id,
              { password: SUPABASE_FIXED_PASSWORD }
            );
            console.log("[Login] Password update:", updateError?.message || "OK");
            
            if (!updateError) {
              signInResult = await supabase.auth.signInWithPassword({
                email,
                password: SUPABASE_FIXED_PASSWORD,
              });
              console.log("[Login] Retry signIn:", signInResult.error?.message || "OK");
            }
          }
        } else {
          return NextResponse.json(
            { message: signUpResult.error.message || "Erro ao criar utilizador." },
            { status: 500, headers: CORS_HEADERS }
          );
        }
      } else if (signUpResult.data?.session?.access_token) {
        console.log("[Login] SignUp successful with immediate session");
        await ensureSupabaseUser(email, fullDomain);
        return NextResponse.json(
          { token: signUpResult.data.session.access_token },
          { status: 200, headers: CORS_HEADERS }
        );
      } else {
        signInResult = await supabase.auth.signInWithPassword({
          email,
          password: SUPABASE_FIXED_PASSWORD,
        });
        console.log("[Login] SignIn after signup:", signInResult.error?.message || "OK");
      }
    }

    // STEP 3: Return JWT
    if (signInResult.error) {
      console.log("[Login] Final error:", signInResult.error.message);
      return NextResponse.json(
        { message: "Erro de autenticação: " + signInResult.error.message },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    const token = signInResult.data?.session?.access_token;
    if (!token) {
      return NextResponse.json(
        { message: "Sem token na resposta." },
        { status: 502, headers: CORS_HEADERS }
      );
    }

    await ensureSupabaseUser(email, fullDomain);
    console.log("[Login] SUCCESS - Token length:", token.length);

    return NextResponse.json({ token }, { status: 200, headers: CORS_HEADERS });

  } catch (error) {
    console.error("[Login] Exception:", error);
    return NextResponse.json(
      { message: "Erro interno: " + String(error) },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
