-- Agent-Collaborator Model Migration
-- Source of Truth: docs/sot/rustdesk-agent-collaborator-model.md
-- 
-- This migration implements:
-- 1. User type differentiation (agent vs collaborator)
-- 2. Hierarchical group structure
-- 3. Group-based permissions
-- 4. Agent supervisory access
-- 5. Strict tenant isolation

-- =====================================================
-- STEP 1: Extend mesh_users for Agent-Collaborator Model
-- =====================================================

-- Add user_type and parent_agent_id columns
ALTER TABLE mesh_users 
ADD COLUMN IF NOT EXISTS user_type TEXT NOT NULL DEFAULT 'agent' 
  CHECK (user_type IN ('agent', 'collaborator')),
ADD COLUMN IF NOT EXISTS parent_agent_id UUID REFERENCES mesh_users(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS agent_id UUID; -- Denormalized for performance

-- Create index for hierarchy queries
CREATE INDEX IF NOT EXISTS idx_mesh_users_parent_agent_id ON mesh_users(parent_agent_id);
CREATE INDEX IF NOT EXISTS idx_mesh_users_agent_id ON mesh_users(agent_id);
CREATE INDEX IF NOT EXISTS idx_mesh_users_user_type ON mesh_users(user_type);

-- Add constraint: collaborators must have parent_agent_id
ALTER TABLE mesh_users 
ADD CONSTRAINT check_collaborator_has_parent 
CHECK (
  (user_type = 'agent' AND parent_agent_id IS NULL) OR
  (user_type = 'collaborator' AND parent_agent_id IS NOT NULL)
);

-- Add constraint: parent must be an agent
CREATE OR REPLACE FUNCTION validate_parent_is_agent()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_agent_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM mesh_users 
      WHERE id = NEW.parent_agent_id AND user_type = 'agent'
    ) THEN
      RAISE EXCEPTION 'parent_agent_id must reference an agent user';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_parent_agent_trigger
BEFORE INSERT OR UPDATE ON mesh_users
FOR EACH ROW
EXECUTE FUNCTION validate_parent_is_agent();

-- Set agent_id for all users (self-referencing for agents, parent for collaborators)
UPDATE mesh_users 
SET agent_id = CASE 
  WHEN user_type = 'agent' THEN id 
  WHEN user_type = 'collaborator' THEN parent_agent_id 
  ELSE id 
END
WHERE agent_id IS NULL;

-- Make agent_id non-nullable after population
ALTER TABLE mesh_users ALTER COLUMN agent_id SET NOT NULL;

-- =====================================================
-- STEP 2: Create mesh_groups Table
-- =====================================================

CREATE TABLE IF NOT EXISTS mesh_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Ownership and hierarchy
  agent_id UUID NOT NULL REFERENCES mesh_users(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES mesh_users(id) ON DELETE CASCADE,
  parent_group_id UUID REFERENCES mesh_groups(id) ON DELETE CASCADE,
  
  -- Group metadata
  name TEXT NOT NULL,
  description TEXT,
  path TEXT NOT NULL, -- Computed path for UI (e.g., "Company / Department / Team")
  level INTEGER NOT NULL DEFAULT 0, -- 0=root, 1=subgroup, 2=sub-subgroup, etc.
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  
  -- Constraints
  CONSTRAINT unique_group_name_per_agent_parent 
    UNIQUE (agent_id, parent_group_id, name, deleted_at),
  CONSTRAINT check_owner_belongs_to_agent 
    CHECK (agent_id IS NOT NULL)
);

