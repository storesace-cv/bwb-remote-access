/**
 * Serviço centralizado para gestão de permissões baseadas na tabela roles
 * Todas as verificações de permissões devem usar este serviço
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export interface RolePermissions {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  hierarchy_level: number;
  can_access_management_panel: boolean;
  can_access_user_profile: boolean;
  can_scan_qr: boolean;
  can_provision_without_qr: boolean;
  can_view_devices: boolean;
  can_adopt_devices: boolean;
  can_edit_devices: boolean;
  can_delete_devices: boolean;
  can_view_users: boolean;
  can_create_users: boolean;
  can_edit_users: boolean;
  can_delete_users: boolean;
  can_change_user_role: boolean;
  can_view_groups: boolean;
  can_create_groups: boolean;
  can_edit_groups: boolean;
  can_delete_groups: boolean;
  can_assign_permissions: boolean;
  can_access_all_domains: boolean;
  can_access_own_domain_only: boolean;
  can_manage_roles: boolean;
  can_view_audit_logs: boolean;
  can_access_meshcentral: boolean;
}

export interface UserPermissionContext {
  userType: string;
  permissions: RolePermissions | null;
  hierarchyLevel: number;
  domain: string | null;
}

/**
 * Obtém as permissões do role a partir do nome
 */
export async function getRolePermissions(
  roleName: string,
  jwt: string
): Promise<RolePermissions | null> {
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/roles?select=*&name=eq.${encodeURIComponent(roleName)}`,
      {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${jwt}`,
        },
      }
    );

    if (!res.ok) {
      console.error("[PermissionsService] Error fetching role:", res.status);
      return null;
    }

    const data = await res.json() as RolePermissions[];
    return data.length > 0 ? data[0] : null;
  } catch (error) {
    console.error("[PermissionsService] Exception:", error);
    return null;
  }
}

/**
 * Obtém todas as roles ordenadas por hierarquia
 */
export async function getAllRoles(jwt: string): Promise<RolePermissions[]> {
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/roles?select=*&order=hierarchy_level.asc`,
      {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${jwt}`,
        },
      }
    );

    if (!res.ok) {
      console.error("[PermissionsService] Error fetching roles:", res.status);
      return [];
    }

    return await res.json() as RolePermissions[];
  } catch (error) {
    console.error("[PermissionsService] Exception:", error);
    return [];
  }
}

/**
 * Obtém o contexto completo de permissões do utilizador actual
 */
export async function getCurrentUserPermissions(
  jwt: string
): Promise<UserPermissionContext | null> {
  try {
    // Decodificar JWT para obter auth_user_id
    const parts = jwt.split(".");
    if (parts.length < 2) return null;

    const payloadJson = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(payloadJson) as { sub?: string };
    
    if (!payload.sub) return null;

    // Buscar user_type e domain do mesh_users
    const userRes = await fetch(
      `${supabaseUrl}/rest/v1/mesh_users?select=user_type,domain&auth_user_id=eq.${payload.sub}`,
      {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${jwt}`,
        },
      }
    );

    if (!userRes.ok) return null;

    const userData = await userRes.json() as Array<{ user_type?: string; domain?: string }>;
    if (!userData.length || !userData[0].user_type) return null;

    const userType = userData[0].user_type;
    const domain = userData[0].domain ?? null;

    // Buscar permissões do role
    const permissions = await getRolePermissions(userType, jwt);

    return {
      userType,
      permissions,
      hierarchyLevel: permissions?.hierarchy_level ?? 999,
      domain,
    };
  } catch (error) {
    console.error("[PermissionsService] Exception getting user permissions:", error);
    return null;
  }
}

/**
 * Obtém roles que o utilizador pode atribuir (níveis inferiores ao seu)
 */
export async function getAssignableRoles(
  jwt: string,
  currentHierarchyLevel: number
): Promise<RolePermissions[]> {
  const allRoles = await getAllRoles(jwt);
  // Pode atribuir roles com hierarchy_level MAIOR (menor privilégio)
  return allRoles.filter(role => role.hierarchy_level > currentHierarchyLevel);
}

/**
 * Verifica se utilizador A pode ver/gerir utilizador B
 * Baseado na hierarquia: só pode ver/gerir utilizadores com hierarchy_level MAIOR
 */
export function canManageUser(
  managerHierarchyLevel: number,
  targetHierarchyLevel: number
): boolean {
  return targetHierarchyLevel > managerHierarchyLevel;
}

/**
 * Verifica uma permissão específica
 */
export function hasPermission(
  permissions: RolePermissions | null,
  permissionKey: keyof RolePermissions
): boolean {
  if (!permissions) return false;
  const value = permissions[permissionKey];
  return typeof value === "boolean" ? value : false;
}
