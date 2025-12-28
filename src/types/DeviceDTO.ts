/**
 * Device DTO - Frontend data transfer object
 * Maps from raw DB rows to a normalized shape for UI consumption
 */

export interface DeviceDTO {
  id: string;
  deviceId: string;
  friendlyName: string | null;
  groupId: string | null;
  groupName: string | null;
  subgroupId: string | null;
  subgroupName: string | null;
  notes: string | null;
  rustdeskPassword: string | null;
  owner: string | null;
  meshUsername: string | null;
  ownerEmail: string | null;
  lastSeenAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  fromProvisioningCode: boolean;
}

export interface DeviceGroupDTO {
  id: string;
  name: string;
  description: string | null;
  parentGroupId: string | null;
  path: string;
  level: number;
  deviceCount?: number;
}

export interface RegistrationSessionDTO {
  sessionId: string;
  expiresAt: string;
  expiresInSeconds: number;
}

export type FilterStatus = "all" | "adopted" | "unadopted";
export type SortOption = "date_desc" | "date_asc" | "name_asc" | "name_desc" | "id_asc" | "id_desc";

/**
 * Maps raw API device response to DeviceDTO
 */
export function mapToDeviceDTO(raw: Record<string, unknown>): DeviceDTO {
  return {
    id: String(raw.id ?? ""),
    deviceId: String(raw.device_id ?? ""),
    friendlyName: raw.friendly_name as string | null ?? null,
    groupId: raw.group_id as string | null ?? null,
    groupName: raw.group_name as string | null ?? null,
    subgroupId: raw.subgroup_id as string | null ?? null,
    subgroupName: raw.subgroup_name as string | null ?? null,
    notes: raw.notes as string | null ?? null,
    rustdeskPassword: raw.rustdesk_password as string | null ?? null,
    owner: raw.owner as string | null ?? null,
    meshUsername: raw.mesh_username as string | null ?? null,
    ownerEmail: raw.owner_email as string | null ?? null,
    lastSeenAt: raw.last_seen_at as string | null ?? null,
    createdAt: raw.created_at as string | null ?? null,
    updatedAt: raw.updated_at as string | null ?? null,
    fromProvisioningCode: Boolean(raw.from_provisioning_code),
  };
}

/**
 * Maps DeviceDTO back to the shape expected by the grouping library
 */
export function mapToGroupableDevice(dto: DeviceDTO): import("@/lib/grouping").GroupableDevice {
  return {
    id: dto.id,
    device_id: dto.deviceId,
    friendly_name: dto.friendlyName,
    group_id: dto.groupId,
    group_name: dto.groupName,
    subgroup_id: dto.subgroupId,
    subgroup_name: dto.subgroupName,
    notes: dto.notes,
    rustdesk_password: dto.rustdeskPassword,
    owner: dto.owner,
    mesh_username: dto.meshUsername,
    owner_email: dto.ownerEmail,
    last_seen_at: dto.lastSeenAt,
    created_at: dto.createdAt,
    updated_at: dto.updatedAt,
    from_provisioning_code: dto.fromProvisioningCode,
  };
}

/**
 * Maps raw API group response to DeviceGroupDTO
 */
export function mapToDeviceGroupDTO(raw: Record<string, unknown>): DeviceGroupDTO {
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    description: raw.description as string | null ?? null,
    parentGroupId: raw.parent_group_id as string | null ?? null,
    path: String(raw.path ?? ""),
    level: Number(raw.level ?? 0),
    deviceCount: typeof raw.device_count === "number" ? raw.device_count : undefined,
  };
}
