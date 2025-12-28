"use client";

import { useState, useCallback, useEffect } from "react";
import { callEdgeFunction, callRestApi, getStoredToken, decodeJwtSubject, clearToken } from "@/lib/apiClient";
import type { GroupableDevice } from "@/lib/grouping";
import type { DeviceGroupDTO, FilterStatus, SortOption } from "@/types/DeviceDTO";

const CANONICAL_ADMIN_ID = "9ebfa3dd-392c-489d-882f-8a1762cb36e8";

interface UseDevicesResult {
  // Data
  devices: GroupableDevice[];
  groups: DeviceGroupDTO[];
  
  // Loading states
  loading: boolean;
  groupsLoading: boolean;
  refreshing: boolean;
  
  // Errors
  errorMsg: string | null;
  refreshError: string | null;
  
  // Actions
  fetchDevices: () => Promise<void>;
  fetchGroups: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  deleteDevice: (device: GroupableDevice) => Promise<boolean>;
  adminDeleteDevice: (device: GroupableDevice) => Promise<boolean>;
  
  // Filtering and sorting
  filterStatus: FilterStatus;
  setFilterStatus: (status: FilterStatus) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  sortBy: SortOption;
  setSortBy: (option: SortOption) => void;
  
  // Computed
  filteredDevices: GroupableDevice[];
  adoptedDevices: GroupableDevice[];
  unadoptedDevices: GroupableDevice[];
}

export function useDevices(): UseDevicesResult {
  const [devices, setDevices] = useState<GroupableDevice[]>([]);
  const [groups, setGroups] = useState<DeviceGroupDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("date_desc");

  const isDeviceAdopted = useCallback((device: GroupableDevice): boolean => {
    return device.owner !== null && device.notes !== null && device.notes.trim().length > 0;
  }, []);

  const fetchDevices = useCallback(async (): Promise<void> => {
    const jwt = getStoredToken();
    if (!jwt) return;

    setLoading(true);
    setErrorMsg(null);

    const result = await callEdgeFunction<GroupableDevice[] | { devices: GroupableDevice[] }>("get-devices");

    if (!result.ok) {
      setErrorMsg(result.error?.message ?? "Failed to load devices.");
      setDevices([]);
    } else {
      let devicesList: GroupableDevice[] = [];
      if (Array.isArray(result.data)) {
        devicesList = result.data;
      } else if (result.data && Array.isArray(result.data.devices)) {
        devicesList = result.data.devices;
      }
      setDevices(devicesList);
    }

    setLoading(false);
  }, []);

  const fetchGroups = useCallback(async (): Promise<void> => {
    const jwt = getStoredToken();
    if (!jwt) return;

    setGroupsLoading(true);

    const result = await callEdgeFunction<{ groups?: Array<Record<string, unknown>> }>("admin-list-groups");

    if (result.ok && result.data?.groups) {
      const mapped: DeviceGroupDTO[] = result.data.groups.map((g) => ({
        id: String(g.id ?? ""),
        name: String(g.name ?? ""),
        description: g.description as string | null ?? null,
        parentGroupId: g.parent_group_id as string | null ?? null,
        path: String(g.path ?? ""),
        level: Number(g.level ?? 0),
        deviceCount: typeof g.device_count === "number" ? g.device_count : undefined,
      }));
      setGroups(mapped);
    }

    setGroupsLoading(false);
  }, []);

  const refreshStatus = useCallback(async (): Promise<void> => {
    const jwt = getStoredToken();
    if (!jwt) return;

    setRefreshError(null);
    setRefreshing(true);

    try {
      const response = await fetch("/api/devices/refresh", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      });

      let json: { message?: string; error?: string } | null = null;
      try {
        json = await response.json();
      } catch {
        json = null;
      }

      if (!response.ok) {
        const message =
          json?.message ??
          (json?.error === "sync_api_not_configured"
            ? "On-demand sync with RustDesk is not configured."
            : "Failed to sync with RustDesk.");
        setRefreshError(message);
      } else {
        await fetchDevices();
      }
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : "Unexpected error syncing with RustDesk.");
    } finally {
      setRefreshing(false);
    }
  }, [fetchDevices]);

  const deleteDevice = useCallback(async (device: GroupableDevice): Promise<boolean> => {
    const jwt = getStoredToken();
    if (!jwt) return false;

    const confirmed = window.confirm(`Are you sure you want to delete device ${device.device_id}?`);
    if (!confirmed) return false;

    const result = await callEdgeFunction("remove-device", {
      method: "DELETE",
      body: { device_id: device.device_id },
    });

    if (!result.ok) {
      setErrorMsg(result.error?.message ?? "Failed to delete device.");
      return false;
    }

    await fetchDevices();
    return true;
  }, [fetchDevices]);

  const adminDeleteDevice = useCallback(async (device: GroupableDevice): Promise<boolean> => {
    const jwt = getStoredToken();
    if (!jwt) return false;

    const confirmed = window.confirm(`Are you sure you want to delete device ${device.device_id}?`);
    if (!confirmed) return false;

    const result = await callEdgeFunction("admin-delete-device", {
      method: "POST",
      body: { device_id: device.device_id },
    });

    if (!result.ok) {
      setErrorMsg(result.error?.message ?? "Failed to delete device.");
      return false;
    }

    await fetchDevices();
    return true;
  }, [fetchDevices]);

  // Filter and sort devices
  const getFilteredAndSortedDevices = useCallback(() => {
    let filtered = [...devices];

    if (filterStatus === "adopted") {
      filtered = filtered.filter((d) => isDeviceAdopted(d));
    } else if (filterStatus === "unadopted") {
      filtered = filtered.filter((d) => !isDeviceAdopted(d));
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (d) =>
          d.device_id.toLowerCase().includes(query) ||
          d.notes?.toLowerCase().includes(query) ||
          d.friendly_name?.toLowerCase().includes(query)
      );
    }

    filtered.sort((a, b) => {
      switch (sortBy) {
        case "date_desc":
          return (
            new Date(b.last_seen_at || b.created_at || 0).getTime() -
            new Date(a.last_seen_at || a.created_at || 0).getTime()
          );
        case "date_asc":
          return (
            new Date(a.last_seen_at || a.created_at || 0).getTime() -
            new Date(b.last_seen_at || b.created_at || 0).getTime()
          );
        case "name_asc":
          return (a.friendly_name || a.device_id).localeCompare(b.friendly_name || b.device_id);
        case "name_desc":
          return (b.friendly_name || b.device_id).localeCompare(a.friendly_name || a.device_id);
        case "id_asc":
          return a.device_id.localeCompare(b.device_id);
        case "id_desc":
          return b.device_id.localeCompare(a.device_id);
        default:
          return 0;
      }
    });

    return filtered;
  }, [devices, filterStatus, searchQuery, sortBy, isDeviceAdopted]);

  const filteredDevices = getFilteredAndSortedDevices();
  const adoptedDevices = filteredDevices.filter((d) => isDeviceAdopted(d));
  const unadoptedDevices = filteredDevices.filter((d) => !isDeviceAdopted(d));

  return {
    devices,
    groups,
    loading,
    groupsLoading,
    refreshing,
    errorMsg,
    refreshError,
    fetchDevices,
    fetchGroups,
    refreshStatus,
    deleteDevice,
    adminDeleteDevice,
    filterStatus,
    setFilterStatus,
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    filteredDevices,
    adoptedDevices,
    unadoptedDevices,
  };
}
