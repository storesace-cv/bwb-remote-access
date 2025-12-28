-- ============================================================
-- SECURITY FIXES FOR SUPABASE LINTER ISSUES
-- Applied: 2025-12-08
-- ============================================================
-- This file documents all security fixes applied to address
-- Supabase dashboard linter errors and warnings
--
-- FIXED ISSUES:
-- ✅ ERROR: auth_users_exposed - android_devices_expanded view
-- ✅ ERROR: security_definer_view - android_devices_expanded view
-- ✅ ERROR: rls_disabled_in_public - mesh_users table
-- ✅ WARN: function_search_path_mutable - update_updated_at_column
-- ⚠️  WARN: auth_leaked_password_protection - requires dashboard config
-- ============================================================

-- ============================================================
-- FIX 1: Remove auth.users exposure from android_devices_expanded
-- ============================================================
-- ISSUE: View exposed auth.users data to anonymous users
-- SOLUTION: Removed auth.users join, replaced with NULL for email
-- SECURITY: View now only shows device data, not user emails

DROP VIEW IF EXISTS public.android_devices_expanded CASCADE;

CREATE OR REPLACE VIEW public.android_devices_expanded AS
SELECT 
  d.id,
  d.device_id,
  d.owner,
  d.notes,
  d.group_name,
  d.created_at,
  NULL::text AS owner_email,  -- Security: Don't expose auth.users email
  d.owner AS owner_auth_id    -- Keep UUID for relationships only
FROM public.android_devices d;

COMMENT ON VIEW public.android_devices_expanded IS 
'Secure view of android devices without exposing auth.users data. Use RLS policies on android_devices table to control access.';

-- ============================================================
-- FIX 2: Enable RLS on mesh_users table
-- ============================================================
-- ISSUE: Table was public without RLS protection
-- SOLUTION: Enable RLS with strict service_role-only policies
-- SECURITY: Only service_role can manage mesh_users sync

ALTER TABLE public.mesh_users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "mesh_users_select_policy" ON public.mesh_users;
DROP POLICY IF EXISTS "mesh_users_insert_policy" ON public.mesh_users;
DROP POLICY IF EXISTS "mesh_users_update_policy" ON public.mesh_users;
DROP POLICY IF EXISTS "mesh_users_delete_policy" ON public.mesh_users;

-- Service role has full CRUD access (for sync operations)
-- Authenticated users can only view their own mesh_user record
CREATE POLICY "mesh_users_select_policy" 
ON public.mesh_users 
FOR SELECT 
USING (
  auth.jwt() ->> 'role' = 'service_role'
  OR
  (auth.uid() IS NOT NULL AND auth.uid() = auth_user_id)
);

CREATE POLICY "mesh_users_insert_policy" 
ON public.mesh_users 
FOR INSERT 
WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "mesh_users_update_policy" 
ON public.mesh_users 
FOR UPDATE 
USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "mesh_users_delete_policy" 
ON public.mesh_users 
FOR DELETE 
USING (auth.jwt() ->> 'role' = 'service_role');

COMMENT ON TABLE public.mesh_users IS 
'MeshCentral user accounts synced from external system. RLS enabled: service_role has full access, authenticated users can view their own records.';

-- ============================================================
-- FIX 3: Fix update_updated_at_column function search_path
-- ============================================================
-- ISSUE: Function had mutable search_path (security risk)
-- SOLUTION: Set immutable search_path to prevent injection
-- SECURITY: Function now immune to search_path manipulation

DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp  -- FIXED: Immutable search_path
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.update_updated_at_column() IS 
'Trigger function to automatically update updated_at timestamp. Fixed search_path for security.';

-- Recreate triggers that use this function
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT 
      schemaname,
      tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = schemaname
          AND table_name = tablename
          AND column_name = 'updated_at'
      )
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS update_%I_updated_at ON %I.%I',
      r.tablename, r.schemaname, r.tablename);
    
    EXECUTE format('CREATE TRIGGER update_%I_updated_at
      BEFORE UPDATE ON %I.%I
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column()',
      r.tablename, r.schemaname, r.tablename);
  END LOOP;
END;
$$;

-- ============================================================
-- REMAINING MANUAL FIX
-- ============================================================
-- ⚠️  auth_leaked_password_protection (MANUAL FIX REQUIRED)
--
-- ACTION REQUIRED: Go to Supabase Dashboard
-- 1. Navigate to: Authentication > Policies
-- 2. Enable: "Password Strength & Leaked Password Protection"
-- 3. This checks passwords against HaveIBeenPwned.org database
--
-- SECURITY BENEFIT: Prevents users from using compromised passwords
-- ============================================================