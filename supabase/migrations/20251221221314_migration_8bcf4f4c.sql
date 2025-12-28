CREATE POLICY "agents_view_domain_mesh_users"
ON mesh_users
FOR SELECT
TO public
USING (
  auth.uid() IS NOT NULL
  AND mesh_users.deleted_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM mesh_users AS me
    WHERE
      me.auth_user_id = auth.uid()
      AND me.user_type = 'agent'
      AND me.deleted_at IS NULL
      AND me.domain = mesh_users.domain
  )
);