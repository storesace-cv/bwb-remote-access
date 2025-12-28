-- Step 13: Enable RLS and create policies for mesh_group_permissions
ALTER TABLE mesh_group_permissions ENABLE ROW LEVEL SECURITY;

-- Agents can manage all permissions in their tenant
CREATE POLICY "agents_manage_permissions"
ON mesh_group_permissions FOR ALL
USING (
  agent_id = (
    SELECT agent_id 
    FROM mesh_users 
    WHERE auth_user_id = auth.uid() 
    AND user_type IN ('agent', 'siteadmin', 'minisiteadmin')
  )
);

-- Collaborators can view their own permissions
CREATE POLICY "collaborators_view_own_permissions"
ON mesh_group_permissions FOR SELECT
USING (
  collaborator_id = (
    SELECT id 
    FROM mesh_users 
    WHERE auth_user_id = auth.uid() 
    AND user_type = 'colaborador'
  )
);