-- Indexes for performance
CREATE INDEX idx_mesh_groups_agent_id ON mesh_groups(agent_id);
CREATE INDEX idx_mesh_groups_owner_user_id ON mesh_groups(owner_user_id);
CREATE INDEX idx_mesh_groups_parent_group_id ON mesh_groups(parent_group_id);
CREATE INDEX idx_mesh_groups_deleted_at ON mesh_groups(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_mesh_groups_path ON mesh_groups(path);

-- Trigger to update updated_at
CREATE TRIGGER update_mesh_groups_updated_at
BEFORE UPDATE ON mesh_groups
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Function to compute group path
CREATE OR REPLACE FUNCTION compute_group_path(group_id UUID)
RETURNS TEXT AS $$
DECLARE
  path_parts TEXT[] := ARRAY[]::TEXT[];
  current_id UUID := group_id;
  current_name TEXT;
  current_parent UUID;
  max_depth INTEGER := 10;
  depth INTEGER := 0;
BEGIN
  WHILE current_id IS NOT NULL AND depth < max_depth LOOP
    SELECT name, parent_group_id INTO current_name, current_parent
    FROM mesh_groups WHERE id = current_id;
    
    IF current_name IS NULL THEN
      EXIT;
    END IF;
    
    path_parts := array_prepend(current_name, path_parts);
    current_id := current_parent;
    depth := depth + 1;
  END LOOP;
  
  RETURN array_to_string(path_parts, ' / ');
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update path and level
CREATE OR REPLACE FUNCTION update_group_path_and_level()
RETURNS TRIGGER AS $$
BEGIN
  NEW.path := compute_group_path(NEW.id);
  
  -- Compute level
  IF NEW.parent_group_id IS NULL THEN
    NEW.level := 0;
  ELSE
    SELECT level + 1 INTO NEW.level
    FROM mesh_groups WHERE id = NEW.parent_group_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_group_metadata_trigger
BEFORE INSERT OR UPDATE ON mesh_groups
FOR EACH ROW
EXECUTE FUNCTION update_group_path_and_level();

-- =====================================================
-- STEP 3: Create mesh_group_permissions Table
-- =====================================================

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
    UNIQUE (collaborator_id, group_id, revoked_at),
  CONSTRAINT check_collaborator_is_collaborator 
    CHECK (collaborator_id IS NOT NULL)
);

-- Indexes
CREATE INDEX idx_mesh_group_permissions_agent_id ON mesh_group_permissions(agent_id);
CREATE INDEX idx_mesh_group_permissions_collaborator_id ON mesh_group_permissions(collaborator_id);
CREATE INDEX idx_mesh_group_permissions_group_id ON mesh_group_permissions(group_id);
CREATE INDEX idx_mesh_group_permissions_active 
  ON mesh_group_permissions(collaborator_id, group_id) 
  WHERE revoked_at IS NULL;

-- Validation: collaborator must belong to the agent
CREATE OR REPLACE FUNCTION validate_permission_hierarchy()
RETURNS TRIGGER AS $$
BEGIN
  -- Ensure collaborator belongs to agent
  IF NOT EXISTS (
    SELECT 1 FROM mesh_users 
    WHERE id = NEW.collaborator_id 
      AND parent_agent_id = NEW.agent_id 
      AND user_type = 'collaborator'
  ) THEN
    RAISE EXCEPTION 'Collaborator must belong to the specified agent';
  END IF;
  
  -- Ensure group belongs to agent
  IF NOT EXISTS (
    SELECT 1 FROM mesh_groups 
    WHERE id = NEW.group_id AND agent_id = NEW.agent_id
  ) THEN
    RAISE EXCEPTION 'Group must belong to the specified agent';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_permission_hierarchy_trigger
BEFORE INSERT OR UPDATE ON mesh_group_permissions
FOR EACH ROW
EXECUTE FUNCTION validate_permission_hierarchy();

-- =====================================================
-- STEP 4: Extend android_devices for Group Assignment
-- =====================================================

ALTER TABLE android_devices 
ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES mesh_users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES mesh_groups(id) ON DELETE SET NULL;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_android_devices_agent_id ON android_devices(agent_id);
CREATE INDEX IF NOT EXISTS idx_android_devices_group_id ON android_devices(group_id);

-- Populate agent_id from owner
UPDATE android_devices 
SET agent_id = (
  SELECT agent_id FROM mesh_users WHERE id = android_devices.owner
)
WHERE owner IS NOT NULL AND agent_id IS NULL;

