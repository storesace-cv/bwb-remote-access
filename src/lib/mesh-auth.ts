/**
 * MeshCentral Authentication Library
 * 
 * Authentication is EXCLUSIVELY based on MeshCentral username/password validation.
 * No Auth0, no OAuth, no JWTs from external IdPs.
 * 
 * Flow:
 * 1. User submits email/password
 * 2. App validates against MeshCentral using browser-equivalent login flow
 * 3. If valid, create encrypted session cookie
 * 4. Check/create user in Supabase mesh_users table
 * 
 * IMPORTANT: Uses public.mesh_users table (NOT public.users which doesn't exist)
 */

import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import * as crypto from "crypto";

// =============================================================================
// TYPES
// =============================================================================

export interface MeshSession {
  email: string;
  domain: string;
  userId?: string;        // mesh_users.id (UUID)
  userType?: string;      // user_type from mesh_users
  authenticated: boolean;
  authenticatedAt: string;
  expiresAt: string;
}

export interface AuthResult {
  success: boolean;
  error?: string;
  session?: MeshSession;
}

// User types in hierarchy (from schema)
export type UserType = 'siteadmin' | 'minisiteadmin' | 'agent' | 'colaborador' | 'inactivo' | 'candidato';

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
  const envOverride = process.env.MESH_BASE_URL;
  if (envOverride) {
    return envOverride;
  }
  return MESH_DOMAINS[domain] || MESH_DOMAINS[DEFAULT_DOMAIN];
}

/**
 * Get domain from request host header
 */
export function getDomainFromHost(host: string): string {
  const domain = host.split(":")[0];
  
  if (domain === "rustdesk.bwb.pt" || domain === "localhost") {
    return DEFAULT_DOMAIN;
  }
  
  return MESH_DOMAINS[domain] ? domain : DEFAULT_DOMAIN;
}

/**
 * Get short domain name for Supabase (mesh, zonetech, zsangola)
 */
export function getShortDomain(fullDomain: string): string {
  const map: Record<string, string> = {
    "mesh.bwb.pt": "mesh",
    "zonetech.bwb.pt": "zonetech",
    "zsangola.bwb.pt": "zsangola",
  };
  return map[fullDomain] || "mesh";
}

/**
 * Normalize email: lowercase and trim
 * IMPORTANT: username MUST equal email in our system
 */
export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

// =============================================================================
// SESSION COOKIE MANAGEMENT
// =============================================================================

const SESSION_COOKIE_NAME = "mesh_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days in seconds

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET environment variable is required");
  }
  return secret;
}

