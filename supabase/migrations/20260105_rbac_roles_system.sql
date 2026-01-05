-- ================================================================
-- MIGRATION: Sistema RBAC com Permissões Granulares
-- Data: 2026-01-05
-- Descrição: 
--   1. Criar tabela `roles` com permissões granulares
--   2. Migrar dados de `profiles` para `mesh_users`
--   3. Adicionar `role_id` a `mesh_users`
--   4. Remover tabela `profiles`
-- ================================================================

-- =====================================================
-- STEP 1: Criar tabela ROLES com permissões granulares
-- =====================================================

CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  hierarchy_level INTEGER NOT NULL DEFAULT 0, -- 0=mais alto (siteadmin), 4=mais baixo (inactivo)
  
  -- Permissões de Acesso a Painéis
  can_access_management_panel BOOLEAN DEFAULT false,
  can_access_user_profile BOOLEAN DEFAULT true,
  
  -- Permissões de Dispositivos
  can_scan_qr BOOLEAN DEFAULT false,
  can_provision_without_qr BOOLEAN DEFAULT false,
  can_view_devices BOOLEAN DEFAULT false,
  can_adopt_devices BOOLEAN DEFAULT false,
  can_edit_devices BOOLEAN DEFAULT false,
  can_delete_devices BOOLEAN DEFAULT false,
  
  -- Permissões de Utilizadores
  can_view_users BOOLEAN DEFAULT false,
  can_create_users BOOLEAN DEFAULT false,
  can_edit_users BOOLEAN DEFAULT false,
  can_delete_users BOOLEAN DEFAULT false,
  can_change_user_role BOOLEAN DEFAULT false,
  
  -- Permissões de Grupos
  can_view_groups BOOLEAN DEFAULT false,
  can_create_groups BOOLEAN DEFAULT false,
  can_edit_groups BOOLEAN DEFAULT false,
  can_delete_groups BOOLEAN DEFAULT false,
  can_assign_permissions BOOLEAN DEFAULT false,
  
  -- Permissões de Domínio
  can_access_all_domains BOOLEAN DEFAULT false,
  can_access_own_domain_only BOOLEAN DEFAULT true,
  
  -- Permissões Especiais
  can_manage_roles BOOLEAN DEFAULT false, -- só siteadmin
  can_view_audit_logs BOOLEAN DEFAULT false,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_roles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_roles_updated_at_trigger
BEFORE UPDATE ON roles
FOR EACH ROW
EXECUTE FUNCTION update_roles_updated_at();

-- Comentários
COMMENT ON TABLE roles IS 'Definição de perfis/roles com permissões granulares para RBAC';
COMMENT ON COLUMN roles.hierarchy_level IS 'Nível na hierarquia: 0=siteadmin (topo), 1=minisiteadmin, 2=agent, 3=colaborador, 4=inactivo';
COMMENT ON COLUMN roles.can_access_all_domains IS 'Pode aceder a dispositivos/utilizadores de todos os domínios';

-- =====================================================
-- STEP 2: Inserir roles pré-definidos
-- =====================================================

