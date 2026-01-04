/**
 * Server-side Supabase Admin Client
 * 
 * Uses service role key for privileged operations.
 * MUST be server-only - never expose to browser.
 * 
 * IMPORTANT: Uses mesh_users table for user data (NOT app_users or profiles)
 */
import "server-only";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "";

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
 * User type hierarchy from schema
 */
export type UserType = 'siteadmin' | 'minisiteadmin' | 'agent' | 'colaborador' | 'inactivo' | 'candidato';

/**
 * Types for mesh_users table (main user table)
 */
export interface MeshUser {
  id: string;
  mesh_username: string;
  email: string | null;
  display_name: string | null;
  name: string | null;
  user_type: UserType;
  domain: string;
  agent_id: string;
  parent_agent_id: string | null;
  disabled: boolean;
  siteadmin: number;
  domainadmin: number;
  source: string;
  created_at: string;
  deleted_at: string | null;
}

/**
 * Types for mesh_groups table
 */
export interface MeshGroup {
  id: string;
  agent_id: string;
  owner_user_id: string;
  parent_group_id: string | null;
  name: string;
  description: string | null;
  path: string;
  level: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/**
 * Types for mesh_group_permissions table  
 */
export interface MeshGroupPermission {
  id: string;
  agent_id: string;
  collaborator_id: string;
  group_id: string;
  permission: 'view' | 'manage';
  granted_at: string;
  granted_by: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  notes: string | null;
  created_at: string;
}

/**
 * Combined user with groups for listing
 */
export interface MeshUserWithGroups extends MeshUser {
  groups?: MeshGroup[];
  permissions?: MeshGroupPermission[];
}
