-- FIX 2 (CORRECTED): Enable RLS on mesh_users table with correct column names
ALTER TABLE public.mesh_users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "mesh_users_select_policy" ON public.mesh_users;
DROP POLICY IF EXISTS "mesh_users_insert_policy" ON public.mesh_users;
DROP POLICY IF EXISTS "mesh_users_update_policy" ON public.mesh_users;
DROP POLICY IF EXISTS "mesh_users_delete_policy" ON public.mesh_users;

-- Create RLS policies for mesh_users
-- Only service role can read mesh_users (used for backend sync)
CREATE POLICY "mesh_users_select_policy" 
ON public.mesh_users 
FOR SELECT 
USING (
  -- Allow service role full access
  auth.jwt() ->> 'role' = 'service_role'
  OR
  -- Allow authenticated users to see their own mesh user
  (auth.uid() IS NOT NULL AND auth.uid() = auth_user_id)
);

-- Only service role can insert mesh_users
CREATE POLICY "mesh_users_insert_policy" 
ON public.mesh_users 
FOR INSERT 
WITH CHECK (
  auth.jwt() ->> 'role' = 'service_role'
);

-- Only service role can update mesh_users
CREATE POLICY "mesh_users_update_policy" 
ON public.mesh_users 
FOR UPDATE 
USING (
  auth.jwt() ->> 'role' = 'service_role'
);

-- Only service role can delete mesh_users
CREATE POLICY "mesh_users_delete_policy" 
ON public.mesh_users 
FOR DELETE 
USING (
  auth.jwt() ->> 'role' = 'service_role'
);

COMMENT ON TABLE public.mesh_users IS 
'MeshCentral user accounts synced from external system. RLS enabled: service_role has full access, authenticated users can view their own records.';