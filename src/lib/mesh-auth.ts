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
 * Generate a stable UUID for user identity.
 * This is only called ONCE per user and then persisted.
 */
function generateUserUUID(): string {
  return crypto.randomUUID();
}

/**
 * Ensure user exists in Supabase mesh_users table after MeshCentral authentication.
 * Also ensures auth_user_id is set (generates once if missing).
 * 
 * IMPORTANT: 
 * - Uses public.mesh_users table
 * - username MUST equal email (normalized)
 * - Default user_type for new users: 'candidato'
 * - Guarantees auth_user_id is always set
 */
export async function ensureSupabaseUser(
  email: string,
  domain: string
): Promise<{ id: string; auth_user_id: string; user_type: string } | null> {
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
      .select("id, user_type, agent_id, auth_user_id")
      .eq("mesh_username", normalizedEmail)
      .maybeSingle();
    
    // Handle database errors explicitly
    if (fetchError) {
      console.error("[AUTH] Database error fetching user:", fetchError.message);
      return null;
    }
    
    if (existingUser) {
      // User exists - check if auth_user_id needs to be set
      let authUserId = existingUser.auth_user_id;
      
      if (!authUserId) {
        // Generate auth_user_id ONCE and persist it
        authUserId = generateUserUUID();
        console.log(`[AUTH] Generating auth_user_id for existing user: ${normalizedEmail}`);
        
        const { error: updateError } = await supabase
          .from("mesh_users")
          .update({ auth_user_id: authUserId })
          .eq("id", existingUser.id);
        
        if (updateError) {
          console.error("[AUTH] Failed to set auth_user_id:", updateError.message);
          // Continue anyway - we can try again next login
        }
      }
      
      console.log(`[AUTH] Found existing mesh_user: ${normalizedEmail}, auth_user_id: ${authUserId}`);
      return { 
        id: existingUser.id, 
        auth_user_id: authUserId,
        user_type: existingUser.user_type 
      };
    }
    
    // User doesn't exist - create with default user_type='candidato'
    // First, try to find an agent/admin for this domain to be the parent
    const { data: domainAdmin } = await supabase
      .from("mesh_users")
      .select("id")
      .eq("domain", shortDomain)
      .in("user_type", ["siteadmin", "minisiteadmin", "agent"])
      .limit(1)
      .maybeSingle();
    
    // If no admin exists, we can't create the user without one
    // The mesh_users table has agent_id as NOT NULL
    if (!domainAdmin) {
      console.warn(`[AUTH] No admin/agent found for domain ${shortDomain} - cannot create user record`);
      console.log(`[AUTH] User ${normalizedEmail} authenticated but not mirrored to DB (no admin)`);
      return null;
    }
    
    // Generate auth_user_id for the new user
    const authUserId = generateUserUUID();
    
    const { data: newUser, error: createError } = await supabase
      .from("mesh_users")
      .insert({
        mesh_username: normalizedEmail,  // username = email
        email: normalizedEmail,
        domain: shortDomain,
        user_type: "candidato",          // Default for new users
        agent_id: domainAdmin.id,        // Parent admin/agent
        source: "meshcentral",
        auth_user_id: authUserId,        // Stable UUID for this user
      })
      .select("id, user_type, auth_user_id")
      .single();
    
    if (createError) {
      console.error("[AUTH] Failed to create mesh_user:", createError);
      return null;
    }
    
    console.log(`[AUTH] Created new mesh_user: ${normalizedEmail} @ ${shortDomain}, auth_user_id: ${authUserId}`);
    return { 
      id: newUser.id, 
      auth_user_id: newUser.auth_user_id,
      user_type: newUser.user_type 
    };
    
  } catch (error) {
    console.error("[AUTH] Supabase user mirroring error:", error);
    return null;
  }
}

/**
 * Upsert user into public.profiles table.
 * Uses mesh_users.auth_user_id as profiles.id for stable identity.
 * 
 * Schema from remote_schema.sql:
 *   profiles.id        uuid NOT NULL (PK)
 *   profiles.email     text
 *   profiles.full_name text
 *   profiles.avatar_url text
 *   profiles.created_at timestamp with time zone DEFAULT now()
 */
export async function ensureProfileExists(
  authUserId: string,
  email: string,
  fullName?: string
): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  
  if (!supabase) {
    console.log("[AUTH] Skipping profile mirroring - Supabase not configured");
    return false;
  }
  
  const normalizedEmail = normalizeEmail(email);
  
  try {
    // Upsert into profiles - idempotent operation
    const { error: upsertError } = await supabase
      .from("profiles")
      .upsert(
        {
          id: authUserId,
          email: normalizedEmail,
          full_name: fullName || normalizedEmail.split("@")[0],
          // avatar_url: null (optional)
          // created_at: defaults to now() on insert
        },
        {
          onConflict: "id",
          ignoreDuplicates: false,
        }
      );
    
    if (upsertError) {
      console.error("[AUTH] Failed to upsert profile:", upsertError.message);
      return false;
    }
    
    console.log(`[AUTH] Profile upserted successfully: ${normalizedEmail} (id: ${authUserId})`);
    return true;
    
  } catch (error) {
    console.error("[AUTH] Profile mirroring error:", error);
    return false;
  }
}

