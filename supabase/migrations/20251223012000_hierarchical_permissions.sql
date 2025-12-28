-- Hierarchical Permissions Implementation
-- Created: 2025-12-23
-- Purpose: Implement permission inheritance for group hierarchy

-- =====================================================
-- STEP 1: Function to get all descendant groups (recursive)
-- =====================================================

CREATE OR REPLACE FUNCTION get_descendant_groups(parent_group_uuid UUID)
RETURNS TABLE(group_id UUID) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE descendants AS (
    -- Base case: the parent group itself
    SELECT id FROM mesh_groups WHERE id = parent_group_uuid AND deleted_at IS NULL
    
    UNION
    
    -- Recursive case: all children
    SELECT g.id
    FROM mesh_groups g
    INNER JOIN descendants d ON g.parent_group_id = d.id
    WHERE g.deleted_at IS NULL
  )
  SELECT id FROM descendants;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_descendant_groups IS 'Returns all descendant groups (children, grandchildren, etc.) for a given group, including the group itself';

-- =====================================================
-- STEP 2: Function to check if user has access to a group (with inheritance)
-- =====================================================

CREATE OR REPLACE FUNCTION has_group_access(
  user_uuid UUID,
  target_group_uuid UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  user_record RECORD;
  has_access BOOLEAN := false;
  current_group_id UUID := target_group_uuid;
  max_depth INTEGER := 10;
  depth INTEGER := 0;
BEGIN
  -- Get user info
  SELECT user_type, agent_id, id INTO user_record
  FROM mesh_users 
  WHERE id = user_uuid;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Agents see all groups in their tenant
  IF user_record.user_type IN ('agent', 'minisiteadmin', 'siteadmin') THEN
    RETURN EXISTS (
      SELECT 1 FROM mesh_groups 
      WHERE id = target_group_uuid 
        AND agent_id = user_record.agent_id
        AND deleted_at IS NULL
    );
  END IF;
  
  -- Collaborators: check if they own the group
  IF EXISTS (
    SELECT 1 FROM mesh_groups 
    WHERE id = target_group_uuid 
      AND owner_user_id = user_uuid
      AND deleted_at IS NULL
  ) THEN
    RETURN true;
  END IF;
  
  -- Collaborators: check permission inheritance (walk up the tree)
  WHILE current_group_id IS NOT NULL AND depth < max_depth LOOP
    -- Check if user has permission on current group
    IF EXISTS (
      SELECT 1 FROM mesh_group_permissions
      WHERE collaborator_id = user_uuid
        AND group_id = current_group_id
        AND revoked_at IS NULL
    ) THEN
      RETURN true;
    END IF;
    
    -- Move to parent group
    SELECT parent_group_id INTO current_group_id
    FROM mesh_groups
    WHERE id = current_group_id;
    
    depth := depth + 1;
  END LOOP;
  
  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION has_group_access IS 'Checks if a user has access to a group, considering permission inheritance from parent groups';

-- =====================================================
-- STEP 3: Updated function to get visible groups (with inheritance)
-- =====================================================

CREATE OR REPLACE FUNCTION get_visible_groups_with_inheritance(user_uuid UUID)
RETURNS TABLE(group_id UUID) AS $$
DECLARE
  user_record RECORD;
BEGIN
  SELECT user_type, agent_id INTO user_record
  FROM mesh_users WHERE id = user_uuid;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  IF user_record.user_type IN ('agent', 'minisiteadmin', 'siteadmin') THEN
    -- Agents see all groups in their tenant
    RETURN QUERY
    SELECT id FROM mesh_groups 
    WHERE agent_id = user_record.agent_id 
      AND deleted_at IS NULL;
  ELSE
    -- Collaborators: return groups they own OR have permission on (including inherited)
    RETURN QUERY
    SELECT DISTINCT g.id
    FROM mesh_groups g
    WHERE g.agent_id = user_record.agent_id
      AND g.deleted_at IS NULL
      AND has_group_access(user_uuid, g.id);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_visible_groups_with_inheritance IS 'Returns all groups visible to a user, considering hierarchical permission inheritance';

-- =====================================================
-- STEP 4: Function to get accessible devices for collaborator
-- =====================================================

CREATE OR REPLACE FUNCTION get_accessible_devices_for_collaborator(user_uuid UUID)
RETURNS TABLE(device_id UUID) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT d.id
  FROM android_devices d
  WHERE d.deleted_at IS NULL
    AND (
      -- Devices owned by the user
      d.owner = user_uuid
      OR
      -- Devices in groups the user has access to (with inheritance)
      (d.group_id IS NOT NULL AND has_group_access(user_uuid, d.group_id))
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_accessible_devices_for_collaborator IS 'Returns all devices accessible to a collaborator, considering group hierarchy and permission inheritance';

-- =====================================================
-- STEP 5: Update RLS policies to use hierarchical functions
-- =====================================================

-- Drop old policies
DROP POLICY IF EXISTS "collaborators_view_permitted_devices" ON android_devices;
DROP POLICY IF EXISTS "collaborators_update_permitted_devices" ON android_devices;

-- Recreate with hierarchical logic
CREATE POLICY "collaborators_view_permitted_devices"
ON android_devices FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM mesh_users u
    WHERE u.auth_user_id = auth.uid()
      AND u.user_type = 'colaborador'
      AND android_devices.id IN (
        SELECT device_id FROM get_accessible_devices_for_collaborator(u.id)
      )
  )
);

