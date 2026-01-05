/**
 * RBAC (Role-Based Access Control) System
 * 
 * Sistema de permissões granulares baseado em roles/perfis.
 * Cada role tem permissões específicas que controlam o acesso a funcionalidades.
 */

// =============================================================================
// TIPOS
// =============================================================================

export interface Role {
  id: string;
  name: RoleName;
  display_name: string;
  description: string;
  hierarchy_level: number; // 0=siteadmin (topo), 4=inactivo (fundo)
  
  // Permissões de Acesso a Painéis
  can_access_management_panel: boolean;
  can_access_user_profile: boolean;
  
  // Permissões de Dispositivos
  can_scan_qr: boolean;
  can_provision_without_qr: boolean;
  can_view_devices: boolean;
  can_adopt_devices: boolean;
  can_edit_devices: boolean;
  can_delete_devices: boolean;
  
  // Permissões de Utilizadores
  can_view_users: boolean;
  can_create_users: boolean;
  can_edit_users: boolean;
  can_delete_users: boolean;
  can_change_user_role: boolean;
  
  // Permissões de Grupos
  can_view_groups: boolean;
  can_create_groups: boolean;
  can_edit_groups: boolean;
  can_delete_groups: boolean;
  can_assign_permissions: boolean;
  
  // Permissões de Domínio
  can_access_all_domains: boolean;
  can_access_own_domain_only: boolean;
  
  // Permissões Especiais
  can_manage_roles: boolean;
  can_view_audit_logs: boolean;
}

export type RoleName = 'siteadmin' | 'minisiteadmin' | 'agent' | 'colaborador' | 'inactivo';

export type PermissionKey = 
  | 'can_access_management_panel'
  | 'can_access_user_profile'
  | 'can_scan_qr'
  | 'can_provision_without_qr'
  | 'can_view_devices'
  | 'can_adopt_devices'
  | 'can_edit_devices'
  | 'can_delete_devices'
  | 'can_view_users'
  | 'can_create_users'
  | 'can_edit_users'
  | 'can_delete_users'
  | 'can_change_user_role'
  | 'can_view_groups'
  | 'can_create_groups'
  | 'can_edit_groups'
  | 'can_delete_groups'
  | 'can_assign_permissions'
  | 'can_access_all_domains'
  | 'can_access_own_domain_only'
  | 'can_manage_roles'
  | 'can_view_audit_logs';

export interface UserWithRole {
  id: string;
  mesh_username: string;
  email: string | null;
  full_name: string | null;
  display_name: string | null;
  domain: string;
  auth_user_id: string | null;
  role_id: string;
  role: Role | null;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// CONSTANTES
// =============================================================================

export const ROLE_IDS: Record<RoleName, string> = {
  siteadmin: 'a0000000-0000-0000-0000-000000000001',
  minisiteadmin: 'a0000000-0000-0000-0000-000000000002',
  agent: 'a0000000-0000-0000-0000-000000000003',
  colaborador: 'a0000000-0000-0000-0000-000000000004',
  inactivo: 'a0000000-0000-0000-0000-000000000005',
};

export const ROLE_HIERARCHY: Record<RoleName, number> = {
  siteadmin: 0,
  minisiteadmin: 1,
  agent: 2,
  colaborador: 3,
  inactivo: 4,
};

export const ROLE_DISPLAY_NAMES: Record<RoleName, string> = {
  siteadmin: 'Site Admin',
  minisiteadmin: 'Mini Site Admin',
  agent: 'Agent',
  colaborador: 'Colaborador',
  inactivo: 'Inactivo',
};

export const ROLE_COLORS: Record<RoleName, { bg: string; text: string; border: string }> = {
  siteadmin: { bg: 'bg-red-600/20', text: 'text-red-400', border: 'border-red-600' },
  minisiteadmin: { bg: 'bg-orange-600/20', text: 'text-orange-400', border: 'border-orange-600' },
  agent: { bg: 'bg-emerald-600/20', text: 'text-emerald-400', border: 'border-emerald-600' },
  colaborador: { bg: 'bg-blue-600/20', text: 'text-blue-400', border: 'border-blue-600' },
  inactivo: { bg: 'bg-slate-600/20', text: 'text-slate-400', border: 'border-slate-600' },
};

// =============================================================================
// FUNÇÕES DE VERIFICAÇÃO DE PERMISSÕES
// =============================================================================

/**
 * Verifica se um role tem uma permissão específica
 */
export function hasPermission(role: Role | null, permission: PermissionKey): boolean {
  if (!role) return false;
  return role[permission] === true;
}

/**
 * Verifica se um utilizador pode gerir outro baseado na hierarquia
 * Um utilizador só pode gerir utilizadores com nível INFERIOR (número maior)
 */
export function canManageUser(
  managerRole: Role | null,
  targetRole: Role | null
): boolean {
  if (!managerRole || !targetRole) return false;
  return managerRole.hierarchy_level < targetRole.hierarchy_level;
}

/**
 * Verifica se um utilizador pode atribuir um determinado role
 * Só pode atribuir roles com nível INFERIOR ao seu
 */
export function canAssignRole(
  managerRole: Role | null,
  targetRoleName: RoleName
): boolean {
  if (!managerRole) return false;
  const targetLevel = ROLE_HIERARCHY[targetRoleName];
  return managerRole.hierarchy_level < targetLevel;
}

/**
 * Retorna lista de roles que um utilizador pode atribuir a outros
 */
export function getAssignableRoles(managerRole: Role | null): RoleName[] {
  if (!managerRole) return [];
  
  const assignable: RoleName[] = [];
  const roleNames: RoleName[] = ['siteadmin', 'minisiteadmin', 'agent', 'colaborador', 'inactivo'];
  
  for (const roleName of roleNames) {
    if (ROLE_HIERARCHY[roleName] > managerRole.hierarchy_level) {
      assignable.push(roleName);
    }
  }
  
  return assignable;
}

/**
 * Verifica se um utilizador pode ver outro utilizador na lista de gestão
 * Baseado em hierarquia e domínio
 */
export function canViewUser(
  managerRole: Role | null,
  managerDomain: string,
  targetRole: Role | null,
  targetDomain: string
): boolean {
  if (!managerRole || !targetRole) return false;
  
  // Só pode ver utilizadores com nível INFERIOR
  if (managerRole.hierarchy_level >= targetRole.hierarchy_level) {
    return false;
  }
  
  // Se tem acesso a todos os domínios, pode ver qualquer um
  if (managerRole.can_access_all_domains) {
    return true;
  }
  
  // Caso contrário, só pode ver do mesmo domínio
  return managerDomain === targetDomain;
}

/**
 * Obtém o nome do role a partir do ID
 */
export function getRoleNameById(roleId: string): RoleName | null {
  for (const [name, id] of Object.entries(ROLE_IDS)) {
    if (id === roleId) {
      return name as RoleName;
    }
  }
  return null;
}

/**
 * Obtém a cor do badge baseado no role
 */
export function getRoleBadgeClasses(roleName: RoleName | null): string {
  if (!roleName || !ROLE_COLORS[roleName]) {
    return 'bg-slate-600/20 text-slate-400';
  }
  const colors = ROLE_COLORS[roleName];
  return `${colors.bg} ${colors.text}`;
}

// =============================================================================
// DEFAULTS
// =============================================================================

export const DEFAULT_ROLE: RoleName = 'colaborador';
export const DEFAULT_ROLE_ID = ROLE_IDS.colaborador;
