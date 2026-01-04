/**
 * MeshCentral Authentication Library
 * 
 * Authentication is EXCLUSIVELY based on MeshCentral username/password validation.
 * No Auth0, no OAuth, no JWTs from external IdPs.
 * 
 * Flow:
 * 1. User submits email/password
 * 2. App validates against MeshCentral API
 * 3. If valid, create session cookie
 * 4. Check/create user in Supabase with default role=USER
 */

import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

// =============================================================================
// TYPES
// =============================================================================

export interface MeshSession {
  email: string;
  domain: string;
  meshUserId?: string;
  authenticated: boolean;
  authenticatedAt: string;
}

export interface AuthResult {
  success: boolean;
  error?: string;
  session?: MeshSession;
}

// =============================================================================
// DOMAIN CONFIGURATION
// =============================================================================

const MESH_DOMAINS: Record<string, string> = {
  "mesh.bwb.pt": "https://mesh.bwb.pt",
  "zonetech.bwb.pt": "https://zonetech.bwb.pt",
  "zsangola.bwb.pt": "https://zsangola.bwb.pt",
};

const DEFAULT_DOMAIN = "mesh.bwb.pt";

/**
 * Get MeshCentral URL for a given domain
 */
export function getMeshUrl(domain: string): string {
  return MESH_DOMAINS[domain] || MESH_DOMAINS[DEFAULT_DOMAIN];
}

/**
 * Get domain from request host header
 */
export function getDomainFromHost(host: string): string {
  // Extract domain from host (remove port if present)
  const domain = host.split(":")[0];
  
  // Map rustdesk.bwb.pt to mesh.bwb.pt
  if (domain === "rustdesk.bwb.pt" || domain === "localhost") {
    return DEFAULT_DOMAIN;
  }
  
  return MESH_DOMAINS[domain] ? domain : DEFAULT_DOMAIN;
}

// =============================================================================
// SESSION COOKIE MANAGEMENT
// =============================================================================

const SESSION_COOKIE_NAME = "mesh_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

/**
 * Create encrypted session data (simple base64 for now)
 */
function encodeSession(session: MeshSession): string {
  return Buffer.from(JSON.stringify(session)).toString("base64");
}

/**
 * Decode session data
 */
function decodeSession(encoded: string): MeshSession | null {
  try {
    const json = Buffer.from(encoded, "base64").toString("utf-8");
    return JSON.parse(json) as MeshSession;
  } catch {
    return null;
  }
}

/**
 * Set session cookie
 */
export async function setSessionCookie(session: MeshSession): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, encodeSession(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
}

/**
 * Get current session from cookie
 */
export async function getSession(): Promise<MeshSession | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE_NAME);
  
  if (!cookie?.value) {
    return null;
  }
  
  return decodeSession(cookie.value);
}

/**
 * Clear session cookie (logout)
 */
export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

// =============================================================================
// MESHCENTRAL AUTHENTICATION
// =============================================================================

/**
 * Authenticate user against MeshCentral
 */
export async function authenticateWithMesh(
  email: string,
  password: string,
  domain: string
): Promise<AuthResult> {
  const meshUrl = getMeshUrl(domain);
  
  try {
    // MeshCentral login endpoint
    const response = await fetch(`${meshUrl}/api/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "login",
        username: email,
        password: password,
      }),
    });
    
    if (!response.ok) {
      return {
        success: false,
        error: "MeshCentral authentication failed",
      };
    }
    
    const data = await response.json();
    
    // Check if login was successful
    if (data.result === "ok" || data.userid) {
      const session: MeshSession = {
        email,
        domain,
        meshUserId: data.userid,
        authenticated: true,
        authenticatedAt: new Date().toISOString(),
      };
      
      return {
        success: true,
        session,
      };
    }
    
    return {
      success: false,
      error: data.error || "Invalid credentials",
    };
  } catch (error) {
    console.error("[AUTH] MeshCentral auth error:", error);
    return {
      success: false,
      error: "Failed to connect to MeshCentral",
    };
  }
}

// =============================================================================
// SUPABASE USER MANAGEMENT
// =============================================================================

/**
 * Get Supabase client for user management
 */
function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!url || !key) {
    throw new Error("Supabase not configured");
  }
  
  return createClient(url, key);
}

/**
 * Ensure user exists in Supabase after MeshCentral authentication
 * Creates user with default role=USER if not exists
 */
export async function ensureSupabaseUser(
  email: string,
  domain: string
): Promise<{ id: string; role: string; user_type: string }> {
  const supabase = getSupabaseAdmin();
  
  // Check if user exists
  const { data: existingUser, error: fetchError } = await supabase
    .from("users")
    .select("id, role, user_type")
    .eq("email", email)
    .eq("domain", domain)
    .single();
  
  if (existingUser) {
    return existingUser;
  }
  
  // Create new user with default role
  const { data: newUser, error: createError } = await supabase
    .from("users")
    .insert({
      email,
      domain,
      role: "USER",
      user_type: "user",
      created_at: new Date().toISOString(),
    })
    .select("id, role, user_type")
    .single();
  
  if (createError) {
    console.error("[AUTH] Failed to create Supabase user:", createError);
    throw new Error("Failed to create user record");
  }
  
  return newUser;
}

// =============================================================================
// FULL LOGIN FLOW
// =============================================================================

/**
 * Complete login flow:
 * 1. Authenticate with MeshCentral
 * 2. Ensure user exists in Supabase
 * 3. Create session cookie
 */
export async function login(
  email: string,
  password: string,
  domain: string
): Promise<AuthResult> {
  // 1. Authenticate with MeshCentral
  const authResult = await authenticateWithMesh(email, password, domain);
  
  if (!authResult.success || !authResult.session) {
    return authResult;
  }
  
  try {
    // 2. Ensure user exists in Supabase
    await ensureSupabaseUser(email, domain);
    
    // 3. Set session cookie
    await setSessionCookie(authResult.session);
    
    return authResult;
  } catch (error) {
    console.error("[AUTH] Login flow error:", error);
    return {
      success: false,
      error: "Failed to complete login",
    };
  }
}

/**
 * Logout - clear session
 */
export async function logout(): Promise<void> {
  await clearSession();
}
