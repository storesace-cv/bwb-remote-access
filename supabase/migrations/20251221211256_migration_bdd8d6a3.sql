-- Primeiro: Remover constraint antiga se existir
ALTER TABLE mesh_users DROP CONSTRAINT IF EXISTS check_user_type_valid;
ALTER TABLE mesh_users DROP CONSTRAINT IF EXISTS mesh_users_user_type_valid;