-- Step 2: Create mesh_groups table
CREATE TABLE IF NOT EXISTS mesh_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Ownership and hierarchy
  agent_id UUID NOT NULL REFERENCES mesh_users(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES mesh_users(id) ON DELETE CASCADE,
  parent_group_id UUID REFERENCES mesh_groups(id) ON DELETE CASCADE,
  
  -- Group metadata
  name TEXT NOT NULL,
  description TEXT,
  path TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  
  -- Constraints
  CONSTRAINT unique_group_name_per_agent_parent 
    UNIQUE (agent_id, parent_group_id, name, deleted_at)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_mesh_groups_agent_id ON mesh_groups(agent_id);
CREATE INDEX IF NOT EXISTS idx_mesh_groups_owner_user_id ON mesh_groups(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_mesh_groups_parent_group_id ON mesh_groups(parent_group_id);
CREATE INDEX IF NOT EXISTS idx_mesh_groups_deleted_at ON mesh_groups(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mesh_groups_path ON mesh_groups(path);

-- Add comments
COMMENT ON TABLE mesh_groups IS 'Hierarchical groups for organizing devices. Supports nested subgroups.';
COMMENT ON COLUMN mesh_groups.agent_id IS 'The agent who owns this group tenant';
COMMENT ON COLUMN mesh_groups.path IS 'Computed full path for display (e.g., "Company / Dept / Team")';