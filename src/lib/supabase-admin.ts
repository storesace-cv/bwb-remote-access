/**
 * Server-side Supabase Admin Client
 * 
 * Uses service role key for privileged operations.
 * MUST be server-only - never expose to browser.
 * 
 * Environment variables required:
 *   - SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)
 *   - SUPABASE_SERVICE_ROLE_KEY
 */
import "server-only";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Get Supabase URL from env (prefer non-public, fallback to public)
const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "";

// Service role key for admin operations
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

let adminClient: SupabaseClient | null = null;

/**
 * Get the Supabase admin client (singleton).
 * Throws if environment variables are not configured.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) {
    return adminClient;
  }

  if (!SUPABASE_URL) {
    throw new Error(
      "SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL environment variable is not set"
    );
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY environment variable is not set"
    );
  }

  adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return adminClient;
}

/**
 * Types for app_users table
 */
export interface AppUser {
  id: string;
  auth0_user_id: string;
  email: string;
  display_name: string | null;
  is_superadmin_meshcentral: boolean;
  is_superadmin_rustdesk: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/**
 * Types for app_user_domains table
 */
export interface AppUserDomain {
  id: string;
  user_id: string;
  domain: "mesh" | "zonetech" | "zsangola";
  role: "DOMAIN_ADMIN" | "AGENT";
  created_at: string;
}

/**
 * Combined user with domains for listing
 */
export interface AppUserWithDomains extends AppUser {
  domains: AppUserDomain[];
}