INSERT INTO roles (
  id, name, display_name, description, hierarchy_level,
  can_access_management_panel, can_access_user_profile,
  can_scan_qr, can_provision_without_qr, can_view_devices, can_adopt_devices, can_edit_devices, can_delete_devices,
  can_view_users, can_create_users, can_edit_users, can_delete_users, can_change_user_role,
  can_view_groups, can_create_groups, can_edit_groups, can_delete_groups, can_assign_permissions,
  can_access_all_domains, can_access_own_domain_only,
  can_manage_roles, can_view_audit_logs
) VALUES 
-- SITEADMIN: Pode fazer tudo em todos os domínios
(
  'a0000000-0000-0000-0000-000000000001',
  'siteadmin', 'Site Admin', 'Administrador global com acesso total a todos os domínios', 0,
  true, true,
  true, true, true, true, true, true,
  true, true, true, true, true,
  true, true, true, true, true,
  true, false,
  true, true
),
-- MINISITEADMIN: Pode fazer tudo no seu domínio
(
  'a0000000-0000-0000-0000-000000000002',
  'minisiteadmin', 'Mini Site Admin', 'Administrador do domínio com acesso total ao seu domínio', 1,
  true, true,
  true, true, true, true, true, true,
  true, true, true, true, true,
  true, true, true, true, true,
  false, true,
  false, true
),
-- AGENT: Pode fazer tudo no seu domínio menos criar siteadmin/minisiteadmin
(
  'a0000000-0000-0000-0000-000000000003',
  'agent', 'Agent', 'Agente/técnico que gere colaboradores e dispositivos', 2,
  true, true,
  true, true, true, true, true, true,
  true, true, true, true, false, -- can_change_user_role = false (não pode promover a admin)
  true, true, true, true, true,
  false, true,
  false, false
),
-- COLABORADOR: Pode fazer tudo no seu domínio menos criar utilizadores
(
  'a0000000-0000-0000-0000-000000000004',
  'colaborador', 'Colaborador', 'Utilizador standard com acesso a dispositivos', 3,
  false, true,
  true, true, true, true, true, false,
  false, false, false, false, false,
  true, false, false, false, false,
  false, true,
  false, false
),
-- INACTIVO: Conta desactivada
(
  'a0000000-0000-0000-0000-000000000005',
  'inactivo', 'Inactivo', 'Conta desactivada sem acesso', 4,
  false, false,
  false, false, false, false, false, false,
  false, false, false, false, false,
  false, false, false, false, false,
  false, false,
  false, false
)
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

-- =====================================================
-- STEP 3: Adicionar campos a mesh_users
-- =====================================================

-- Adicionar role_id se não existir
ALTER TABLE mesh_users 
ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES roles(id);

-- Adicionar full_name e avatar_url (migrar de profiles)
ALTER TABLE mesh_users 
ADD COLUMN IF NOT EXISTS full_name TEXT,
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- =====================================================
-- STEP 4: Migrar dados de profiles para mesh_users
-- =====================================================

-- Copiar full_name e avatar_url de profiles para mesh_users
UPDATE mesh_users mu
SET 
  full_name = COALESCE(mu.full_name, p.full_name),
  avatar_url = COALESCE(mu.avatar_url, p.avatar_url)
FROM profiles p
WHERE mu.auth_user_id = p.id
  AND (mu.full_name IS NULL OR mu.avatar_url IS NULL);

-- =====================================================
-- STEP 5: Migrar user_type para role_id
-- =====================================================

-- Mapear user_type existente para role_id
UPDATE mesh_users
SET role_id = (
  SELECT r.id FROM roles r WHERE r.name = 
    CASE 
      WHEN mesh_users.user_type = 'siteadmin' THEN 'siteadmin'
      WHEN mesh_users.user_type = 'minisiteadmin' THEN 'minisiteadmin'
      WHEN mesh_users.user_type = 'agent' THEN 'agent'
      WHEN mesh_users.user_type IN ('colaborador', 'ATIVO', 'collaborator') THEN 'colaborador'
      WHEN mesh_users.user_type IN ('inactivo', 'INATIVO') THEN 'inactivo'
      WHEN mesh_users.user_type IN ('candidato', 'CANDIDATO') THEN 'colaborador' -- candidato → colaborador
      ELSE 'colaborador' -- default
    END
)
WHERE role_id IS NULL;

-- Definir default para novos utilizadores
ALTER TABLE mesh_users 
ALTER COLUMN role_id SET DEFAULT 'a0000000-0000-0000-0000-000000000004'; -- colaborador

-- =====================================================
-- STEP 6: Criar índices
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_mesh_users_role_id ON mesh_users(role_id);
CREATE INDEX IF NOT EXISTS idx_roles_hierarchy_level ON roles(hierarchy_level);
CREATE INDEX IF NOT EXISTS idx_roles_name ON roles(name);

-- =====================================================
-- STEP 7: Funções auxiliares para RBAC
-- =====================================================

