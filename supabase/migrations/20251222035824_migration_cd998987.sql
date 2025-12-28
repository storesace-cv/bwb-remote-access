-- ADAPTED MIGRATION: Create mesh_groups infrastructure
-- Based on 20251221005500 but adapted for current DB state
-- Part 1: Add missing columns to mesh_users

-- Add parent_agent_id and agent_id columns (user_type already exists)
ALTER TABLE mesh_users 
ADD COLUMN IF NOT EXISTS parent_agent_id UUID REFERENCES mesh_users(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS agent_id UUID;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_mesh_users_parent_agent_id ON mesh_users(parent_agent_id);
CREATE INDEX IF NOT EXISTS idx_mesh_users_agent_id ON mesh_users(agent_id);
CREATE INDEX IF NOT EXISTS idx_mesh_users_user_type ON mesh_users(user_type);