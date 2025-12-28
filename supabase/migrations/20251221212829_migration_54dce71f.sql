-- Aplicar normalização de user_type

-- 1. Remover constraint antiga
ALTER TABLE mesh_users DROP CONSTRAINT IF EXISTS mesh_users_user_type_valid;

-- 2. Normalizar valores existentes
UPDATE mesh_users SET user_type = 'colaborador' WHERE user_type = 'ATIVO';
UPDATE mesh_users SET user_type = 'inactivo' WHERE user_type = 'INATIVO';
UPDATE mesh_users SET user_type = 'candidato' WHERE user_type = 'CANDIDATO';

-- 3. Adicionar constraint normalizada
ALTER TABLE mesh_users
ADD CONSTRAINT mesh_users_user_type_valid 
CHECK (user_type IN ('agent', 'colaborador', 'inactivo', 'candidato'));

-- 4. Atualizar default
ALTER TABLE mesh_users
ALTER COLUMN user_type SET DEFAULT 'candidato';