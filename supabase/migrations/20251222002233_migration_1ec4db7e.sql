-- Fix RLS Recursion in mesh_users - Remove only problematic policies
-- Version: 2025-12-22T00:21:00Z

-- Drop the recursive policies that are causing infinite recursion
DROP POLICY IF EXISTS "agents_view_own_tenant" ON mesh_users;
DROP POLICY IF EXISTS "collaborators_view_restricted" ON mesh_users;
DROP POLICY IF EXISTS "agents_view_domain_mesh_users" ON mesh_users;
DROP POLICY IF EXISTS "siteadmins_view_all_mesh_users" ON mesh_users;

-- The simple policy "mesh_users_select_policy" already exists and is sufficient
-- It allows users to view their own record + service_role bypass
-- Tenant isolation is enforced in Edge Functions using service_role key