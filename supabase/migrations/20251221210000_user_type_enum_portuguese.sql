-- ================================================================
-- MIGRATION: Eliminar NULLs em mesh_users.user_type
-- Data: 2025-12-21
-- Descrição: Substituir NULLs por enum português "CANDIDATO"
--            e normalizar valores para: CANDIDATO, ATIVO, INATIVO, agent
-- ================================================================

-- 1. Atualizar valores existentes
-- ================================================================

-- Converter NULL para "CANDIDATO" (utilizadores sem auth_user_id)
UPDATE mesh_users
SET user_type = 'CANDIDATO'
WHERE user_type IS NULL
  AND auth_user_id IS NULL;

-- Converter "collaborator" para "ATIVO" (colaboradores ativos)
UPDATE mesh_users
SET user_type = 'ATIVO'
WHERE user_type = 'collaborator';

-- Converter NULL para "INATIVO" (tinham auth_user_id mas foram desativados)
UPDATE mesh_users
SET user_type = 'INATIVO'
WHERE user_type IS NULL
  AND auth_user_id IS NOT NULL;

-- 2. Adicionar default e constraint
-- ================================================================

-- Adicionar default 'CANDIDATO' para novos registos
ALTER TABLE mesh_users
ALTER COLUMN user_type SET DEFAULT 'CANDIDATO';

-- Adicionar constraint CHECK para valores válidos
ALTER TABLE mesh_users
ADD CONSTRAINT mesh_users_user_type_valid 
CHECK (user_type IN ('CANDIDATO', 'ATIVO', 'INATIVO', 'agent'));

-- 3. Tornar coluna NOT NULL (agora que todos os registos têm valor)
-- ================================================================

ALTER TABLE mesh_users
ALTER COLUMN user_type SET NOT NULL;

-- 4. Comentários explicativos
-- ================================================================

COMMENT ON COLUMN mesh_users.user_type IS 
'Tipo de utilizador: CANDIDATO (sem conta), ATIVO (colaborador ativo), INATIVO (colaborador desativado), agent (agente)';

-- ================================================================
-- FIM DA MIGRATION
-- ================================================================