-- ================================================================
-- MIGRATION: Normalizar user_type para nomenclatura consistente
-- Data: 2025-12-21
-- Descrição: Converter para lowercase normalizado:
--            ATIVO → colaborador
--            INATIVO → inactivo
--            CANDIDATO → candidato
--            agent → agent (mantém)
-- ================================================================

-- 1. Remover constraint antiga
-- ================================================================

ALTER TABLE mesh_users DROP CONSTRAINT IF EXISTS mesh_users_user_type_valid;

-- 2. Normalizar valores existentes
-- ================================================================

-- Converter "ATIVO" → "colaborador"
UPDATE mesh_users
SET user_type = 'colaborador'
WHERE user_type = 'ATIVO';

-- Converter "INATIVO" → "inactivo"
UPDATE mesh_users
SET user_type = 'inactivo'
WHERE user_type = 'INATIVO';

-- Converter "CANDIDATO" → "candidato"
UPDATE mesh_users
SET user_type = 'candidato'
WHERE user_type = 'CANDIDATO';

-- "agent" já está correto (não alterar)

-- 3. Adicionar nova constraint CHECK normalizada
-- ================================================================

ALTER TABLE mesh_users
ADD CONSTRAINT mesh_users_user_type_valid 
CHECK (user_type IN ('agent', 'colaborador', 'inactivo', 'candidato'));

-- 4. Atualizar default para lowercase
-- ================================================================

ALTER TABLE mesh_users
ALTER COLUMN user_type SET DEFAULT 'candidato';

-- 5. Comentários explicativos
-- ================================================================

COMMENT ON COLUMN mesh_users.user_type IS 
'Status do utilizador na app (hierarquia): agent (topo) → colaborador (ativo) → inactivo (desativado) → candidato (sem conta)';

-- ================================================================
-- FIM DA MIGRATION
-- ================================================================