-- Função para verificar se utilizador pode gerir outro utilizador
CREATE OR REPLACE FUNCTION can_manage_user(
  manager_user_id UUID,
  target_user_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  manager_level INTEGER;
  target_level INTEGER;
BEGIN
  -- Obter nível hierárquico do manager
  SELECT r.hierarchy_level INTO manager_level
  FROM mesh_users u
  JOIN roles r ON u.role_id = r.id
  WHERE u.id = manager_user_id;
  
  -- Obter nível hierárquico do target
  SELECT r.hierarchy_level INTO target_level
  FROM mesh_users u
  JOIN roles r ON u.role_id = r.id
  WHERE u.id = target_user_id;
  
  -- Manager só pode gerir utilizadores com nível INFERIOR (número maior)
  RETURN manager_level < target_level;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION can_manage_user IS 'Verifica se um utilizador pode gerir outro baseado na hierarquia de roles';

-- Função para obter roles que um utilizador pode atribuir
CREATE OR REPLACE FUNCTION get_assignable_roles(manager_user_id UUID)
RETURNS TABLE(role_id UUID, role_name TEXT, display_name TEXT) AS $$
DECLARE
  manager_level INTEGER;
BEGIN
  -- Obter nível hierárquico do manager
  SELECT r.hierarchy_level INTO manager_level
  FROM mesh_users u
  JOIN roles r ON u.role_id = r.id
  WHERE u.id = manager_user_id;
  
  -- Retornar roles com nível INFERIOR (número maior)
  RETURN QUERY
  SELECT r.id, r.name, r.display_name
  FROM roles r
  WHERE r.hierarchy_level > manager_level
  ORDER BY r.hierarchy_level;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_assignable_roles IS 'Retorna lista de roles que um utilizador pode atribuir a outros';

-- Função para obter utilizadores que um manager pode ver
CREATE OR REPLACE FUNCTION get_manageable_users(manager_user_id UUID)
RETURNS TABLE(user_id UUID) AS $$
DECLARE
  manager_record RECORD;
BEGIN
  -- Obter dados do manager
  SELECT u.id, u.domain, r.hierarchy_level, r.can_access_all_domains
  INTO manager_record
  FROM mesh_users u
  JOIN roles r ON u.role_id = r.id
  WHERE u.id = manager_user_id;
  
  -- Retornar utilizadores que o manager pode gerir
  RETURN QUERY
  SELECT u.id
  FROM mesh_users u
  JOIN roles r ON u.role_id = r.id
  WHERE 
    -- Só utilizadores com nível inferior
    r.hierarchy_level > manager_record.hierarchy_level
    -- E do mesmo domínio (ou todos se tiver permissão)
    AND (manager_record.can_access_all_domains OR u.domain = manager_record.domain);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_manageable_users IS 'Retorna lista de utilizadores que um manager pode gerir';

-- Função para verificar permissão específica
CREATE OR REPLACE FUNCTION has_permission(
  user_uuid UUID,
  permission_name TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  result BOOLEAN;
BEGIN
  EXECUTE format(
    'SELECT COALESCE(r.%I, false) FROM mesh_users u JOIN roles r ON u.role_id = r.id WHERE u.id = $1',
    permission_name
  ) INTO result USING user_uuid;
  
  RETURN COALESCE(result, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION has_permission IS 'Verifica se utilizador tem uma permissão específica';

-- =====================================================
-- STEP 8: View para UI de gestão de utilizadores
-- =====================================================

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
  u.updated_at,
  r.id AS role_id,
  r.name AS role_name,
  r.display_name AS role_display_name,
  r.hierarchy_level,
  r.can_access_management_panel,
  r.can_create_users
FROM mesh_users u
LEFT JOIN roles r ON u.role_id = r.id
WHERE u.role_id != 'a0000000-0000-0000-0000-000000000005'; -- Excluir inactivos da view principal

COMMENT ON VIEW user_management_view IS 'View para UI de gestão de utilizadores com dados de role';

-- =====================================================
-- STEP 9: RLS para tabela roles
-- =====================================================

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

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

-- =====================================================
-- STEP 10: Apagar tabela profiles (opcional - comentado por segurança)
-- =====================================================

-- IMPORTANTE: Só executar depois de confirmar que os dados foram migrados
-- DROP TABLE IF EXISTS profiles CASCADE;

-- =====================================================
-- FIM DA MIGRATION
-- =====================================================