-- =====================================================
-- STEP 5: Data Migration - Parse notes into groups
-- =====================================================

-- Function to migrate devices to groups based on notes field
CREATE OR REPLACE FUNCTION migrate_notes_to_groups()
RETURNS TABLE(devices_migrated INTEGER, groups_created INTEGER) AS $$
DECLARE
  device_record RECORD;
  group_name TEXT;
  subgroup_name TEXT;
  parent_group_id UUID;
  subgroup_id UUID;
  devices_count INTEGER := 0;
  groups_count INTEGER := 0;
  parts TEXT[];
BEGIN
  -- Process each device with notes
  FOR device_record IN 
    SELECT id, owner, agent_id, notes 
    FROM android_devices 
    WHERE notes IS NOT NULL 
      AND notes != '' 
      AND group_id IS NULL
  LOOP
    -- Parse "Group | Subgroup" format
    parts := string_to_array(device_record.notes, '|');
    
    IF array_length(parts, 1) >= 1 THEN
      group_name := trim(parts[1]);
      
      -- Create or get root group
      SELECT id INTO parent_group_id
      FROM mesh_groups
      WHERE agent_id = device_record.agent_id
        AND parent_group_id IS NULL
        AND name = group_name
        AND deleted_at IS NULL
      LIMIT 1;
      
      IF parent_group_id IS NULL THEN
        INSERT INTO mesh_groups (agent_id, owner_user_id, name, parent_group_id, level)
        VALUES (device_record.agent_id, device_record.owner, group_name, NULL, 0)
        RETURNING id INTO parent_group_id;
        groups_count := groups_count + 1;
      END IF;
      
      -- Handle subgroup if present
      IF array_length(parts, 1) >= 2 THEN
        subgroup_name := trim(parts[2]);
        
        IF subgroup_name != '' THEN
          -- Create or get subgroup
          SELECT id INTO subgroup_id
          FROM mesh_groups
          WHERE agent_id = device_record.agent_id
            AND parent_group_id = parent_group_id
            AND name = subgroup_name
            AND deleted_at IS NULL
          LIMIT 1;
          
          IF subgroup_id IS NULL THEN
            INSERT INTO mesh_groups (agent_id, owner_user_id, name, parent_group_id, level)
            VALUES (device_record.agent_id, device_record.owner, subgroup_name, parent_group_id, 1)
            RETURNING id INTO subgroup_id;
            groups_count := groups_count + 1;
          END IF;
          
          -- Assign device to subgroup
          UPDATE android_devices 
          SET group_id = subgroup_id 
          WHERE id = device_record.id;
          devices_count := devices_count + 1;
        ELSE
          -- Assign to parent group only
          UPDATE android_devices 
          SET group_id = parent_group_id 
          WHERE id = device_record.id;
          devices_count := devices_count + 1;
        END IF;
      ELSE
        -- Assign to parent group only
        UPDATE android_devices 
        SET group_id = parent_group_id 
        WHERE id = device_record.id;
        devices_count := devices_count + 1;
      END IF;
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT devices_count, groups_count;
END;
$$ LANGUAGE plpgsql;

-- Execute migration (commented out for safety - run manually)
-- SELECT * FROM migrate_notes_to_groups();

-- =====================================================
-- STEP 6: Helper Functions for Visibility
-- =====================================================

