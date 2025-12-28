-- ============================================================
-- SECURITY FIXES FOR SUPABASE LINTER ISSUES
-- ============================================================

-- FIX 1: Drop and recreate android_devices_expanded WITHOUT auth.users exposure
-- Remove SECURITY DEFINER and don't expose sensitive auth data
DROP VIEW IF EXISTS public.android_devices_expanded CASCADE;

CREATE OR REPLACE VIEW public.android_devices_expanded AS
SELECT 
  d.id,
  d.device_id,
  d.owner,
  d.notes,
  d.group_name,
  d.created_at,
  -- Don't expose auth.users email directly
  -- Instead, use RLS to control access at the row level
  NULL::text AS owner_email,  -- Remove sensitive data exposure
  d.owner AS owner_auth_id    -- Keep the UUID for relationship
FROM public.android_devices d;

-- Add comment explaining the security fix
COMMENT ON VIEW public.android_devices_expanded IS 
'Secure view of android devices without exposing auth.users data. Use RLS policies on android_devices table to control access.';