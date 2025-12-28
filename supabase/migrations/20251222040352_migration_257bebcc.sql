-- Step 3: Create mesh_group_permissions table
CREATE TABLE IF NOT EXISTS mesh_group_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Core relationships
  agent_id UUID NOT NULL REFERENCES mesh_users(id) ON DELETE CASCADE,
  collaborator_id UUID NOT NULL REFERENCES mesh_users(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES mesh_groups(id) ON DELETE CASCADE,
  
  -- Permission type
  permission TEXT NOT NULL DEFAULT 'view' 
    CHECK (permission IN ('view', 'manage')),
  
  -- Audit trail
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by UUID REFERENCES mesh_users(id),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES mesh_users(id),
  
  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT unique_active_permission 
    UNIQUE (collaborator_id, group_id, revoked_at)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_mesh_group_permissions_agent_id ON mesh_group_permissions(agent_id);
CREATE INDEX IF NOT EXISTS idx_mesh_group_permissions_collaborator_id ON mesh_group_permissions(collaborator_id);
CREATE INDEX IF NOT EXISTS idx_mesh_group_permissions_group_id ON mesh_group_permissions(group_id);
CREATE INDEX IF NOT EXISTS idx_mesh_group_permissions_active 
  ON mesh_group_permissions(collaborator_id, group_id) 
  WHERE revoked_at IS NULL;