-- Check if user can view a group
CREATE OR REPLACE FUNCTION can_view_group(
  user_id UUID,
  target_group_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  user_record RECORD;
  is_visible BOOLEAN := false;
BEGIN
  SELECT user_type, agent_id, parent_agent_id INTO user_record
  FROM mesh_users WHERE id = user_id;
  
  IF user_record.user_type = 'agent' THEN
    -- Agents see all groups in their tenant
    SELECT EXISTS(
      SELECT 1 FROM mesh_groups 
      WHERE id = target_group_id AND agent_id = user_record.agent_id
    ) INTO is_visible;
  ELSE
    -- Collaborators see:
    -- 1. Groups they own
    -- 2. Groups with active permissions
    SELECT EXISTS(
      SELECT 1 FROM mesh_groups 
      WHERE id = target_group_id 
        AND agent_id = user_record.agent_id
        AND (
          owner_user_id = user_id
          OR EXISTS (
            SELECT 1 FROM mesh_group_permissions
            WHERE collaborator_id = user_id
              AND group_id = target_group_id
              AND revoked_at IS NULL
          )
        )
    ) INTO is_visible;
  END IF;
  
  RETURN is_visible;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get all groups visible to a user
CREATE OR REPLACE FUNCTION get_visible_groups(user_id UUID)
RETURNS TABLE(group_id UUID) AS $$
DECLARE
  user_record RECORD;
BEGIN
  SELECT user_type, agent_id INTO user_record
  FROM mesh_users WHERE id = user_id;
  
  IF user_record.user_type = 'agent' THEN
    -- Agents see all groups in their tenant
    RETURN QUERY
    SELECT id FROM mesh_groups 
    WHERE agent_id = user_record.agent_id 
      AND deleted_at IS NULL;
  ELSE
    -- Collaborators see owned + permitted groups
    RETURN QUERY
    SELECT DISTINCT g.id
    FROM mesh_groups g
    WHERE g.agent_id = user_record.agent_id
      AND g.deleted_at IS NULL
      AND (
        g.owner_user_id = user_id
        OR EXISTS (
          SELECT 1 FROM mesh_group_permissions p
          WHERE p.collaborator_id = user_id
            AND p.group_id = g.id
            AND p.revoked_at IS NULL
        )
      );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- STEP 7: Update RLS Policies
-- =====================================================

-- Drop existing policies to recreate them
DROP POLICY IF EXISTS "Users can view own mesh_user" ON mesh_users;
DROP POLICY IF EXISTS "Users can view own devices" ON android_devices;
DROP POLICY IF EXISTS "Users can insert own devices" ON android_devices;
DROP POLICY IF EXISTS "Users can update own devices" ON android_devices;
DROP POLICY IF EXISTS "Users can delete own devices" ON android_devices;

-- mesh_users RLS policies
CREATE POLICY "agents_view_own_tenant"
ON mesh_users FOR SELECT
USING (
  agent_id = (SELECT agent_id FROM mesh_users WHERE auth_user_id = auth.uid())
);

CREATE POLICY "collaborators_view_restricted"
ON mesh_users FOR SELECT
USING (
  -- Collaborators see themselves and their parent agent
  auth.uid() = auth_user_id
  OR id = (SELECT parent_agent_id FROM mesh_users WHERE auth_user_id = auth.uid())
);

-- mesh_groups RLS policies
ALTER TABLE mesh_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agents_full_access_groups"
ON mesh_groups FOR ALL
USING (
  agent_id = (SELECT agent_id FROM mesh_users WHERE auth_user_id = auth.uid() AND user_type = 'agent')
);

CREATE POLICY "collaborators_view_permitted_groups"
ON mesh_groups FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM mesh_users u
    WHERE u.auth_user_id = auth.uid()
      AND u.user_type = 'collaborator'
      AND (
        mesh_groups.owner_user_id = u.id
        OR EXISTS (
          SELECT 1 FROM mesh_group_permissions p
          WHERE p.collaborator_id = u.id
            AND p.group_id = mesh_groups.id
            AND p.revoked_at IS NULL
        )
      )
  )
);

CREATE POLICY "collaborators_modify_own_groups"
ON mesh_groups FOR INSERT
WITH CHECK (
  owner_user_id = (SELECT id FROM mesh_users WHERE auth_user_id = auth.uid() AND user_type = 'collaborator')
);

CREATE POLICY "collaborators_update_own_groups"
ON mesh_groups FOR UPDATE
USING (
  owner_user_id = (SELECT id FROM mesh_users WHERE auth_user_id = auth.uid() AND user_type = 'collaborator')
);

