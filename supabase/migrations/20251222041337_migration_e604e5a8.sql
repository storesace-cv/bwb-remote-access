-- Step 14: Update android_devices RLS policies for group-based access
-- Drop old policies
DROP POLICY IF EXISTS "Users can view own devices" ON android_devices;
DROP POLICY IF EXISTS "Users can insert own devices" ON android_devices;
DROP POLICY IF EXISTS "Users can update own devices" ON android_devices;
DROP POLICY IF EXISTS "Users can delete own devices" ON android_devices;

-- Create new policies for agents (see all devices in their tenant)
CREATE POLICY "agents_view_tenant_devices"
ON android_devices FOR SELECT
USING (
  agent_id = (
    SELECT agent_id FROM mesh_users 
    WHERE auth_user_id = auth.uid() 
    AND user_type = 'agent'
  )
);

CREATE POLICY "agents_modify_tenant_devices"
ON android_devices FOR INSERT
WITH CHECK (
  agent_id = (
    SELECT agent_id FROM mesh_users 
    WHERE auth_user_id = auth.uid() 
    AND user_type = 'agent'
  )
);

CREATE POLICY "agents_update_tenant_devices"
ON android_devices FOR UPDATE
USING (
  agent_id = (
    SELECT agent_id FROM mesh_users 
    WHERE auth_user_id = auth.uid() 
    AND user_type = 'agent'
  )
);

CREATE POLICY "agents_delete_tenant_devices"
ON android_devices FOR DELETE
USING (
  agent_id = (
    SELECT agent_id FROM mesh_users 
    WHERE auth_user_id = auth.uid() 
    AND user_type = 'agent'
  )
);

-- Create policies for collaborators (see devices they own or have group access to)
CREATE POLICY "collaborators_view_permitted_devices"
ON android_devices FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM mesh_users u
    WHERE u.auth_user_id = auth.uid()
      AND u.user_type = 'colaborador'
      AND (
        android_devices.owner = u.id
        OR android_devices.group_id IN (
          SELECT group_id FROM get_visible_groups(u.id)
        )
      )
  )
);

CREATE POLICY "collaborators_modify_own_devices"
ON android_devices FOR INSERT
WITH CHECK (
  owner = (
    SELECT id FROM mesh_users 
    WHERE auth_user_id = auth.uid() 
    AND user_type = 'colaborador'
  )
);

CREATE POLICY "collaborators_update_permitted_devices"
ON android_devices FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM mesh_users u
    WHERE u.auth_user_id = auth.uid()
      AND u.user_type = 'colaborador'
      AND (
        android_devices.owner = u.id
        OR android_devices.group_id IN (
          SELECT group_id FROM get_visible_groups(u.id)
        )
      )
  )
);

CREATE POLICY "collaborators_delete_own_devices"
ON android_devices FOR DELETE
USING (
  owner = (
    SELECT id FROM mesh_users 
    WHERE auth_user_id = auth.uid() 
    AND user_type = 'colaborador'
  )
);