/**
 * MeshUser DTO - Frontend data transfer object
 */

export interface MeshUserDTO {
  id: string;
  meshUsername: string | null;
  displayName: string | null;
  email: string | null;
  userType: string | null;
  domain: string | null;
  authUserId: string | null;
}

export interface UserProfileDTO {
  authUserId: string;
  isAgent: boolean;
  isMinisiteadmin: boolean;
  isSiteadmin: boolean;
  domain: string;
  displayName: string;
}

/**
 * Maps raw API mesh user response to MeshUserDTO
 */
export function mapToMeshUserDTO(raw: Record<string, unknown>): MeshUserDTO {
  return {
    id: String(raw.id ?? ""),
    meshUsername: raw.mesh_username as string | null ?? null,
    displayName: raw.display_name as string | null ?? null,
    email: raw.email as string | null ?? null,
    userType: raw.user_type as string | null ?? null,
    domain: raw.domain as string | null ?? null,
    authUserId: raw.auth_user_id as string | null ?? null,
  };
}
