-- ================================================================
-- FIX SCRIPT: Migração RBAC completa (versão corrigida)
-- Execute este script no Supabase SQL Editor
-- ================================================================

-- STEP 1: Criar tabela ROLES
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  hierarchy_level INTEGER NOT NULL DEFAULT 0,
  can_access_management_panel BOOLEAN DEFAULT false,
  can_access_user_profile BOOLEAN DEFAULT true,
  can_scan_qr BOOLEAN DEFAULT false,
  can_provision_without_qr BOOLEAN DEFAULT false,
  can_view_devices BOOLEAN DEFAULT false,
  can_adopt_devices BOOLEAN DEFAULT false,
  can_edit_devices BOOLEAN DEFAULT false,
  can_delete_devices BOOLEAN DEFAULT false,
  can_view_users BOOLEAN DEFAULT false,
  can_create_users BOOLEAN DEFAULT false,
  can_edit_users BOOLEAN DEFAULT false,
  can_delete_users BOOLEAN DEFAULT false,
  can_change_user_role BOOLEAN DEFAULT false,
  can_view_groups BOOLEAN DEFAULT false,
  can_create_groups BOOLEAN DEFAULT false,
  can_edit_groups BOOLEAN DEFAULT false,
  can_delete_groups BOOLEAN DEFAULT false,
  can_assign_permissions BOOLEAN DEFAULT false,
  can_access_all_domains BOOLEAN DEFAULT false,
  can_access_own_domain_only BOOLEAN DEFAULT true,
  can_manage_roles BOOLEAN DEFAULT false,
  can_view_audit_logs BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- STEP 2: Inserir roles pré-definidos
INSERT INTO roles (id, name, display_name, description, hierarchy_level,
  can_access_management_panel, can_access_user_profile,
  can_scan_qr, can_provision_without_qr, can_view_devices, can_adopt_devices, can_edit_devices, can_delete_devices,
  can_view_users, can_create_users, can_edit_users, can_delete_users, can_change_user_role,
  can_view_groups, can_create_groups, can_edit_groups, can_delete_groups, can_assign_permissions,
  can_access_all_domains, can_access_own_domain_only, can_manage_roles, can_view_audit_logs
) VALUES 
('a0000000-0000-0000-0000-000000000001', 'siteadmin', 'Site Admin', 'Administrador global', 0,
  true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, false, true, true),
('a0000000-0000-0000-0000-000000000002', 'minisiteadmin', 'Mini Site Admin', 'Administrador do domínio', 1,
  true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, false, true, false, true),
('a0000000-0000-0000-0000-000000000003', 'agent', 'Agent', 'Agente/técnico', 2,
  true, true, true, true, true, true, true, true, true, true, true, true, false, true, true, true, true, true, false, true, false, false),
('a0000000-0000-0000-0000-000000000004', 'colaborador', 'Colaborador', 'Utilizador standard', 3,
  false, true, true, true, true, true, true, false, false, false, false, false, false, true, false, false, false, false, false, true, false, false),
('a0000000-0000-0000-0000-000000000005', 'inactivo', 'Inactivo', 'Conta desactivada', 4,
  false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false)
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  hierarchy_level = EXCLUDED.hierarchy_level,
  can_access_management_panel = EXCLUDED.can_access_management_panel,
  can_access_user_profile = EXCLUDED.can_access_user_profile,
  can_scan_qr = EXCLUDED.can_scan_qr,
  can_provision_without_qr = EXCLUDED.can_provision_without_qr,
  can_view_devices = EXCLUDED.can_view_devices,
  can_adopt_devices = EXCLUDED.can_adopt_devices,
  can_edit_devices = EXCLUDED.can_edit_devices,
  can_delete_devices = EXCLUDED.can_delete_devices,
  can_view_users = EXCLUDED.can_view_users,
  can_create_users = EXCLUDED.can_create_users,
  can_edit_users = EXCLUDED.can_edit_users,
  can_delete_users = EXCLUDED.can_delete_users,
  can_change_user_role = EXCLUDED.can_change_user_role,
  can_view_groups = EXCLUDED.can_view_groups,
  can_create_groups = EXCLUDED.can_create_groups,
  can_edit_groups = EXCLUDED.can_edit_groups,
  can_delete_groups = EXCLUDED.can_delete_groups,
  can_assign_permissions = EXCLUDED.can_assign_permissions,
  can_access_all_domains = EXCLUDED.can_access_all_domains,
  can_access_own_domain_only = EXCLUDED.can_access_own_domain_only,
  can_manage_roles = EXCLUDED.can_manage_roles,
  can_view_audit_logs = EXCLUDED.can_view_audit_logs,
  updated_at = NOW();

-- STEP 3: Adicionar campos a mesh_users
ALTER TABLE mesh_users ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES roles(id);
ALTER TABLE mesh_users ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE mesh_users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- STEP 4: Migrar user_type para role_id
UPDATE mesh_users
SET role_id = (
  SELECT r.id FROM roles r WHERE r.name = 
    CASE 
      WHEN mesh_users.user_type = 'siteadmin' THEN 'siteadmin'
      WHEN mesh_users.user_type = 'minisiteadmin' THEN 'minisiteadmin'
      WHEN mesh_users.user_type = 'agent' THEN 'agent'
      WHEN mesh_users.user_type IN ('colaborador', 'ATIVO', 'collaborator') THEN 'colaborador'
      WHEN mesh_users.user_type IN ('inactivo', 'INATIVO') THEN 'inactivo'
      WHEN mesh_users.user_type IN ('candidato', 'CANDIDATO') THEN 'colaborador'
      ELSE 'colaborador'
    END
)
WHERE role_id IS NULL;

-- STEP 5: Default para novos utilizadores
ALTER TABLE mesh_users ALTER COLUMN role_id SET DEFAULT 'a0000000-0000-0000-0000-000000000004';

-- STEP 6: Índices
CREATE INDEX IF NOT EXISTS idx_mesh_users_role_id ON mesh_users(role_id);
CREATE INDEX IF NOT EXISTS idx_roles_hierarchy_level ON roles(hierarchy_level);

-- STEP 7: View para gestão (SEM updated_at)
CREATE OR REPLACE VIEW user_management_view AS
SELECT 
  u.id, u.mesh_username, u.email, u.full_name, u.display_name, u.domain, u.auth_user_id, u.created_at,
  r.id AS role_id, r.name AS role_name, r.display_name AS role_display_name, r.hierarchy_level,
  r.can_access_management_panel, r.can_create_users
FROM mesh_users u
LEFT JOIN roles r ON u.role_id = r.id
WHERE u.role_id IS NULL OR u.role_id != 'a0000000-0000-0000-0000-000000000005';

-- STEP 8: RLS
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anyone_can_view_roles" ON roles;
CREATE POLICY "anyone_can_view_roles" ON roles FOR SELECT USING (true);

-- VERIFICAÇÃO
SELECT name, display_name, hierarchy_level FROM roles ORDER BY hierarchy_level;
