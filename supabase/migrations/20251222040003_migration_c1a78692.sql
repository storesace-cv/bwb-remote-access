-- Step 1: Add columns to mesh_users (carefully, checking if they exist first)
ALTER TABLE mesh_users 
ADD COLUMN IF NOT EXISTS parent_agent_id UUID REFERENCES mesh_users(id) ON DELETE CASCADE;

ALTER TABLE mesh_users 
ADD COLUMN IF NOT EXISTS agent_id UUID;