/**
 * Mirror user to Supabase Auth and get a JWT token.
 * This allows the frontend to call Supabase Edge Functions.
 * 
 * Flow:
 * 1. Check if user exists in Supabase Auth
 * 2. If not, create with admin API
 * 3. Sign in to get JWT
 * 
 * Uses a deterministic password based on email + secret to avoid storing passwords.
 */
export async function getSupabaseJWT(
  email: string,
  authUserId: string
): Promise<{ token: string; error?: string } | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
    console.log("[AUTH] Supabase not configured for JWT generation");
    return null;
  }
  
  const normalizedEmail = normalizeEmail(email);
  
  // Generate a deterministic password for this user
  // This allows us to sign in without storing the actual password
  const sessionSecret = process.env.SESSION_SECRET || "default-secret-change-me";
  const deterministicPassword = crypto
    .createHmac("sha256", sessionSecret)
    .update(`supabase-auth-${normalizedEmail}-${authUserId}`)
    .digest("hex");
  
  try {
    // Create admin client
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    
    // Check if user exists in Supabase Auth
    const { data: existingUsers, error: listError } = await adminClient.auth.admin.listUsers({
      page: 1,
      perPage: 1,
    });
    
    // Try to find user by email using admin API
    const { data: userData, error: getUserError } = await adminClient.auth.admin.getUserById(authUserId);
    
    let userId = userData?.user?.id;
    
    if (!userId || getUserError) {
      // User doesn't exist in Supabase Auth - create them
      console.log(`[AUTH] Creating Supabase Auth user for: ${normalizedEmail}`);
      
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        id: authUserId, // Use same UUID as mesh_users.auth_user_id
        email: normalizedEmail,
        password: deterministicPassword,
        email_confirm: true, // Auto-confirm email
        user_metadata: {
          source: "meshcentral",
        },
      });
      
      if (createError) {
        // If user already exists (by email), try to get their ID
        if (createError.message?.includes("already been registered")) {
          console.log(`[AUTH] User already exists in Auth, attempting sign in`);
        } else {
          console.error("[AUTH] Failed to create Supabase Auth user:", createError);
          return { token: "", error: createError.message };
        }
      } else {
        userId = newUser?.user?.id;
        console.log(`[AUTH] Created Supabase Auth user: ${userId}`);
      }
    }
    
    // Now sign in to get a JWT
    // Create a client with anon key for sign-in
    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    
    const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
      email: normalizedEmail,
      password: deterministicPassword,
    });
    
    if (signInError) {
      // If sign-in fails, the password might be wrong (user was created before our system)
      // Try to update the password and sign in again
      console.log(`[AUTH] Sign in failed, attempting password reset: ${signInError.message}`);
      
      if (userId) {
        const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, {
          password: deterministicPassword,
        });
        
        if (!updateError) {
          // Try sign in again
          const { data: retryData, error: retryError } = await anonClient.auth.signInWithPassword({
            email: normalizedEmail,
            password: deterministicPassword,
          });
          
          if (retryError) {
            console.error("[AUTH] Sign in retry failed:", retryError);
            return { token: "", error: retryError.message };
          }
          
          if (retryData?.session?.access_token) {
            console.log(`[AUTH] JWT obtained successfully after password reset`);
            return { token: retryData.session.access_token };
          }
        }
      }
      
      return { token: "", error: signInError.message };
    }
    
    if (!signInData?.session?.access_token) {
      console.error("[AUTH] Sign in succeeded but no access token");
      return { token: "", error: "No access token received" };
    }
    
    console.log(`[AUTH] JWT obtained successfully for: ${normalizedEmail}`);
    return { token: signInData.session.access_token };
    
  } catch (error) {
    console.error("[AUTH] Error getting Supabase JWT:", error);
    return { token: "", error: error instanceof Error ? error.message : "Unknown error" };
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
    // 2. Ensure user exists in Supabase mesh_users (with auth_user_id)
    const userData = await ensureSupabaseUser(email, domain);
    
    // 3. Mirror to profiles table (uses auth_user_id as profiles.id)
    if (userData?.auth_user_id) {
      const profileCreated = await ensureProfileExists(
        userData.auth_user_id,
        email
      );
      
      if (profileCreated) {
        console.log(`[AUTH] User fully mirrored: mesh_users.id=${userData.id}, profiles.id=${userData.auth_user_id}`);
      }
    }
    
    // Enrich session with user data if available
    if (userData) {
      authResult.session.userId = userData.id;
      authResult.session.userType = userData.user_type;
    }
    
    // 4. Set session cookie
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
