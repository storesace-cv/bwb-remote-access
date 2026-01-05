-- =============================================================================
-- Migration: MeshCentral Device Mirror Tables
-- Purpose: Mirror MeshCentral device groups and devices to Supabase for fast listing
-- Created: 2025-12-28
-- =============================================================================

-- Table: mesh_device_groups - Device groups from MeshCentral
CREATE TABLE IF NOT EXISTS mesh_device_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain TEXT NOT NULL CHECK (domain IN ('mesh', 'zonetech', 'zsangola')),
    mesh_id TEXT UNIQUE NOT NULL,  -- Original MeshCentral mesh/_id
    name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for mesh_device_groups
CREATE UNIQUE INDEX IF NOT EXISTS idx_mesh_device_groups_mesh_id ON mesh_device_groups(mesh_id);
CREATE INDEX IF NOT EXISTS idx_mesh_device_groups_domain ON mesh_device_groups(domain);

-- Table: mesh_devices - Devices from MeshCentral
CREATE TABLE IF NOT EXISTS mesh_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain TEXT NOT NULL CHECK (domain IN ('mesh', 'zonetech', 'zsangola')),
    node_id TEXT UNIQUE NOT NULL,  -- Original MeshCentral node/_id
    mesh_id TEXT,                   -- Links to mesh_device_groups.mesh_id
    hostname TEXT,
    os_description TEXT,
    agent_version TEXT,
    ip_local TEXT,
    ip_public TEXT,
    last_connect TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- Indexes for mesh_devices
CREATE UNIQUE INDEX IF NOT EXISTS idx_mesh_devices_node_id ON mesh_devices(node_id);
CREATE INDEX IF NOT EXISTS idx_mesh_devices_domain ON mesh_devices(domain);
CREATE INDEX IF NOT EXISTS idx_mesh_devices_mesh_id ON mesh_devices(mesh_id);
CREATE INDEX IF NOT EXISTS idx_mesh_devices_deleted_at ON mesh_devices(deleted_at);

-- Trigger to auto-update updated_at on mesh_device_groups
CREATE OR REPLACE FUNCTION update_mesh_device_groups_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_mesh_device_groups_updated_at ON mesh_device_groups;
CREATE TRIGGER trigger_update_mesh_device_groups_updated_at
    BEFORE UPDATE ON mesh_device_groups
    FOR EACH ROW
    EXECUTE FUNCTION update_mesh_device_groups_updated_at();

-- Trigger to auto-update updated_at on mesh_devices
CREATE OR REPLACE FUNCTION update_mesh_devices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_mesh_devices_updated_at ON mesh_devices;
CREATE TRIGGER trigger_update_mesh_devices_updated_at
    BEFORE UPDATE ON mesh_devices
    FOR EACH ROW
    EXECUTE FUNCTION update_mesh_devices_updated_at();

-- Note: RLS is disabled for these tables.
-- Access is controlled server-side using service role key.

COMMENT ON TABLE mesh_device_groups IS 'Mirror of MeshCentral device groups for fast listing';
COMMENT ON TABLE mesh_devices IS 'Mirror of MeshCentral devices for fast listing';