function encryptSession(session: MeshSession): string {
  const secret = getSessionSecret();
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(secret, "salt", 32);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  
  const json = JSON.stringify(session);
  const encrypted = Buffer.concat([
    cipher.update(json, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString("base64");
}

function decryptSession(encoded: string): MeshSession | null {
  try {
    const secret = getSessionSecret();
    const combined = Buffer.from(encoded, "base64");
    
    const iv = combined.subarray(0, 16);
    const authTag = combined.subarray(16, 32);
    const encrypted = combined.subarray(32);
    
    const key = crypto.scryptSync(secret, "salt", 32);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    
    return JSON.parse(decrypted.toString("utf8")) as MeshSession;
  } catch {
    return null;
  }
}

export async function setSessionCookie(session: MeshSession): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, encryptSession(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
}

export async function getSession(): Promise<MeshSession | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE_NAME);
  
  if (!cookie?.value) {
    return null;
  }
  
  const session = decryptSession(cookie.value);
  
  if (session && new Date(session.expiresAt) < new Date()) {
    return null;
  }
  
  return session;
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function refreshSession(): Promise<void> {
  const session = await getSession();
  if (session) {
    session.expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000).toISOString();
    await setSessionCookie(session);
  }
}

// =============================================================================
// MESHCENTRAL AUTHENTICATION
// =============================================================================

function parseCookies(headers: Headers): Record<string, string> {
  const cookies: Record<string, string> = {};
  const setCookieHeaders = headers.getSetCookie();
  
  for (const cookieStr of setCookieHeaders) {
    const [nameValue] = cookieStr.split(";");
    const [name, value] = nameValue.split("=");
    if (name && value) {
      cookies[name.trim()] = value.trim();
    }
  }
  
  return cookies;
}

function formatCookies(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

/**
 * Validate credentials against MeshCentral using browser-equivalent flow
 */
export async function validateMeshCredentials(
  baseUrl: string,
  email: string,
  password: string
): Promise<{ ok: boolean; error?: string }> {
  const normalizedEmail = normalizeEmail(email);
  
  try {
    let cookieJar: Record<string, string> = {};
    
    // Step 1: GET /login to get initial cookies
    const step1Response = await fetch(`${baseUrl}/login`, {
      method: "GET",
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    
    const step1Cookies = parseCookies(step1Response.headers);
    cookieJar = { ...cookieJar, ...step1Cookies };
    
    // Step 2: POST /login with form data
    const formData = new URLSearchParams();
    formData.append("action", "login");
    formData.append("username", normalizedEmail);
    formData.append("password", password);
    
    const step2Response = await fetch(`${baseUrl}/login`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie": formatCookies(cookieJar),
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Origin": baseUrl,
        "Referer": `${baseUrl}/login`,
      },
      body: formData.toString(),
    });
    
    const step2Cookies = parseCookies(step2Response.headers);
    cookieJar = { ...cookieJar, ...step2Cookies };
    
    const xid = cookieJar["xid"];
    
    // Step 3: GET / to verify logged in
    const step3Response = await fetch(`${baseUrl}/`, {
      method: "GET",
      redirect: "follow",
      headers: {
        "Cookie": formatCookies(cookieJar),
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    
    const html = await step3Response.text();
    
    if (html.includes("<title>MeshCentral</title>") && !html.includes("Login</title>")) {
      return { ok: true };
    }
    
    if (xid && xid !== "e30=" && xid !== "e30%3D" && xid.length > 10) {
      return { ok: true };
    }
    
    return { ok: false, error: "Invalid credentials" };
    
  } catch (error) {
    console.error("[AUTH] MeshCentral validation error:", error);
    return { ok: false, error: "Failed to connect to MeshCentral" };
  }
}

export async function authenticateWithMesh(
  email: string,
  password: string,
  domain: string
): Promise<AuthResult> {
  const meshUrl = getMeshUrl(domain);
  const normalizedEmail = normalizeEmail(email);
  
  const result = await validateMeshCredentials(meshUrl, normalizedEmail, password);
  
  if (!result.ok) {
    return {
      success: false,
      error: result.error || "Invalid credentials",
    };
  }
  
  const now = new Date();
  const session: MeshSession = {
    email: normalizedEmail,
    domain,
    authenticated: true,
    authenticatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_MAX_AGE * 1000).toISOString(),
  };
  
  return {
    success: true,
    session,
  };
}

// =============================================================================
// SUPABASE USER MANAGEMENT - Uses mesh_users table
// =============================================================================

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || 
              process.env.SUPABASE_KEY || 
              process.env.SUPABASE_ANON_KEY;
  
  if (!url || !key) {
    console.warn("[AUTH] Supabase not configured - user mirroring disabled");
    return null;
  }
  
  return createClient(url, key);
}

/**
 * Ensure user exists in Supabase mesh_users table after MeshCentral authentication
 * 
 * IMPORTANT: 
 * - Uses public.mesh_users table (NOT public.users which doesn't exist)
 * - username MUST equal email (normalized)
 * - Default user_type for new users: 'candidato'
 * - Does NOT block login if this fails
 */
export async function ensureSupabaseUser(
  email: string,
  domain: string
): Promise<{ id?: string; user_type?: string } | null> {
  const supabase = getSupabaseAdmin();
  
  if (!supabase) {
    console.log("[AUTH] Skipping Supabase user mirroring - not configured");
    return null;
  }
  
  const normalizedEmail = normalizeEmail(email);
  const shortDomain = getShortDomain(domain);
  
  try {
    // Check if user exists by mesh_username (which equals email)
    const { data: existingUser, error: fetchError } = await supabase
      .from("mesh_users")
      .select("id, user_type, agent_id")
      .eq("mesh_username", normalizedEmail)
      .maybeSingle();
    
    if (existingUser) {
      console.log(`[AUTH] Found existing mesh_user: ${normalizedEmail}, type: ${existingUser.user_type}`);
      return { id: existingUser.id, user_type: existingUser.user_type };
    }
    
    // User doesn't exist - create with default user_type='candidato'
    // Note: agent_id is required - we need to handle this
    // For now, we'll look for an existing agent for this domain or create a placeholder
    
    // First, try to find an agent for this domain
    const { data: domainAgent } = await supabase
      .from("mesh_users")
      .select("id")
      .eq("domain", shortDomain)
      .eq("user_type", "agent")
      .limit(1)
      .maybeSingle();
    
    // If no agent exists, we can't create the user without one
    // The mesh_users table has agent_id as NOT NULL
    if (!domainAgent) {
      console.warn(`[AUTH] No agent found for domain ${shortDomain} - cannot create user record`);
      console.log(`[AUTH] User ${normalizedEmail} authenticated but not mirrored to DB (no agent)`);
      return null;
    }
    
    const { data: newUser, error: createError } = await supabase
      .from("mesh_users")
      .insert({
        mesh_username: normalizedEmail,  // username = email
        email: normalizedEmail,
        domain: shortDomain,
        user_type: "candidato",          // Default for new users
        agent_id: domainAgent.id,        // Required FK
        source: "meshcentral",
      })
      .select("id, user_type")
      .single();
    
    if (createError) {
      console.error("[AUTH] Failed to create mesh_user:", createError);
      return null;
    }
    
    console.log(`[AUTH] Created new mesh_user: ${normalizedEmail} @ ${shortDomain}`);
    return { id: newUser.id, user_type: newUser.user_type };
    
  } catch (error) {
    console.error("[AUTH] Supabase user mirroring error:", error);
    return null;
  }
}

/**
 * Get user by email from mesh_users table
 */
export async function getMeshUserByEmail(email: string): Promise<{
  id: string;
  mesh_username: string;
  email: string | null;
  user_type: UserType;
  domain: string;
  agent_id: string;
} | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  
  const normalizedEmail = normalizeEmail(email);
  
  const { data, error } = await supabase
    .from("mesh_users")
    .select("id, mesh_username, email, user_type, domain, agent_id")
    .eq("mesh_username", normalizedEmail)
    .maybeSingle();
  
  if (error || !data) {
    return null;
  }
  
  return data as {
    id: string;
    mesh_username: string;
    email: string | null;
    user_type: UserType;
    domain: string;
    agent_id: string;
  };
}

// =============================================================================
// FULL LOGIN FLOW
// =============================================================================

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
    // 2. Ensure user exists in Supabase (non-blocking)
    const userData = await ensureSupabaseUser(email, domain);
    
    // Enrich session with user data if available
    if (userData) {
      authResult.session.userId = userData.id;
      authResult.session.userType = userData.user_type;
    }
    
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

export async function logout(): Promise<void> {
  await clearSession();
}
