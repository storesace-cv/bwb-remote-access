-- Performance Optimization Migration
-- Adding missing columns and indexes for android_devices table

-- Add missing columns to android_devices
ALTER TABLE android_devices 
ADD COLUMN IF NOT EXISTS mesh_username TEXT,
ADD COLUMN IF NOT EXISTS friendly_name TEXT,
ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

-- Create indexes for frequently queried columns
CREATE INDEX IF NOT EXISTS idx_android_devices_owner 
  ON android_devices(owner) 
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_android_devices_deleted_at 
  ON android_devices(deleted_at);

CREATE INDEX IF NOT EXISTS idx_android_devices_mesh_username 
  ON android_devices(mesh_username) 
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_android_devices_last_seen 
  ON android_devices(last_seen_at DESC) 
  WHERE deleted_at IS NULL;

-- Composite index for common query pattern (owner + deleted_at)
CREATE INDEX IF NOT EXISTS idx_android_devices_owner_deleted 
  ON android_devices(owner, deleted_at);

-- Index for device_id lookups with deleted_at filter
CREATE INDEX IF NOT EXISTS idx_android_devices_device_deleted 
  ON android_devices(device_id, deleted_at);

-- Add index on mesh_users.auth_user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_mesh_users_auth_user_id 
  ON mesh_users(auth_user_id) 
  WHERE auth_user_id IS NOT NULL;

-- Add comment explaining the optimization
COMMENT ON INDEX idx_android_devices_owner IS 'Optimizes queries filtering by owner with soft-delete check';
COMMENT ON INDEX idx_android_devices_owner_deleted IS 'Composite index for owner + deleted_at queries';
COMMENT ON INDEX idx_android_devices_device_deleted IS 'Optimizes device_id lookups with soft-delete filter';