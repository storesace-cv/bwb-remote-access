/**
 * User Mirror Service
 * 
 * Handles user data in Supabase mirror tables.
 * No longer depends on Auth0 - works with MeshCentral sessions.
 */
import "server-only";
import { getSupabaseAdmin, type AppUser, type AppUserDomain } from "./supabase-admin";

type ValidDomain = "mesh" | "zonetech" | "zsangola";
type ValidRole = "DOMAIN_ADMIN" | "AGENT" | "USER";

const VALID_DOMAINS: ValidDomain[] = ["mesh", "zonetech", "zsangola"];
const VALID_ROLES: ValidRole[] = ["DOMAIN_ADMIN", "AGENT", "USER"];

/**
 * Lists users from the mirror with their domains.
 * 
 * @param options - Filter and pagination options
 * @returns List of users with their domain roles
 */
export async function listMirrorUsers(options: {
  domain?: ValidDomain | null;
  limit?: number;
  offset?: number;
  includeDeleted?: boolean;
}): Promise<{ users: (AppUser & { domains: AppUserDomain[] })[]; total: number }> {
  const supabase = getSupabaseAdmin();
  const { domain, limit = 50, offset = 0, includeDeleted = false } = options;

  // Build query for users
  let query = supabase
    .from("app_users")
    .select("*, app_user_domains(*)", { count: "exact" });

  // Filter by domain if specified
  if (domain) {
    // Get user IDs that have this domain
    const { data: domainUsers } = await supabase
      .from("app_user_domains")
      .select("user_id")
      .eq("domain", domain);

    const userIds = (domainUsers || []).map((d) => d.user_id);
    if (userIds.length === 0) {
      return { users: [], total: 0 };
    }
    query = query.in("id", userIds);
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

  // Transform data to expected format
  const users = (data || []).map((user) => ({
    ...user,
    domains: user.app_user_domains || [],
  })) as (AppUser & { domains: AppUserDomain[] })[];

  return { users, total: count || 0 };
}

/**
 * Creates or updates a user in the mirror.
 * 
 * @param params - User creation parameters
 * @returns The created/updated user record
 */
export async function upsertMirrorUser(params: {
  auth0UserId?: string;  // Optional now, can use email as identifier
  email: string;
  displayName?: string | null;
  isSuperAdminMeshCentral?: boolean;
  isSuperAdminRustDesk?: boolean;
  domain?: ValidDomain;
  role?: ValidRole;
}): Promise<AppUser> {
  const supabase = getSupabaseAdmin();

  // Use email as the primary identifier if no auth0UserId
  const userId = params.auth0UserId || `mesh_${params.email.replace(/[^a-zA-Z0-9]/g, '_')}`;

  // Prepare user data
  const userData = {
    auth0_user_id: userId,
    email: params.email,
    display_name: params.displayName || params.email.split("@")[0],
    is_superadmin_meshcentral: params.isSuperAdminMeshCentral || false,
    is_superadmin_rustdesk: params.isSuperAdminRustDesk || false,
    updated_at: new Date().toISOString(),
    deleted_at: null,
  };

  // Upsert user
  const { data: user, error: userError } = await supabase
    .from("app_users")
    .upsert(userData, {
      onConflict: "auth0_user_id",
      ignoreDuplicates: false,
    })
    .select()
    .single();

  if (userError) {
    console.error("Error upserting app_user:", userError);
    throw new Error(`Failed to create/update mirror user: ${userError.message}`);
  }

  // Add domain role if specified
  if (params.domain && params.role) {
    await upsertUserDomainRole(user.id, params.domain, params.role);
  }

  return user as AppUser;
}

/**
 * Adds or updates a domain role for a user.
 */
export async function upsertUserDomainRole(
  userId: string,
  domain: ValidDomain,
  role: ValidRole
): Promise<void> {
  const supabase = getSupabaseAdmin();

  // For DOMAIN_ADMIN, also add AGENT role
  const rolesToAdd: ValidRole[] = role === "DOMAIN_ADMIN" 
    ? ["DOMAIN_ADMIN", "AGENT"] 
    : [role];

  for (const r of rolesToAdd) {
    const { error } = await supabase
      .from("app_user_domains")
      .upsert(
        { user_id: userId, domain, role: r },
        { onConflict: "user_id,domain,role", ignoreDuplicates: true }
      );

    if (error && !error.message.includes("duplicate")) {
      console.error(`Error adding domain role ${domain}:${r}:`, error);
    }
  }
}

/**
 * Sets the user role for a specific domain.
 * Removes old roles for that domain and sets the new one.
 */
export async function setUserDomainRole(
  userId: string,
  domain: ValidDomain,
  role: ValidRole
): Promise<void> {
  const supabase = getSupabaseAdmin();

  // First, delete all existing roles for this user in this domain
  const { error: deleteError } = await supabase
    .from("app_user_domains")
    .delete()
    .eq("user_id", userId)
    .eq("domain", domain);

  if (deleteError) {
    console.error(`Error deleting domain roles for ${domain}:`, deleteError);
  }

  // Then add the new role(s)
  await upsertUserDomainRole(userId, domain, role);
}

/**
 * Gets a mirror user by internal ID.
 */
export async function getMirrorUserById(userId: string): Promise<(AppUser & { domains: AppUserDomain[] }) | null> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("app_users")
    .select("*, app_user_domains(*)")
    .eq("id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // Not found
    console.error("Error getting mirror user:", error);
    throw new Error(`Failed to get mirror user: ${error.message}`);
  }

  return {
    ...data,
    domains: data.app_user_domains || [],
  } as AppUser & { domains: AppUserDomain[] };
}

/**
 * Gets a mirror user by email and domain.
 */
export async function getMirrorUserByEmail(email: string, domain?: ValidDomain): Promise<(AppUser & { domains: AppUserDomain[] }) | null> {
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("app_users")
    .select("*, app_user_domains(*)")
    .eq("email", email.toLowerCase());

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error("Error getting mirror user:", error);
    throw new Error(`Failed to get mirror user: ${error.message}`);
  }

  if (!data) return null;

  return {
    ...data,
    domains: data.app_user_domains || [],
  } as AppUser & { domains: AppUserDomain[] };
}

/**
 * Sets the deleted_at (soft delete) for a user.
 */
export async function setMirrorUserDeleted(
  userId: string,
  deleted: boolean
): Promise<AppUser> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("app_users")
    .update({
      deleted_at: deleted ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .select()
    .single();

  if (error) {
    console.error("Error setting user deleted status:", error);
    throw new Error(`Failed to update user: ${error.message}`);
  }

  return data as AppUser;
}