-- mesh_group_permissions RLS policies
ALTER TABLE mesh_group_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agents_manage_permissions"
ON mesh_group_permissions FOR ALL
USING (
  agent_id = (SELECT agent_id FROM mesh_users WHERE auth_user_id = auth.uid() AND user_type = 'agent')
);

CREATE POLICY "collaborators_view_own_permissions"
ON mesh_group_permissions FOR SELECT
USING (
  collaborator_id = (SELECT id FROM mesh_users WHERE auth_user_id = auth.uid() AND user_type = 'collaborator')
);

-- android_devices updated RLS policies
CREATE POLICY "agents_view_tenant_devices"
ON android_devices FOR SELECT
USING (
  agent_id = (SELECT agent_id FROM mesh_users WHERE auth_user_id = auth.uid() AND user_type = 'agent')
);

CREATE POLICY "collaborators_view_permitted_devices"
ON android_devices FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM mesh_users u
    WHERE u.auth_user_id = auth.uid()
      AND u.user_type = 'collaborator'
      AND (
        android_devices.owner = u.id
        OR android_devices.group_id IN (
          SELECT group_id FROM get_visible_groups(u.id)
        )
      )
  )
);

CREATE POLICY "agents_modify_tenant_devices"
ON android_devices FOR INSERT
WITH CHECK (
  agent_id = (SELECT agent_id FROM mesh_users WHERE auth_user_id = auth.uid() AND user_type = 'agent')
);

CREATE POLICY "collaborators_modify_own_devices"
ON android_devices FOR INSERT
WITH CHECK (
  owner = (SELECT id FROM mesh_users WHERE auth_user_id = auth.uid() AND user_type = 'collaborator')
);

CREATE POLICY "agents_update_tenant_devices"
ON android_devices FOR UPDATE
USING (
  agent_id = (SELECT agent_id FROM mesh_users WHERE auth_user_id = auth.uid() AND user_type = 'agent')
);

CREATE POLICY "collaborators_update_permitted_devices"
ON android_devices FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM mesh_users u
    WHERE u.auth_user_id = auth.uid()
      AND u.user_type = 'collaborator'
      AND (
        android_devices.owner = u.id
        OR android_devices.group_id IN (
          SELECT group_id FROM get_visible_groups(u.id)
        )
      )
  )
);

CREATE POLICY "agents_delete_tenant_devices"
ON android_devices FOR DELETE
USING (
  agent_id = (SELECT agent_id FROM mesh_users WHERE auth_user_id = auth.uid() AND user_type = 'agent')
);

CREATE POLICY "collaborators_delete_own_devices"
ON android_devices FOR DELETE
USING (
  owner = (SELECT id FROM mesh_users WHERE auth_user_id = auth.uid() AND user_type = 'collaborator')
);

-- =====================================================
-- STEP 8: Audit and Logging
-- =====================================================

-- Audit log table for permission changes
CREATE TABLE IF NOT EXISTS mesh_permission_audit (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES mesh_users(id),
  collaborator_id UUID NOT NULL REFERENCES mesh_users(id),
  group_id UUID NOT NULL REFERENCES mesh_groups(id),
  action TEXT NOT NULL CHECK (action IN ('grant', 'revoke')),
  permission TEXT NOT NULL,
  performed_by UUID REFERENCES mesh_users(id),
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT,
  metadata JSONB
);

CREATE INDEX idx_mesh_permission_audit_agent_id ON mesh_permission_audit(agent_id);
CREATE INDEX idx_mesh_permission_audit_collaborator_id ON mesh_permission_audit(collaborator_id);
CREATE INDEX idx_mesh_permission_audit_performed_at ON mesh_permission_audit(performed_at DESC);

