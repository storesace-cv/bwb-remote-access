-- Step 4: Add agent_id and group_id to android_devices
ALTER TABLE android_devices 
ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES mesh_users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES mesh_groups(id) ON DELETE SET NULL;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_android_devices_agent_id ON android_devices(agent_id);
CREATE INDEX IF NOT EXISTS idx_android_devices_group_id ON android_devices(group_id);