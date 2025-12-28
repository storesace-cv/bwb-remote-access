-- Step 12: Enable RLS and create policies for mesh_groups
ALTER TABLE mesh_groups ENABLE ROW LEVEL SECURITY;

-- Policy: Agents see all groups in their tenant
CREATE POLICY "agents_full_access_groups"
ON mesh_groups FOR ALL
USING (
  agent_id = (SELECT agent_id FROM mesh_users WHERE auth_user_id = auth.uid() AND user_type IN ('agent', 'minisiteadmin'))
);

-- Policy: Siteadmins see everything
CREATE POLICY "siteadmins_full_access_groups"
ON mesh_groups FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM mesh_users 
    WHERE auth_user_id = auth.uid() 
    AND user_type = 'siteadmin'
  )
);

-- Policy: Collaborators see their permitted groups
CREATE POLICY "collaborators_view_permitted_groups"
ON mesh_groups FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM mesh_users u
    WHERE u.auth_user_id = auth.uid()
      AND u.user_type = 'colaborador'
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

-- Policy: Collaborators can create their own groups
CREATE POLICY "collaborators_create_own_groups"
ON mesh_groups FOR INSERT
WITH CHECK (
  owner_user_id = (SELECT id FROM mesh_users WHERE auth_user_id = auth.uid() AND user_type = 'colaborador')
);

-- Policy: Collaborators can update their own groups
CREATE POLICY "collaborators_update_own_groups"
ON mesh_groups FOR UPDATE
USING (
  owner_user_id = (SELECT id FROM mesh_users WHERE auth_user_id = auth.uid() AND user_type = 'colaborador')
);