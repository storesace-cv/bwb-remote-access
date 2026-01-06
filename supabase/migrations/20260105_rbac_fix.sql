-- ================================================================
-- FIX SCRIPT: Completar migração RBAC após erro
-- Execute este script se o anterior falhou na VIEW
-- ================================================================

-- STEP 8: View para UI de gestão de utilizadores (CORRIGIDO - sem updated_at)
DROP VIEW IF EXISTS user_management_view;

CREATE OR REPLACE VIEW user_management_view AS
SELECT 
  u.id,
  u.mesh_username,
  u.email,
  u.full_name,
  u.display_name,
  u.domain,
  u.auth_user_id,
  u.created_at,
  r.id AS role_id,
  r.name AS role_name,
  r.display_name AS role_display_name,
  r.hierarchy_level,
  r.can_access_management_panel,
  r.can_create_users
FROM mesh_users u
LEFT JOIN roles r ON u.role_id = r.id
WHERE u.role_id IS NULL OR u.role_id != 'a0000000-0000-0000-0000-000000000005';

COMMENT ON VIEW user_management_view IS 'View para UI de gestão de utilizadores com dados de role';

-- STEP 9: RLS para tabela roles (se não foi criado)
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

-- Drop policies se existirem para recriar
DROP POLICY IF EXISTS "anyone_can_view_roles" ON roles;
DROP POLICY IF EXISTS "only_siteadmin_can_modify_roles" ON roles;

-- Todos podem ver roles (para dropdowns)
CREATE POLICY "anyone_can_view_roles"
ON roles FOR SELECT
USING (true);

-- Só siteadmin pode modificar roles
CREATE POLICY "only_siteadmin_can_modify_roles"
ON roles FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM mesh_users u
    JOIN roles r ON u.role_id = r.id
    WHERE u.auth_user_id = auth.uid()
      AND r.can_manage_roles = true
  )
);

-- ================================================================
-- VERIFICAÇÃO: Ver se tudo ficou bem
-- ================================================================

-- Ver roles criados
SELECT id, name, display_name, hierarchy_level FROM roles ORDER BY hierarchy_level;

-- Ver quantos utilizadores têm role atribuído
SELECT 
  r.name as role_name,
  COUNT(u.id) as user_count
FROM mesh_users u
LEFT JOIN roles r ON u.role_id = r.id
GROUP BY r.name
ORDER BY r.name;
