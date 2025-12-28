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
