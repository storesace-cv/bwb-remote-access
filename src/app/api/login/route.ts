/**
 * Login Route - Supabase JWT com Admin API
 * 
 * FLOW:
 * 1. Aceita email/password
 * 2. Usa Admin API para criar/atualizar utilizador (evita confirmação de email)
 * 3. Faz signIn no Supabase com password FIXA
 * 4. Define cookie de sessão para middleware
 * 5. Retorna JWT
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ensureSupabaseUser, setSessionCookie, type MeshSession } from "@/lib/mesh-auth";

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
    // STEP 1: If we have admin key, use it to create/update user (bypasses email confirmation)
    if (supabaseAdmin) {
      console.log("[Login] Using Admin API to ensure user exists...");
      
      // Check if user exists
      const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
      const existingUser = listData?.users?.find(u => u.email?.toLowerCase() === email);
      
      if (existingUser) {
        // Update password to ensure it's the fixed password
        console.log("[Login] User exists, updating password...");
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
          existingUser.id,
          { password: SUPABASE_FIXED_PASSWORD, email_confirm: true }
        );
        if (updateError) {
          console.log("[Login] Password update error:", updateError.message);
        }
      } else {
        // Create new user with admin API (auto-confirmed)
        console.log("[Login] Creating new user via Admin API...");
        const { error: createError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password: SUPABASE_FIXED_PASSWORD,
          email_confirm: true, // Auto-confirm email
        });
        if (createError) {
          console.log("[Login] Create user error:", createError.message);
        }
      }
    } else {
      console.log("[Login] No Admin API key - using standard signup flow");
    }

    // STEP 2: Sign in with fixed password
    console.log("[Login] Signing in with fixed password...");
    const signInResult = await supabase.auth.signInWithPassword({
      email,
      password: SUPABASE_FIXED_PASSWORD,
    });
    console.log("[Login] SignIn result:", signInResult.error?.message || "OK");

    if (signInResult.error) {
      // If no admin key and login fails, try signup as fallback
      if (!supabaseAdmin) {
        console.log("[Login] Trying signup fallback...");
        const signUpResult = await supabase.auth.signUp({
          email,
          password: SUPABASE_FIXED_PASSWORD,
        });
        
        if (signUpResult.error) {
          return NextResponse.json(
            { 
              message: "Erro de autenticação. SUPABASE_SERVICE_ROLE_KEY não configurada.",
              error: signUpResult.error.message 
            },
            { status: 401, headers: CORS_HEADERS }
          );
        }
        
        if (signUpResult.data?.session?.access_token) {
          await ensureSupabaseUser(email, fullDomain);
          return NextResponse.json(
            { token: signUpResult.data.session.access_token },
            { status: 200, headers: CORS_HEADERS }
          );
        }
        
        return NextResponse.json(
          { message: "Utilizador criado. Verifique o email para confirmar a conta." },
          { status: 200, headers: CORS_HEADERS }
        );
      }
      
      return NextResponse.json(
        { message: "Erro de autenticação: " + signInResult.error.message },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    // STEP 3: Return JWT
    const token = signInResult.data?.session?.access_token;
    if (!token) {
      return NextResponse.json(
        { message: "Sem token na resposta." },
        { status: 502, headers: CORS_HEADERS }
      );
    }

    await ensureSupabaseUser(email, fullDomain);
    console.log("[Login] SUCCESS - Token length:", token.length);

    // STEP 4: Set session cookie for middleware
    const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days
    const now = new Date();
    const session: MeshSession = {
      email,
      domain: fullDomain,
      authenticated: true,
      authenticatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + SESSION_MAX_AGE * 1000).toISOString(),
    };
    await setSessionCookie(session);
    console.log("[Login] Session cookie set");

    return NextResponse.json({ token }, { status: 200, headers: CORS_HEADERS });

  } catch (error) {
    console.error("[Login] Exception:", error);
    return NextResponse.json(
      { message: "Erro interno: " + String(error) },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