CREATE POLICY "collaborators_update_permitted_devices"
ON android_devices FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM mesh_users u
    WHERE u.auth_user_id = auth.uid()
      AND u.user_type = 'colaborador'
      AND android_devices.id IN (
        SELECT device_id FROM get_accessible_devices_for_collaborator(u.id)
      )
  )
);

-- =====================================================
-- STEP 6: Create view for UI to show group hierarchy
-- =====================================================

CREATE OR REPLACE VIEW group_hierarchy_view AS
WITH RECURSIVE group_tree AS (
  -- Base case: root groups (level 0)
  SELECT 
    g.id,
    g.name,
    g.path,
    g.level,
    g.parent_group_id,
    g.agent_id,
    g.owner_user_id,
    ARRAY[g.name] AS name_path,
    g.name AS display_path
  FROM mesh_groups g
  WHERE g.parent_group_id IS NULL
    AND g.deleted_at IS NULL
  
  UNION ALL
  
  -- Recursive case: child groups
  SELECT 
    g.id,
    g.name,
    g.path,
    g.level,
    g.parent_group_id,
    g.agent_id,
    g.owner_user_id,
    gt.name_path || g.name,
    gt.display_path || ' / ' || g.name
  FROM mesh_groups g
  INNER JOIN group_tree gt ON g.parent_group_id = gt.id
  WHERE g.deleted_at IS NULL
)
SELECT 
  id,
  name,
  path,
  level,
  parent_group_id,
  agent_id,
  owner_user_id,
  display_path,
  CASE 
    WHEN level = 0 THEN '📁 ' || name
    WHEN level = 1 THEN '  └─ ' || name
    WHEN level = 2 THEN '    └─ ' || name
    ELSE REPEAT('  ', level) || '└─ ' || name
  END AS display_name_with_indent
FROM group_tree
ORDER BY name_path;

COMMENT ON VIEW group_hierarchy_view IS 'View showing groups with hierarchical display names (indented with visual indicators)';

-- =====================================================
-- STEP 7: Helper function to check permission conflicts
-- =====================================================

CREATE OR REPLACE FUNCTION check_permission_conflicts(
  collaborator_uuid UUID,
  new_group_uuid UUID
)
RETURNS TABLE(
  conflict_type TEXT,
  conflict_group_id UUID,
  conflict_group_name TEXT,
  message TEXT
) AS $$
BEGIN
  -- Check if permission already exists on a parent group
  RETURN QUERY
  WITH RECURSIVE ancestors AS (
    SELECT id, name, parent_group_id
    FROM mesh_groups
    WHERE id = new_group_uuid
    
    UNION
    
    SELECT g.id, g.name, g.parent_group_id
    FROM mesh_groups g
    INNER JOIN ancestors a ON g.id = a.parent_group_id
  )
  SELECT 
    'parent_has_permission'::TEXT,
    a.id,
    a.name,
    'Já existe permissão no grupo pai "' || a.name || '". Esta permissão é redundante.'::TEXT
  FROM ancestors a
  WHERE EXISTS (
    SELECT 1 FROM mesh_group_permissions p
    WHERE p.collaborator_id = collaborator_uuid
      AND p.group_id = a.id
      AND p.revoked_at IS NULL
  )
  AND a.id != new_group_uuid;
  
  -- Check if permission exists on descendant groups
  RETURN QUERY
  SELECT 
    'child_has_permission'::TEXT,
    d.group_id,
    g.name,
    'Já existe permissão no subgrupo "' || g.name || '". Será substituída pela permissão no grupo pai.'::TEXT
  FROM get_descendant_groups(new_group_uuid) d
  INNER JOIN mesh_groups g ON g.id = d.group_id
  WHERE EXISTS (
    SELECT 1 FROM mesh_group_permissions p
    WHERE p.collaborator_id = collaborator_uuid
      AND p.group_id = d.group_id
      AND p.revoked_at IS NULL
  )
  AND d.group_id != new_group_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION check_permission_conflicts IS 'Checks for redundant or conflicting permissions when granting access to a group';