/**
 * MeshCentral Mirror Service
 * 
 * Syncs MeshCentral inventory to Supabase tables.
 */
import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import { readInventory, type SyncCounters } from "./meshcentral-db";

type ValidDomain = "mesh" | "zonetech" | "zsangola";

export interface SyncResult {
  success: boolean;
  counters: SyncCounters;
  upsertedGroups: number;
  upsertedDevices: number;
  errors: string[];
}

/**
 * Syncs MeshCentral inventory to Supabase mirror tables.
 */
export async function syncMeshcentralInventoryToSupabase(): Promise<SyncResult> {
  const supabase = getSupabaseAdmin();
  const errors: string[] = [];
  let upsertedGroups = 0;
  let upsertedDevices = 0;

  // Read inventory from MeshCentral DB
  const { groups, devices, counters } = readInventory();

  // Upsert device groups
  if (groups.length > 0) {
    const groupRecords = groups.map((g) => ({
      domain: g.domain,
      mesh_id: g.mesh_id,
      name: g.name,
      updated_at: new Date().toISOString(),
    }));

    // Batch upsert in chunks of 100
    const chunkSize = 100;
    for (let i = 0; i < groupRecords.length; i += chunkSize) {
      const chunk = groupRecords.slice(i, i + chunkSize);
      const { error } = await supabase
        .from("mesh_device_groups")
        .upsert(chunk, {
          onConflict: "mesh_id",
          ignoreDuplicates: false,
        });

      if (error) {
        errors.push(`Error upserting groups chunk ${i}: ${error.message}`);
      } else {
        upsertedGroups += chunk.length;
      }
    }
  }

  // Upsert devices
  if (devices.length > 0) {
    const deviceRecords = devices.map((d) => ({
      domain: d.domain,
      node_id: d.node_id,
      mesh_id: d.mesh_id,
      hostname: d.hostname,
      os_description: d.os_description,
      agent_version: d.agent_version,
      ip_local: d.ip_local,
      ip_public: d.ip_public,
      last_connect: d.last_connect?.toISOString() || null,
      updated_at: new Date().toISOString(),
      deleted_at: null, // Clear soft-delete on sync
    }));

    // Batch upsert in chunks of 100
    const chunkSize = 100;
    for (let i = 0; i < deviceRecords.length; i += chunkSize) {
      const chunk = deviceRecords.slice(i, i + chunkSize);
      const { error } = await supabase
        .from("mesh_devices")
        .upsert(chunk, {
          onConflict: "node_id",
          ignoreDuplicates: false,
        });

      if (error) {
        errors.push(`Error upserting devices chunk ${i}: ${error.message}`);
      } else {
        upsertedDevices += chunk.length;
      }
    }
  }

  return {
    success: errors.length === 0,
    counters,
    upsertedGroups,
    upsertedDevices,
    errors: [...counters.errors, ...errors],
  };
}

/**
 * Lists device groups from Supabase mirror.
 */
export async function listMeshGroups(options: {
  domain?: ValidDomain | null;
}): Promise<{ groups: { id: string; domain: string; mesh_id: string; name: string | null }[] }> {
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("mesh_device_groups")
    .select("id, domain, mesh_id, name")
    .order("name", { ascending: true });

  if (options.domain) {
    query = query.eq("domain", options.domain);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error listing mesh groups:", error);
    throw new Error(`Failed to list groups: ${error.message}`);
  }

  return { groups: data || [] };
}

/**
 * Lists devices from Supabase mirror.
 */
export async function listMeshDevices(options: {
  domain?: ValidDomain | null;
  meshId?: string | null;
  includeDeleted?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{
  devices: {
    id: string;
    domain: string;
    node_id: string;
    mesh_id: string | null;
    hostname: string | null;
    os_description: string | null;
    agent_version: string | null;
    ip_local: string | null;
    ip_public: string | null;
    last_connect: string | null;
    deleted_at: string | null;
    group_name: string | null;
  }[];
  total: number;
}> {
  const supabase = getSupabaseAdmin();
  const { domain, meshId, includeDeleted = false, limit = 50, offset = 0 } = options;

  // First, get groups for name lookup
  const { data: groups } = await supabase
    .from("mesh_device_groups")
    .select("mesh_id, name");

  const groupNameMap = new Map<string, string>();
  (groups || []).forEach((g) => {
    if (g.mesh_id && g.name) {
      groupNameMap.set(g.mesh_id, g.name);
    }
  });

  // Build devices query
  let query = supabase
    .from("mesh_devices")
    .select("*", { count: "exact" });

  if (domain) {
    query = query.eq("domain", domain);
  }

  if (meshId) {
    query = query.eq("mesh_id", meshId);
  }

  if (!includeDeleted) {
    query = query.is("deleted_at", null);
  }

  query = query
    .order("hostname", { ascending: true })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error("Error listing mesh devices:", error);
    throw new Error(`Failed to list devices: ${error.message}`);
  }

  // Add group names to devices
  const devices = (data || []).map((d) => ({
    ...d,
    group_name: d.mesh_id ? groupNameMap.get(d.mesh_id) || null : null,
  }));

  return { devices, total: count || 0 };
}