-- Trigger to log permission changes
CREATE OR REPLACE FUNCTION log_permission_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO mesh_permission_audit (
      agent_id, collaborator_id, group_id, action, permission, performed_by
    ) VALUES (
      NEW.agent_id, NEW.collaborator_id, NEW.group_id, 'grant', NEW.permission, NEW.granted_by
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL THEN
    INSERT INTO mesh_permission_audit (
      agent_id, collaborator_id, group_id, action, permission, performed_by
    ) VALUES (
      NEW.agent_id, NEW.collaborator_id, NEW.group_id, 'revoke', NEW.permission, NEW.revoked_by
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER log_permission_change_trigger
AFTER INSERT OR UPDATE ON mesh_group_permissions
FOR EACH ROW
EXECUTE FUNCTION log_permission_change();

-- =====================================================
-- STEP 9: Views for Common Queries
-- =====================================================

-- View: Effective permissions for collaborators
CREATE OR REPLACE VIEW collaborator_effective_permissions AS
SELECT 
  u.id AS collaborator_id,
  u.mesh_username,
  u.parent_agent_id AS agent_id,
  g.id AS group_id,
  g.name AS group_name,
  g.path AS group_path,
  p.permission,
  p.granted_at,
  p.granted_by,
  CASE 
    WHEN p.revoked_at IS NULL THEN 'active'
    ELSE 'revoked'
  END AS status
FROM mesh_users u
LEFT JOIN mesh_group_permissions p ON p.collaborator_id = u.id
LEFT JOIN mesh_groups g ON g.id = p.group_id
WHERE u.user_type = 'collaborator';

-- View: Agent hierarchy summary
CREATE OR REPLACE VIEW agent_hierarchy_summary AS
SELECT 
  a.id AS agent_id,
  a.mesh_username AS agent_username,
  a.email AS agent_email,
  COUNT(DISTINCT c.id) AS collaborator_count,
  COUNT(DISTINCT g.id) AS group_count,
  COUNT(DISTINCT d.id) AS device_count,
  COUNT(DISTINCT p.id) AS active_permission_count
FROM mesh_users a
LEFT JOIN mesh_users c ON c.parent_agent_id = a.id AND c.user_type = 'collaborator'
LEFT JOIN mesh_groups g ON g.agent_id = a.id AND g.deleted_at IS NULL
LEFT JOIN android_devices d ON d.agent_id = a.id AND d.deleted_at IS NULL
LEFT JOIN mesh_group_permissions p ON p.agent_id = a.id AND p.revoked_at IS NULL
WHERE a.user_type = 'agent'
GROUP BY a.id, a.mesh_username, a.email;

-- =====================================================
-- STEP 10: Comments and Documentation
-- =====================================================

COMMENT ON TABLE mesh_users IS 'Users table supporting agent-collaborator hierarchy. Agents are top-level users who can create and manage collaborators.';
COMMENT ON COLUMN mesh_users.user_type IS 'User type: agent (can create collaborators) or collaborator (restricted user)';
COMMENT ON COLUMN mesh_users.parent_agent_id IS 'For collaborators: references the parent agent. NULL for agents.';
COMMENT ON COLUMN mesh_users.agent_id IS 'Denormalized agent_id for performance. Self-reference for agents, parent_agent_id for collaborators.';

COMMENT ON TABLE mesh_groups IS 'Hierarchical groups for organizing devices. Supports nested subgroups.';
COMMENT ON COLUMN mesh_groups.agent_id IS 'The agent who owns this group tenant';
COMMENT ON COLUMN mesh_groups.owner_user_id IS 'The user (agent or collaborator) who created this group';
COMMENT ON COLUMN mesh_groups.path IS 'Computed full path for display (e.g., "Company / Dept / Team")';

COMMENT ON TABLE mesh_group_permissions IS 'Permission grants linking collaborators to groups. Supports revocation without deletion.';
COMMENT ON COLUMN mesh_group_permissions.revoked_at IS 'When NULL, permission is active. When set, permission is revoked but audit trail preserved.';

COMMENT ON TABLE android_devices IS 'Android devices. Now linked to groups and agents for hierarchical access control.';
COMMENT ON COLUMN android_devices.group_id IS 'The group this device belongs to. NULL = ungrouped/orphaned.';
COMMENT ON COLUMN android_devices.agent_id IS 'The agent who owns this device (denormalized from owner.agent_id)';