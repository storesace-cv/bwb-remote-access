/**
 * MeshCentral Database Reader
 * 
 * Server-side only - reads MeshCentral SQLite database.
 * 
 * Environment variables required:
 *   - MESHCENTRAL_DB_PATH: Path to meshcentral.db file
 * 
 * MeshCentral ID patterns:
 *   - Device groups: mesh/<domain>/<id>
 *   - Devices: node/<domain>/<id>
 *   - Users: user/<domain>/<email>
 */
import "server-only";
import Database from "better-sqlite3";

const MESHCENTRAL_DB_PATH = process.env.MESHCENTRAL_DB_PATH || "";

type ValidDomain = "mesh" | "zonetech" | "zsangola";
const VALID_DOMAINS: ValidDomain[] = ["mesh", "zonetech", "zsangola"];

export interface MeshDeviceGroup {
  domain: ValidDomain;
  mesh_id: string;
  name: string | null;
}

export interface MeshDevice {
  domain: ValidDomain;
  node_id: string;
  mesh_id: string | null;
  hostname: string | null;
  os_description: string | null;
  agent_version: string | null;
  ip_local: string | null;
  ip_public: string | null;
  last_connect: Date | null;
}

export interface SyncCounters {
  totalRecords: number;
  groupsExtracted: number;
  devicesExtracted: number;
  skippedUnknown: number;
  errors: string[];
}

/**
 * Parses domain from MeshCentral ID.
 * Expected patterns: mesh/<domain>/..., node/<domain>/...
 */
function parseDomain(id: string): ValidDomain | null {
  const parts = id.split("/");
  if (parts.length < 2) return null;
  
  const domain = parts[1];
  if (VALID_DOMAINS.includes(domain as ValidDomain)) {
    return domain as ValidDomain;
  }
  return null;
}

/**
 * Checks if MeshCentral DB is available.
 */
export function isMeshCentralDbAvailable(): boolean {
  if (!MESHCENTRAL_DB_PATH) {
    return false;
  }
  try {
    const fs = require("fs");
    return fs.existsSync(MESHCENTRAL_DB_PATH);
  } catch {
    return false;
  }
}

/**
 * Gets the configured MeshCentral DB path.
 */
export function getMeshCentralDbPath(): string {
  return MESHCENTRAL_DB_PATH;
}

/**
 * Reads device groups from MeshCentral DB.
 */
export function readDeviceGroups(): { groups: MeshDeviceGroup[]; counters: Partial<SyncCounters> } {
  if (!MESHCENTRAL_DB_PATH) {
    throw new Error("MESHCENTRAL_DB_PATH environment variable is not set");
  }

  const groups: MeshDeviceGroup[] = [];
  const counters: Partial<SyncCounters> = {
    totalRecords: 0,
    groupsExtracted: 0,
    skippedUnknown: 0,
    errors: [],
  };

  let db: Database.Database | null = null;
  try {
    db = new Database(MESHCENTRAL_DB_PATH, { readonly: true });
    
    // MeshCentral stores documents in a table with _id and doc columns
    // Device groups have _id starting with "mesh/"
    const rows = db.prepare(`
      SELECT _id, doc FROM main WHERE _id LIKE 'mesh/%'
    `).all() as { _id: string; doc: string }[];

    counters.totalRecords = rows.length;

    for (const row of rows) {
      try {
        const domain = parseDomain(row._id);
        if (!domain) {
          counters.skippedUnknown = (counters.skippedUnknown || 0) + 1;
          continue;
        }

        const doc = JSON.parse(row.doc);
        groups.push({
          domain,
          mesh_id: row._id,
          name: doc.name || doc.desc || null,
        });
        counters.groupsExtracted = (counters.groupsExtracted || 0) + 1;
      } catch (err) {
        counters.errors?.push(`Error parsing group ${row._id}: ${err}`);
      }
    }
  } finally {
    db?.close();
  }

  return { groups, counters };
}

/**
 * Reads devices from MeshCentral DB.
 */
export function readDevices(): { devices: MeshDevice[]; counters: Partial<SyncCounters> } {
  if (!MESHCENTRAL_DB_PATH) {
    throw new Error("MESHCENTRAL_DB_PATH environment variable is not set");
  }

  const devices: MeshDevice[] = [];
  const counters: Partial<SyncCounters> = {
    totalRecords: 0,
    devicesExtracted: 0,
    skippedUnknown: 0,
    errors: [],
  };

  let db: Database.Database | null = null;
  try {
    db = new Database(MESHCENTRAL_DB_PATH, { readonly: true });
    
    // Devices have _id starting with "node/"
    const rows = db.prepare(`
      SELECT _id, doc FROM main WHERE _id LIKE 'node/%'
    `).all() as { _id: string; doc: string }[];

    counters.totalRecords = rows.length;

    for (const row of rows) {
      try {
        const domain = parseDomain(row._id);
        if (!domain) {
          counters.skippedUnknown = (counters.skippedUnknown || 0) + 1;
          continue;
        }

        const doc = JSON.parse(row.doc);
        
        // Extract last connect time
        let lastConnect: Date | null = null;
        if (doc.lastconnect) {
          lastConnect = new Date(doc.lastconnect);
        } else if (doc.lc) {
          lastConnect = new Date(doc.lc);
        }

        // Extract IP addresses
        let ipLocal: string | null = null;
        let ipPublic: string | null = null;
        if (doc.ip) {
          ipPublic = doc.ip;
        }
        if (doc.inaddr) {
          ipLocal = doc.inaddr;
        }

        devices.push({
          domain,
          node_id: row._id,
          mesh_id: doc.meshid || null,
          hostname: doc.name || doc.host || null,
          os_description: doc.osdesc || doc.os || null,
          agent_version: doc.agentversion || doc.agentvers || null,
          ip_local: ipLocal,
          ip_public: ipPublic,
          last_connect: lastConnect,
        });
        counters.devicesExtracted = (counters.devicesExtracted || 0) + 1;
      } catch (err) {
        counters.errors?.push(`Error parsing device ${row._id}: ${err}`);
      }
    }
  } finally {
    db?.close();
  }

  return { devices, counters };
}

/**
 * Reads all inventory (groups + devices) from MeshCentral DB.
 */
export function readInventory(): {
  groups: MeshDeviceGroup[];
  devices: MeshDevice[];
  counters: SyncCounters;
} {
  const groupResult = readDeviceGroups();
  const deviceResult = readDevices();

  const counters: SyncCounters = {
    totalRecords: (groupResult.counters.totalRecords || 0) + (deviceResult.counters.totalRecords || 0),
    groupsExtracted: groupResult.counters.groupsExtracted || 0,
    devicesExtracted: deviceResult.counters.devicesExtracted || 0,
    skippedUnknown: (groupResult.counters.skippedUnknown || 0) + (deviceResult.counters.skippedUnknown || 0),
    errors: [...(groupResult.counters.errors || []), ...(deviceResult.counters.errors || [])],
  };

  return {
    groups: groupResult.groups,
    devices: deviceResult.devices,
    counters,
  };
}
