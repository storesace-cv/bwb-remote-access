/**
 * API Route: POST /api/admin/mesh/sync
 * 
 * Syncs MeshCentral inventory to Supabase mirror.
 * Requires admin access (SuperAdmin or Domain Admin).
 */

import { NextResponse } from "next/server";
import { checkAdminAccess } from "@/lib/require-admin";
import { isMeshCentralDbAvailable, getMeshCentralDbPath } from "@/lib/meshcentral-db";
import { syncMeshcentralInventoryToSupabase } from "@/lib/meshcentral-mirror";

export async function POST() {
  try {
    // Check admin access
    const { authorized } = await checkAdminAccess();
    if (!authorized) {
      return NextResponse.json(
        { error: "Unauthorized - admin access required" },
        { status: 403 }
      );
    }

    // Check if MeshCentral DB is available
    if (!isMeshCentralDbAvailable()) {
      const dbPath = getMeshCentralDbPath();
      return NextResponse.json(
        {
          error: "MeshCentral database not available",
          details: dbPath
            ? `Database file not found at: ${dbPath}`
            : "MESHCENTRAL_DB_PATH environment variable is not set",
        },
        { status: 503 }
      );
    }

    // Execute sync
    const result = await syncMeshcentralInventoryToSupabase();

    return NextResponse.json({
      success: result.success,
      message: result.success ? "Sync completed successfully" : "Sync completed with errors",
      counters: {
        totalRecordsScanned: result.counters.totalRecords,
        groupsExtracted: result.counters.groupsExtracted,
        devicesExtracted: result.counters.devicesExtracted,
        skippedUnknown: result.counters.skippedUnknown,
        upsertedGroups: result.upsertedGroups,
        upsertedDevices: result.upsertedDevices,
      },
      errors: result.errors.length > 0 ? result.errors.slice(0, 10) : undefined,
    });

  } catch (error) {
    console.error("Error in /api/admin/mesh/sync:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
