/**
 * User Mirror Service
 * 
 * Handles syncing Auth0 users to Supabase mirror tables.
 */
import "server-only";
import { getSupabaseAdmin, type AppUser, type AppUserDomain } from "./supabase-admin";
import { type ParsedClaims, isSuperAdminMeshCentral, isSuperAdminRustDesk } from "./rbac";

type ValidDomain = "mesh" | "zonetech" | "zsangola";
type ValidRole = "DOMAIN_ADMIN" | "AGENT";

const VALID_DOMAINS: ValidDomain[] = ["mesh", "zonetech", "zsangola"];
const VALID_ROLES: ValidRole[] = ["DOMAIN_ADMIN", "AGENT"];

/**
 * Upserts a user into the app_users mirror table based on Auth0 claims.
 * Also syncs domain roles from claims.
 * 
 * @param auth0Sub - Auth0 user ID (sub claim)
 * @param claims - Parsed claims from Auth0 session
 * @param displayName - Optional display name
 * @returns The upserted user record
 */
export async function syncUserToMirror(
  auth0Sub: string,
  claims: ParsedClaims,
  displayName?: string | null
): Promise<AppUser> {
  const supabase = getSupabaseAdmin();

  // Prepare user data
  const userData = {
    auth0_user_id: auth0Sub,
    email: claims.email || "unknown@unknown.com",
    display_name: displayName || claims.email?.split("@")[0] || null,
    is_superadmin_meshcentral: isSuperAdminMeshCentral(claims),
    is_superadmin_rustdesk: isSuperAdminRustDesk(claims),
    updated_at: new Date().toISOString(),
    deleted_at: null, // Clear soft-delete on sync
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
    throw new Error(`Failed to sync user: ${userError.message}`);
  }

  // Sync domain roles
  await syncUserDomains(user.id, claims);

  return user as AppUser;
}

/**
 * Syncs user domain roles from Auth0 claims.
 * Removes roles not in claims, adds new ones.
 */
async function syncUserDomains(
  userId: string,
  claims: ParsedClaims
): Promise<void> {
  const supabase = getSupabaseAdmin();

  // Collect all domain roles from claims
  const domainRolesToSync: { domain: ValidDomain; role: ValidRole }[] = [];

  // Process org_roles from claims
  for (const [domain, roles] of Object.entries(claims.orgRoles)) {
    // Validate domain
    if (!VALID_DOMAINS.includes(domain as ValidDomain)) {
      continue;
    }

    for (const role of roles) {
      // Validate role
      if (!VALID_ROLES.includes(role as ValidRole)) {
        continue;
      }
      domainRolesToSync.push({ domain: domain as ValidDomain, role: role as ValidRole });
    }
  }

  // If user has a current org set, ensure at least AGENT role
  if (claims.org && VALID_DOMAINS.includes(claims.org as ValidDomain)) {
    const hasRoleForOrg = domainRolesToSync.some((dr) => dr.domain === claims.org);
    if (!hasRoleForOrg) {
      // User has org but no explicit roles - don't add anything
      // (they may just be viewing, not assigned)
    }
  }

  // Get current domain roles
  const { data: existingDomains, error: fetchError } = await supabase
    .from("app_user_domains")
    .select("*")
    .eq("user_id", userId);

  if (fetchError) {
    console.error("Error fetching existing domains:", fetchError);
    throw new Error(`Failed to fetch domains: ${fetchError.message}`);
  }

  // Find roles to delete (exist in DB but not in claims)
  const rolesToDelete = (existingDomains || []).filter(
    (existing) =>
      !domainRolesToSync.some(
        (sync) => sync.domain === existing.domain && sync.role === existing.role
      )
  );

  // Find roles to add (in claims but not in DB)
  const rolesToAdd = domainRolesToSync.filter(
    (sync) =>
      !(existingDomains || []).some(
        (existing) => existing.domain === sync.domain && existing.role === sync.role
      )
  );

  // Delete removed roles
  if (rolesToDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from("app_user_domains")
      .delete()
      .in(
        "id",
        rolesToDelete.map((r) => r.id)
      );

    if (deleteError) {
      console.error("Error deleting domain roles:", deleteError);
    }
  }

  // Add new roles
  if (rolesToAdd.length > 0) {
    const { error: insertError } = await supabase
      .from("app_user_domains")
      .insert(
        rolesToAdd.map((r) => ({
          user_id: userId,
          domain: r.domain,
          role: r.role,
        }))
      );

    if (insertError) {
      console.error("Error inserting domain roles:", insertError);
    }
  }
}

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
 * Creates or updates a user in the mirror directly (for admin-created users).
 * This is used when creating users via Auth0 Management API.
 * 
 * @param params - User creation parameters
 * @returns The created/updated user record
 */
export async function upsertMirrorUser(params: {
  auth0UserId: string;
  email: string;
  displayName?: string | null;
  isSuperAdminMeshCentral?: boolean;
  isSuperAdminRustDesk?: boolean;
  domain?: ValidDomain;
  role?: ValidRole;
}): Promise<AppUser> {
  const supabase = getSupabaseAdmin();

  // Prepare user data
  const userData = {
    auth0_user_id: params.auth0UserId,
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
 * Gets a mirror user by Auth0 user ID.
 */
export async function getMirrorUserByAuth0Id(auth0UserId: string): Promise<(AppUser & { domains: AppUserDomain[] }) | null> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("app_users")
    .select("*, app_user_domains(*)")
    .eq("auth0_user_id", auth0UserId)
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

/**
 * Full resync of a user from Auth0 data.
 * Updates all fields including superadmin flags and domain roles.
 */
export async function resyncMirrorUser(params: {
  auth0UserId: string;
  email: string;
  displayName?: string | null;
  isSuperAdminMeshCentral: boolean;
  isSuperAdminRustDesk: boolean;
  orgRoles: Record<string, string[]>;
  blocked: boolean;
}): Promise<AppUser & { domains: AppUserDomain[] }> {
  const supabase = getSupabaseAdmin();

  // Upsert user data
  const userData = {
    auth0_user_id: params.auth0UserId,
    email: params.email,
    display_name: params.displayName || params.email.split("@")[0],
    is_superadmin_meshcentral: params.isSuperAdminMeshCentral,
    is_superadmin_rustdesk: params.isSuperAdminRustDesk,
    updated_at: new Date().toISOString(),
    deleted_at: params.blocked ? new Date().toISOString() : null,
  };

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
    throw new Error(`Failed to resync user: ${userError.message}`);
  }

  // Delete all existing domain roles
  await supabase
    .from("app_user_domains")
    .delete()
    .eq("user_id", user.id);

  // Re-create domain roles from org_roles
  const domainRoles: { user_id: string; domain: ValidDomain; role: ValidRole }[] = [];
  
  for (const [domain, roles] of Object.entries(params.orgRoles)) {
    if (!VALID_DOMAINS.includes(domain as ValidDomain)) continue;
    
    for (const role of roles) {
      if (!VALID_ROLES.includes(role as ValidRole)) continue;
      domainRoles.push({
        user_id: user.id,
        domain: domain as ValidDomain,
        role: role as ValidRole,
      });
    }
  }

  if (domainRoles.length > 0) {
    const { error: insertError } = await supabase
      .from("app_user_domains")
      .insert(domainRoles);

    if (insertError) {
      console.error("Error inserting domain roles:", insertError);
    }
  }

  // Fetch updated user with domains
  return getMirrorUserByAuth0Id(params.auth0UserId) as Promise<AppUser & { domains: AppUserDomain[] }>;
}

