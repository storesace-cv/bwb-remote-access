/**
 * User Mirror Service
 * 
 * Handles user data in Supabase mesh_users table.
 * No longer depends on Auth0 - works with MeshCentral sessions.
 * 
 * IMPORTANT: Uses public.mesh_users table (the actual schema)
 */
import "server-only";
import { getSupabaseAdmin, type MeshUser, type UserType } from "./supabase-admin";

type ValidDomain = "mesh" | "zonetech" | "zsangola";

const VALID_DOMAINS: ValidDomain[] = ["mesh", "zonetech", "zsangola"];

/**
 * Validates that a domain is one of the allowed domains.
 * Guards against invalid domain values being written to the database.
 */
function isValidDomain(domain: string): domain is ValidDomain {
  return VALID_DOMAINS.includes(domain as ValidDomain);
}

/**
 * Lists users from mesh_users table with optional domain filter.
 */
export async function listMirrorUsers(options: {
  domain?: ValidDomain | null;
  limit?: number;
  offset?: number;
  includeDeleted?: boolean;
}): Promise<{ users: MeshUser[]; total: number }> {
  const supabase = getSupabaseAdmin();
  const { domain, limit = 50, offset = 0, includeDeleted = false } = options;

  let query = supabase
    .from("mesh_users")
    .select("*", { count: "exact" });

  // Filter by domain if specified
  if (domain) {
    query = query.eq("domain", domain);
  }

  // Exclude soft-deleted unless requested
  if (!includeDeleted) {
    query = query.is("deleted_at", null);
  }

  // Add pagination and ordering
  query = query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error("Error listing users:", error);
    throw new Error(`Failed to list users: ${error.message}`);
  }

  return { users: (data || []) as MeshUser[], total: count || 0 };
}

/**
 * Gets a user by ID from mesh_users table.
 */
export async function getMirrorUserById(userId: string): Promise<MeshUser | null> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("mesh_users")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    console.error("Error getting user:", error);
    throw new Error(`Failed to get user: ${error.message}`);
  }

  return data as MeshUser;
}

/**
 * Gets a user by email (mesh_username) from mesh_users table.
 */
export async function getMirrorUserByEmail(email: string, domain?: ValidDomain): Promise<MeshUser | null> {
  const supabase = getSupabaseAdmin();
  const normalizedEmail = email.toLowerCase().trim();

  let query = supabase
    .from("mesh_users")
    .select("*")
    .eq("mesh_username", normalizedEmail);

  if (domain) {
    query = query.eq("domain", domain);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error("Error getting user by email:", error);
    throw new Error(`Failed to get user: ${error.message}`);
  }

  return data as MeshUser | null;
}

/**
 * Updates user_type for a user.
 */
export async function setUserType(
  userId: string,
  userType: UserType
): Promise<MeshUser> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("mesh_users")
    .update({ user_type: userType })
    .eq("id", userId)
    .select()
    .single();

  if (error) {
    console.error("Error updating user type:", error);
    throw new Error(`Failed to update user: ${error.message}`);
  }

  return data as MeshUser;
}

/**
 * Soft-deletes a user by setting deleted_at.
 */
export async function setMirrorUserDeleted(
  userId: string,
  deleted: boolean
): Promise<MeshUser> {
  const supabase = getSupabaseAdmin();

  const updateData = deleted 
    ? { deleted_at: new Date().toISOString(), user_type: 'inactivo' as UserType }
    : { deleted_at: null };

  const { data, error } = await supabase
    .from("mesh_users")
    .update(updateData)
    .eq("id", userId)
    .select()
    .single();

  if (error) {
    console.error("Error setting user deleted status:", error);
    throw new Error(`Failed to update user: ${error.message}`);
  }

  return data as MeshUser;
}

/**
 * Creates or updates a user in mesh_users.
 * Username MUST equal email.
 */
export async function upsertMirrorUser(params: {
  email: string;
  displayName?: string | null;
  domain: ValidDomain;
  userType?: UserType;
  agentId: string;
}): Promise<MeshUser> {
  const supabase = getSupabaseAdmin();
  const normalizedEmail = params.email.toLowerCase().trim();

  // Check if user exists
  const { data: existing } = await supabase
    .from("mesh_users")
    .select("id")
    .eq("mesh_username", normalizedEmail)
    .maybeSingle();

  if (existing) {
    // Update existing user
    const { data, error } = await supabase
      .from("mesh_users")
      .update({
        email: normalizedEmail,
        display_name: params.displayName || normalizedEmail.split("@")[0],
        user_type: params.userType || "candidato",
        deleted_at: null,
      })
      .eq("id", existing.id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update user: ${error.message}`);
    }

    return data as MeshUser;
  }

  // Create new user
  const { data, error } = await supabase
    .from("mesh_users")
    .insert({
      mesh_username: normalizedEmail,
      email: normalizedEmail,
      display_name: params.displayName || normalizedEmail.split("@")[0],
      domain: params.domain,
      user_type: params.userType || "candidato",
      agent_id: params.agentId,
      source: "meshcentral",
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create user: ${error.message}`);
  }

  return data as MeshUser;
}

// ============================================================================
// Legacy compatibility exports (for gradual migration)
// ============================================================================

// Re-export types with legacy names for backward compatibility
export type { MeshUser as AppUser };
export interface AppUserDomain {
  id: string;
  user_id: string;
  domain: ValidDomain;
  role: string;
  created_at: string;
}

// Map old function names if needed
export const setUserDomainRole = setUserType;
