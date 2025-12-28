BEGIN;

DROP POLICY IF EXISTS "siteadmins_view_all_mesh_users" ON public.mesh_users;

CREATE POLICY "siteadmins_view_all_mesh_users"
ON public.mesh_users
FOR SELECT
TO public
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.mesh_users AS me
    WHERE
      me.auth_user_id = auth.uid()
      AND me.user_type = 'siteadmin'
      AND me.deleted_at IS NULL
  )
);

COMMIT;

SELECT 
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'mesh_users'
ORDER BY policyname;