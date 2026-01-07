export interface GroupedDevice {
  id: string;
  device_id: string;
  friendly_name: string | null;
  group_name: string | null;
  subgroup_name: string | null;
  notes: string | null;
  last_seen_at: string | null;
  rustdesk_password: string | null;
  owner_email: string | null;

  owner: string | null;
  mesh_username: string | null;
  group_id: string | null;
  subgroup_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  from_provisioning_code?: boolean | null;
  is_online?: boolean;
  adopted?: boolean;
  observations?: string | null;
  device_info?: {
    ip?: string;
    os?: string;
  } | null;
}

/**
 * Backwards-compatible alias for legacy code that still imports GroupableDevice.
 */
export type GroupableDevice = GroupedDevice;

export interface SubgroupBucket {
  name: string | null;
  devices: GroupedDevice[];
}

export interface GroupBucket {
  name: string | null;
  subgroups: SubgroupBucket[];
}

export interface GroupingResult {
  groups: GroupBucket[];
}

function normalizeName(value: string | null): string {
  if (!value) return "";
  return value.toLocaleLowerCase("pt-PT");
}

function compareStrings(a: string | null, b: string | null): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na < nb) return -1;
  if (na > nb) return 1;
  return 0;
}

function compareDevicesByFriendlyName(a: GroupedDevice, b: GroupedDevice): number {
  const nameA =
    a.friendly_name && a.friendly_name.trim().length > 0 ? a.friendly_name : a.device_id;
  const nameB =
    b.friendly_name && b.friendly_name.trim().length > 0 ? b.friendly_name : b.device_id;
  return compareStrings(nameA, nameB);
}

export function groupDevices(devices: GroupedDevice[]): GroupingResult {
  const groupsMap = new Map<string | null, Map<string | null, GroupedDevice[]>>();

  for (const device of devices) {
    const groupKey = device.group_name ?? null;
    const subgroupKey = device.subgroup_name ?? null;

    if (!groupsMap.has(groupKey)) {
      groupsMap.set(groupKey, new Map<string | null, GroupedDevice[]>());
    }
    const subgroupMap = groupsMap.get(groupKey)!;

    if (!subgroupMap.has(subgroupKey)) {
      subgroupMap.set(subgroupKey, []);
    }
    const bucket = subgroupMap.get(subgroupKey)!;
    bucket.push(device);
  }

  const groups: GroupBucket[] = [];

  for (const [groupName, subgroupMap] of groupsMap.entries()) {
    const subgroups: SubgroupBucket[] = [];

    for (const [subgroupName, bucketDevices] of subgroupMap.entries()) {
      const sortedDevices = [...bucketDevices].sort(compareDevicesByFriendlyName);

      subgroups.push({
        name: subgroupName,
        devices: sortedDevices,
      });
    }

    const sortedSubgroups = subgroups.sort((a, b) => compareStrings(a.name, b.name));

    groups.push({
      name: groupName,
      subgroups: sortedSubgroups,
    });
  }

  const sortedGroups = groups.sort((a, b) => compareStrings(a.name, b.name));

  return {
    groups: sortedGroups,
  };
}

/**
 * Backwards-compatible helper for older tests that expected a function
 * called parseNotesToGrouping. It simply delegates to groupDevices,
 * which already returns a grouped and sorted structure.
 */
export function parseNotesToGrouping(devices: GroupedDevice[]): GroupingResult {
  return groupDevices(devices);
}